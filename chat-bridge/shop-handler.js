const { CLASSES, WEAPONS, GEAR_WEAPONS, ARMOR, ACCESSORIES, MONSTERS, TITLES, XP_BOOSTS, EFFECTS, SOUNDS, PROGRESSION_PERKS, findShopItem, normalizeKey } = require("./shop-config");
const { rollDice } = require("./dice");
const { getCombatXpAward } = require("./player-progression");
const {
  getClassRule,
  getTitleRule,
  describePlayerRole,
  getEffectiveShopCost,
  resolveCombatModifiers,
  applyXpRewardRules
} = require("./player-rules");

class ShopHandler {
  constructor(options) {
    this.viewerDb = options.viewerDb;
    this.bossEngine = options.bossEngine;
    this.broadcast = options.broadcast;
    this.announce = options.announce;
    this.onPlayerLevelUp = options.onPlayerLevelUp || (() => {});
    this.getShopUrl = options.getShopUrl || (() => "http://127.0.0.1:8788/guild-shop/");
    this.cooldowns = new Map();
  }

  handleChatCommand(username, messageText) {
    const text = String(messageText || "").trim();
    if (!text.startsWith("!")) {
      return { handled: false };
    }

    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === "!gold") {
      const viewer = this.viewerDb.getViewer(username);
      return {
        handled: true,
        reply: `${username}, you carry ${viewer.gold} gold pieces.`
      };
    }

    if (cmd === "!shop") {
      return {
        handled: true,
        reply: `${username}, guild hall: ${this.getShopUrl(username)}`
      };
    }

    if (cmd === "!class") {
      return this.handleClassCommand(username, parts.slice(1));
    }

    if (cmd === "!title") {
      return this.handleTitleCommand(username, parts.slice(1));
    }

    if (cmd === "!titles") {
      return this.listUnlockedTitles(username);
    }

    if (cmd === "!gear") {
      return this.describeEquippedGear(username);
    }

    if (cmd === "!inventory") {
      return this.describeInventory(username);
    }

    if (cmd === "!equip") {
      const itemKey = parts.slice(1).join(" ");
      return this.equipInventoryItem(username, itemKey);
    }

    if (cmd === "!unequip") {
      const slot = parts[1] || "";
      return this.unequipSlot(username, slot);
    }

    if (cmd === "!buy") {
      const itemKey = parts.slice(1).join(" ");
      return this.buyItem(username, itemKey);
    }

    if (cmd === "!attack" || cmd === "!spell" || cmd === "!smite") {
      return this.combatAttack(username, cmd);
    }

    const viewer = this.viewerDb.getViewer(username);
    const classCfg = CLASSES[viewer.className] || CLASSES.peasant;
    if (classCfg.uniqueCommand && cmd === classCfg.uniqueCommand.toLowerCase()) {
      return this.combatAttack(username, cmd, true);
    }

    return { handled: false };
  }

  getUnlockedClasses(viewer) {
    const unlocked = Array.isArray(viewer?.classData?.unlockedClasses)
      ? viewer.classData.unlockedClasses
      : [];
    const normalized = unlocked
      .map((entry) => normalizeKey(entry))
      .filter(Boolean);

    if (!normalized.length) {
      return ["peasant"];
    }

    return [...new Set(normalized)];
  }

  getUnlockedTitles(viewer) {
    const unlocked = Array.isArray(viewer?.titleData?.unlockedTitles)
      ? viewer.titleData.unlockedTitles
      : [];

    return [...new Set(unlocked.map((entry) => normalizeKey(entry)).filter(Boolean))];
  }

  handleClassCommand(username, args) {
    const viewer = this.viewerDb.getViewer(username);
    const subcommand = normalizeKey(args[0] || "");

    if (!subcommand) {
      return this.describeActiveClass(username, viewer);
    }

    if (subcommand === "list") {
      return this.listUnlockedClasses(username, viewer);
    }

    if (subcommand === "choose") {
      return this.chooseActiveClass(username, viewer, args.slice(1));
    }

    if (subcommand === "clear") {
      return this.clearSecondaryClass(username, viewer, args.slice(1));
    }

    if (subcommand === "info") {
      return this.describeClassInfo(username, args.slice(1).join(" "), viewer);
    }

    return {
      handled: true,
      reply: `${username}, use !class, !class list, !class choose primary [class], !class choose secondary [class], !class clear secondary, or !class info [class].`
    };
  }

  describeActiveClass(username, viewer) {
    const primaryKey = normalizeKey(viewer?.activeClassPrimary || viewer?.classData?.activeClassPrimary || viewer?.className || "peasant") || "peasant";
    const secondaryKey = normalizeKey(viewer?.activeClassSecondary || viewer?.classData?.activeClassSecondary || "");
    const classCfg = CLASSES[primaryKey] || CLASSES.peasant;
    const secondaryCfg = secondaryKey ? (CLASSES[secondaryKey] || getClassRule(secondaryKey)) : null;
    const roleSummary = describePlayerRole(viewer);
    return {
      handled: true,
      reply: `${username}, class loadout: Primary ${classCfg.name}${secondaryCfg ? ` | Secondary ${secondaryCfg.name}` : " | Secondary None"}. ${roleSummary.passiveText}${roleSummary.secondaryClassName ? ` Secondary passive at half strength: ${(secondaryCfg || {}).passiveText || getClassRule(secondaryKey).passiveText}` : ""}`
    };
  }

  listUnlockedClasses(username, viewer) {
    const primaryKey = normalizeKey(viewer?.activeClassPrimary || viewer?.classData?.activeClassPrimary || viewer?.className || "peasant");
    const secondaryKey = normalizeKey(viewer?.activeClassSecondary || viewer?.classData?.activeClassSecondary || "");
    const unlocked = this.getUnlockedClasses(viewer)
      .map((classKey) => {
        const classCfg = CLASSES[classKey] || getClassRule(classKey);
        const tags = [];
        if (primaryKey === normalizeKey(classKey)) {
          tags.push("primary");
        }
        if (secondaryKey === normalizeKey(classKey)) {
          tags.push("secondary");
        }
        return `${classCfg.name}${tags.length ? ` (${tags.join(", ")})` : ""}`;
      })
      .join(" | ");

    return {
      handled: true,
      reply: `${username}, unlocked classes: ${unlocked}`
    };
  }

  chooseActiveClass(username, viewer, rawArgs) {
    const requestedSlot = normalizeKey(rawArgs[0] || "");
    const hasExplicitSlot = requestedSlot === "primary" || requestedSlot === "secondary";
    const slot = hasExplicitSlot ? requestedSlot : "primary";
    const rawClassName = hasExplicitSlot ? rawArgs.slice(1).join(" ") : rawArgs.join(" ");
    const classKey = normalizeKey(rawClassName);
    if (!classKey) {
      return { handled: true, reply: `${username}, usage: !class choose primary [class name] or !class choose secondary [class name].` };
    }

    const classCfg = CLASSES[classKey];
    if (!classCfg) {
      return { handled: true, reply: `${username}, ${rawClassName} is not a known class.` };
    }

    const unlocked = this.getUnlockedClasses(viewer);
    if (!unlocked.includes(classKey)) {
      return { handled: true, reply: `${username}, you have not unlocked ${classCfg.name} yet.` };
    }

    const primaryKey = normalizeKey(viewer?.activeClassPrimary || viewer?.classData?.activeClassPrimary || viewer?.className || "peasant") || "peasant";
    const secondaryKey = normalizeKey(viewer?.activeClassSecondary || viewer?.classData?.activeClassSecondary || "");

    if (slot === "primary") {
      if (primaryKey === classKey) {
        return { handled: true, reply: `${username}, ${classCfg.name} is already your primary class.` };
      }

      this.viewerDb.setClass(username, classKey);
      this.broadcast({ type: "shop_purchase", by: username, itemType: "class", itemName: classCfg.name });
      return {
        handled: true,
        reply: `${username} switched primary class to ${classCfg.name}. ${getClassRule(classKey).passiveText}`
      };
    }

    if (secondaryKey === classKey) {
      return { handled: true, reply: `${username}, ${classCfg.name} is already your secondary class.` };
    }

    if (primaryKey === classKey) {
      return { handled: true, reply: `${username}, ${classCfg.name} is already your primary class, so it cannot also be secondary.` };
    }

    this.viewerDb.setSecondaryClass(username, classKey);
    this.broadcast({ type: "shop_purchase", by: username, itemType: "class", itemName: classCfg.name });
    return {
      handled: true,
      reply: `${username} set secondary class to ${classCfg.name}. Secondary passives apply at half strength.`
    };
  }

  clearSecondaryClass(username, viewer, rawArgs) {
    const target = normalizeKey(rawArgs[0] || "");
    if (target !== "secondary") {
      return { handled: true, reply: `${username}, usage: !class clear secondary.` };
    }

    const secondaryKey = normalizeKey(viewer?.activeClassSecondary || viewer?.classData?.activeClassSecondary || "");
    if (!secondaryKey) {
      return { handled: true, reply: `${username}, no secondary class is set.` };
    }

    const classCfg = CLASSES[secondaryKey] || getClassRule(secondaryKey);
    this.viewerDb.clearSecondaryClass(username);
    return {
      handled: true,
      reply: `${username} cleared secondary class${classCfg?.name ? ` ${classCfg.name}` : ""}.`
    };
  }

  describeClassInfo(username, rawClassName, viewer) {
    const fallbackKey = rawClassName
      ? normalizeKey(rawClassName)
      : normalizeKey(viewer?.activeClassPrimary || viewer?.classData?.activeClassPrimary || viewer.className || "peasant");
    const classCfg = CLASSES[fallbackKey];
    const classRule = getClassRule(fallbackKey);

    if (!classCfg && !classRule) {
      return { handled: true, reply: `${username}, ${rawClassName} is not a known class.` };
    }

    const safeRule = classRule || getClassRule("peasant");
    const safeCfg = classCfg || { name: safeRule.name };
    return {
      handled: true,
      reply: `${safeCfg.name}: ${safeRule.role}. Core stat: ${safeRule.coreStat}. Passive: ${safeRule.passiveText}`
    };
  }

  handleTitleCommand(username, args) {
    const viewer = this.viewerDb.getViewer(username);
    const subcommand = normalizeKey(args[0] || "");

    if (!subcommand) {
      return this.describeActiveTitle(username, viewer);
    }

    if (subcommand === "equip") {
      return this.equipTitle(username, viewer, args.slice(1).join(" "));
    }

    if (subcommand === "info") {
      return this.describeTitleInfo(username, args.slice(1).join(" "), viewer);
    }

    return {
      handled: true,
      reply: `${username}, use !title, !titles, !title equip [title], or !title info [title].`
    };
  }

  describeActiveTitle(username, viewer) {
    const activeKey = normalizeKey(viewer?.title || viewer?.titleData?.activeTitle || "");
    if (!activeKey) {
      return {
        handled: true,
        reply: `${username}, no title is equipped.`
      };
    }

    const titleCfg = TITLES[activeKey] || null;
    const titleRule = getTitleRule(activeKey);
    const safeName = titleCfg?.name || titleRule?.name || viewer?.titleData?.activeTitle || viewer?.title;
    const passiveText = titleRule?.passiveText || titleCfg?.passiveText || "Cosmetic only for now.";
    return {
      handled: true,
      reply: `${username}, active title: ${safeName}. ${passiveText}`
    };
  }

  listUnlockedTitles(username) {
    const viewer = this.viewerDb.getViewer(username);
    const activeKey = normalizeKey(viewer?.title || viewer?.titleData?.activeTitle || "");
    const unlocked = this.getUnlockedTitles(viewer);

    if (!unlocked.length) {
      return {
        handled: true,
        reply: `${username}, you have not unlocked any titles yet.`
      };
    }

    const summary = unlocked
      .map((titleKey) => {
        const titleCfg = TITLES[titleKey] || null;
        const titleRule = getTitleRule(titleKey);
        const type = titleCfg?.titleType || titleRule?.type || "cosmetic";
        const activeTag = activeKey === titleKey ? " (active)" : "";
        return `${titleCfg?.name || titleRule?.name || titleKey} [${type}]${activeTag}`;
      })
      .join(" | ");

    return {
      handled: true,
      reply: `${username}, unlocked titles: ${summary}`
    };
  }

  equipTitle(username, viewer, rawTitleName) {
    const titleKey = normalizeKey(rawTitleName);
    if (!titleKey) {
      return { handled: true, reply: `${username}, usage: !title equip [title name].` };
    }

    const titleCfg = TITLES[titleKey];
    const titleRule = getTitleRule(titleKey);
    if (!titleCfg && !titleRule) {
      return { handled: true, reply: `${username}, ${rawTitleName} is not a known title.` };
    }

    const unlocked = this.getUnlockedTitles(viewer);
    if (!unlocked.includes(titleKey)) {
      return { handled: true, reply: `${username}, you have not unlocked ${(titleCfg || titleRule).name} yet.` };
    }

    if (normalizeKey(viewer?.title || viewer?.titleData?.activeTitle || "") === titleKey) {
      return { handled: true, reply: `${username}, ${(titleCfg || titleRule).name} is already your active title.` };
    }

    this.viewerDb.setTitle(username, titleCfg?.name || titleRule?.name || rawTitleName);
    this.broadcast({ type: "shop_purchase", by: username, itemType: "title", itemName: titleCfg?.name || titleRule?.name || rawTitleName });
    return {
      handled: true,
      reply: `${username} equipped title ${(titleCfg || titleRule).name}. ${(titleRule?.passiveText || titleCfg?.passiveText || "Cosmetic only for now.")}`
    };
  }

  describeTitleInfo(username, rawTitleName, viewer) {
    const fallbackKey = rawTitleName
      ? normalizeKey(rawTitleName)
      : normalizeKey(viewer?.title || viewer?.titleData?.activeTitle || "");

    if (!fallbackKey) {
      return { handled: true, reply: `${username}, usage: !title info [title name].` };
    }

    const titleCfg = TITLES[fallbackKey];
    const titleRule = getTitleRule(fallbackKey);
    if (!titleCfg && !titleRule) {
      return { handled: true, reply: `${username}, ${rawTitleName} is not a known title.` };
    }

    const safeName = titleCfg?.name || titleRule?.name || fallbackKey;
    const safeType = titleCfg?.titleType || titleRule?.type || "cosmetic";
    const safePassive = titleRule?.passiveText || titleCfg?.passiveText || "Cosmetic only for now.";
    const safeDescription = titleCfg?.description || "A collectible adventurer title.";
    return {
      handled: true,
      reply: `${safeName} [${safeType}]: ${safeDescription} Passive: ${safePassive}`
    };
  }

  buyItem(username, rawItemKey) {
    const item = findShopItem(rawItemKey);
    if (!item) {
      return { handled: true, reply: `${username}, that item is unknown.` };
    }

    if (item.itemType === "gear") {
      return this.buyPersistentGear(username, item);
    }

    if (item.purchaseScope === "persistent") {
      return this.buyPersistentUnlock(username, item);
    }

    return this.buySessionItem(username, item);
  }

  buyPersistentGear(username, item) {
    const viewer = this.viewerDb.getViewer(username);
    const pricing = getEffectiveShopCost({ viewer, item, baseCost: item.cost || 0 });
    const alreadyOwned = this.viewerDb.hasInventoryItem(username, item.id || item.key);
    const allowDuplicates = item.duplicatePolicy === "allow";

    if (alreadyOwned && !allowDuplicates) {
      return { handled: true, reply: `${username}, ${item.name} is already in your inventory.` };
    }

    if (!this.viewerDb.canAfford(username, pricing.finalCost)) {
      return { handled: true, reply: `${username}, you need ${pricing.finalCost} gold for ${item.name}.` };
    }

    this.viewerDb.spendGold(username, pricing.finalCost);
    this.viewerDb.addInventoryItem(username, item, { allowDuplicates });
    this.broadcast({
      type: "shop_purchase",
      by: username,
      itemType: item.category || item.itemType || "gear",
      itemName: item.name
    });

    return {
      handled: true,
      reply: `${username} added ${item.name} to their inventory.${item.equipable ? " Equip it later to use its bonus." : ""}`
    };
  }

  buyPersistentUnlock(username, item) {
    const viewer = this.viewerDb.getViewer(username);
    const unlockCollection = item.unlockCollection || "";
    const alreadyOwned = unlockCollection ? this.viewerDb.hasUnlock(username, unlockCollection, item.key) : false;

    if (alreadyOwned) {
      return this.activateOwnedUnlock(username, item, viewer);
    }

    const pricing = getEffectiveShopCost({ viewer, item, baseCost: item.cost || 0 });
    const affordable = this.viewerDb.canAfford(username, pricing.finalCost);
    if (!affordable) {
      return { handled: true, reply: `${username}, you need ${pricing.finalCost} gold for ${item.name}.` };
    }

    this.viewerDb.spendGold(username, pricing.finalCost);
    this.viewerDb.grantUnlock(username, unlockCollection, item.key);

    return this.applyPersistentUnlock(username, item, false);
  }

  buySessionItem(username, item) {
    const viewer = this.viewerDb.getViewer(username);
    const pricing = getEffectiveShopCost({ viewer, item, baseCost: item.cost || 0 });
    const affordable = this.viewerDb.canAfford(username, pricing.finalCost);
    if (!affordable) {
      return { handled: true, reply: `${username}, you need ${pricing.finalCost} gold for ${item.name}.` };
    }

    this.viewerDb.spendGold(username, pricing.finalCost);

    if (MONSTERS[item.key]) {
      const spawn = this.bossEngine.spawnBossByKey(item.key, username);
      if (!spawn.ok) {
        this.viewerDb.addGold(username, pricing.finalCost);
        if (spawn.reason === "not-ready") {
          const needed = Number(spawn.requiredArmed || 0);
          return {
            handled: true,
            reply: `${username}, ${item.name} is locked until at least ${needed} armed adventurer${needed === 1 ? "" : "s"} are active.`
          };
        }
        return { handled: true, reply: `${username}, a boss is already active.` };
      }

      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "summon", itemName: item.name });
      return { handled: true, reply: `${username} summoned ${item.name}.` };
    }

    if (XP_BOOSTS[item.key]) {
      this.broadcast({
        type: "shop_xpboost",
        by: username,
        itemName: item.name,
        multiplier: item.multiplier,
        durationMs: item.durationMs,
        endsAt: Date.now() + item.durationMs
      });
      return { handled: true, reply: `${username} triggered ${item.name} (${item.multiplier}x XP).` };
    }

    if (EFFECTS[item.key]) {
      this.broadcast({ type: "shop_effect", by: username, effectKey: item.key, itemName: item.name });
      return { handled: true, reply: `${username} invoked ${item.name}.` };
    }

    if (SOUNDS[item.key]) {
      this.broadcast({ type: "shop_sound", by: username, soundKey: item.key, itemName: item.name });
      return { handled: true, reply: `${username} played ${item.name}.` };
    }

    return { handled: true, reply: `${username} bought ${item.name}.` };
  }

  activateOwnedUnlock(username, item, viewer) {
    if (CLASSES[item.key]) {
      if (viewer.className === item.key) {
        return { handled: true, reply: `${username}, ${item.name} is already your active class.` };
      }

      this.viewerDb.setClass(username, item.key);
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "class", itemName: item.name });
      return { handled: true, reply: `${username} switched to ${item.name}.` };
    }

    if (WEAPONS[item.key]) {
      if (viewer.weapon === item.key) {
        return { handled: true, reply: `${username}, ${item.name} is already equipped.` };
      }

      this.viewerDb.setWeapon(username, item.key);
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "weapon", itemName: item.name });
      return { handled: true, reply: `${username} re-equipped ${item.name}.` };
    }

    if (GEAR_WEAPONS[item.key] || ARMOR[item.key] || ACCESSORIES[item.key]) {
      return { handled: true, reply: `${username}, ${item.name} is already in your inventory and can be equipped later.` };
    }

    if (TITLES[item.key]) {
      if (viewer.title === item.name) {
        return { handled: true, reply: `${username}, ${item.name} is already your active title.` };
      }

      this.viewerDb.setTitle(username, item.name);
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "title", itemName: item.name });
      return { handled: true, reply: `${username} reactivated title: ${item.name}.` };
    }

    if (PROGRESSION_PERKS[item.key]) {
      return { handled: true, reply: `${username}, ${item.name} is already unlocked.` };
    }

    return { handled: true, reply: `${username}, ${item.name} is already unlocked.` };
  }

  applyPersistentUnlock(username, item, isReactivation) {
    if (CLASSES[item.key]) {
      this.viewerDb.setClass(username, item.key);
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "class", itemName: item.name });
      return { handled: true, reply: isReactivation ? `${username} switched to ${item.name}.` : `${username} is now a ${item.name}.` };
    }

    if (WEAPONS[item.key]) {
      this.viewerDb.setWeapon(username, item.key);
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "weapon", itemName: item.name });
      return { handled: true, reply: isReactivation ? `${username} re-equipped ${item.name}.` : `${username} equipped ${item.name}.` };
    }

    if (GEAR_WEAPONS[item.key] || ARMOR[item.key] || ACCESSORIES[item.key]) {
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.category || item.itemType || "gear", itemName: item.name });
      return { handled: true, reply: `${username} added ${item.name} to their inventory.` };
    }

    if (TITLES[item.key]) {
      this.viewerDb.setTitle(username, item.name);
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "title", itemName: item.name });
      return { handled: true, reply: isReactivation ? `${username} reactivated title: ${item.name}.` : `${username} unlocked title: ${item.name}.` };
    }

    if (PROGRESSION_PERKS[item.key]) {
      this.broadcast({ type: "shop_purchase", by: username, itemType: item.itemType || "perk", itemName: item.name });
      return { handled: true, reply: `${username} unlocked ${item.name}.` };
    }

    return { handled: true, reply: `${username} bought ${item.name}.` };
  }

  getInventoryEntries(viewer) {
    return Array.isArray(viewer?.inventory) ? viewer.inventory : [];
  }

  getInventoryItemLabel(item) {
    if (!item) {
      return "Empty";
    }

    const rarity = item.rarity ? ` ${String(item.rarity).toLowerCase()}` : "";
    const quantity = Number(item.quantity || 1) > 1 ? ` x${Number(item.quantity || 1)}` : "";
    return `${item.name} [${item.category}${rarity}]${quantity}`;
  }

  findInventoryItem(viewer, input) {
    const searchKey = normalizeKey(input);
    if (!searchKey) {
      return null;
    }

    return this.getInventoryEntries(viewer).find((item) => {
      const itemId = normalizeKey(item.itemId || item.id || item.key || "");
      const itemName = normalizeKey(item.name || "");
      return itemId === searchKey || itemName === searchKey;
    }) || null;
  }

  getEquippedItem(viewer, slot) {
    const safeSlot = normalizeKey(slot);
    const equippedKey = normalizeKey(viewer?.equipment?.[safeSlot] || viewer?.[safeSlot] || "");
    if (!equippedKey) {
      return null;
    }

    const equippedItem = viewer?.equipmentItems?.[safeSlot];
    if (equippedItem && normalizeKey(equippedItem.itemId || equippedItem.id || equippedItem.key || "") === equippedKey) {
      return equippedItem;
    }

    return this.getInventoryEntries(viewer).find((item) => normalizeKey(item.itemId || item.id || item.key || "") === equippedKey) || {
      itemId: equippedKey,
      name: equippedKey,
      category: safeSlot,
      rarity: "legacy",
      quantity: 1
    };
  }

  describeEquippedGear(username) {
    const viewer = this.viewerDb.getViewer(username);
    const weapon = this.getEquippedItem(viewer, "weapon");
    const armor = this.getEquippedItem(viewer, "armor");
    const accessory = this.getEquippedItem(viewer, "accessory");

    return {
      handled: true,
      reply: `${username}, gear - Weapon: ${weapon ? weapon.name : "None"} | Armor: ${armor ? armor.name : "None"} | Accessory: ${accessory ? accessory.name : "None"}.`
    };
  }

  describeInventory(username) {
    const viewer = this.viewerDb.getViewer(username);
    const items = this.getInventoryEntries(viewer);
    if (!items.length) {
      return { handled: true, reply: `${username}, your inventory is empty.` };
    }

    const summary = items
      .slice(0, 8)
      .map((item) => {
        const equipped = normalizeKey(viewer?.equipment?.[item.category] || "") === normalizeKey(item.itemId || item.id || item.key || "") ? " (equipped)" : "";
        return `${this.getInventoryItemLabel(item)}${equipped}`;
      })
      .join(" | ");

    return { handled: true, reply: `${username}, inventory: ${summary}` };
  }

  equipInventoryItem(username, rawItemKey) {
    const viewer = this.viewerDb.getViewer(username);
    const item = this.findInventoryItem(viewer, rawItemKey);
    if (!item) {
      return { handled: true, reply: `${username}, that item is not in your inventory.` };
    }

    const slot = normalizeKey(item.category);
    if (!["weapon", "armor", "accessory"].includes(slot) || !item.equipable) {
      return { handled: true, reply: `${username}, ${item.name} cannot be equipped.` };
    }

    const currentlyEquipped = this.getEquippedItem(viewer, slot);
    const updated = this.viewerDb.setEquipmentSlot(username, slot, item.itemId || item.id || item.key);
    const replacedText = currentlyEquipped && normalizeKey(currentlyEquipped.itemId || currentlyEquipped.id || currentlyEquipped.key || "") !== normalizeKey(item.itemId || item.id || item.key || "")
      ? ` Replaced ${currentlyEquipped.name}.`
      : "";

    this.broadcast({ type: "shop_purchase", by: username, itemType: `${slot}-equip`, itemName: item.name });

    return {
      handled: true,
      reply: `${username} equipped ${item.name} in ${slot}.${replacedText}`
    };
  }

  unequipSlot(username, rawSlot) {
    const slot = normalizeKey(rawSlot);
    if (!["weapon", "armor", "accessory"].includes(slot)) {
      return { handled: true, reply: `${username}, choose weapon, armor, or accessory.` };
    }

    const viewer = this.viewerDb.getViewer(username);
    const equipped = this.getEquippedItem(viewer, slot);
    if (!equipped || !normalizeKey(viewer?.equipment?.[slot] || viewer?.[slot] || "")) {
      return { handled: true, reply: `${username}, no ${slot} is equipped.` };
    }

    this.viewerDb.clearEquipmentSlot(username, slot);
    this.broadcast({ type: "shop_purchase", by: username, itemType: `${slot}-unequip`, itemName: equipped.name });

    return {
      handled: true,
      reply: `${username} unequipped ${equipped.name} from ${slot}.`
    };
  }

  combatAttack(username, command, isUnique = false) {
    const bossState = this.bossEngine.getState();
    if (!bossState.active) {
      return { handled: true, reply: `${username}, there is no active boss.` };
    }

    const now = Date.now();
    const cooldownMs = this.getCooldownMs(command, isUnique);
    const key = `${String(username).toLowerCase()}::${command}`;
    const readyAt = Number(this.cooldowns.get(key) || 0);
    if (now < readyAt) {
      const sec = Math.ceil((readyAt - now) / 1000);
      return { handled: true, reply: `${username}, ${command} is on cooldown for ${sec}s.` };
    }

    const viewer = this.viewerDb.getViewer(username);
    const classCfg = CLASSES[viewer.className] || CLASSES.peasant;
    const weaponCfg = WEAPONS[viewer.weapon] || null;

    if (command === "!smite") {
      if (!this.viewerDb.canAfford(username, 5)) {
        return { handled: true, reply: `${username}, !smite costs 5 gold.` };
      }
      this.viewerDb.spendGold(username, 5);
    }

    const notation = this.getAttackNotation(command, classCfg, weaponCfg, isUnique);
    const roll = rollDice(notation);
    const combatResult = resolveCombatModifiers({
      viewer,
      classKey: classCfg.key,
      weaponKey: weaponCfg?.key || "",
      activeTitle: viewer.title || "",
      command,
      isUnique,
      baseDamage: roll.total
    });
    const applied = this.bossEngine.applyDamage(username, command, combatResult.finalDamage, {
      className: classCfg.key,
      weapon: weaponCfg?.key || "",
      title: viewer.title || "",
      wasCrit: combatResult.wasCrit
    });

    if (!applied.ok) {
      return { handled: true, reply: `${username}, attack failed (${applied.reason}).` };
    }

    this.cooldowns.set(key, now + cooldownMs);
    this.viewerDb.addDamage(username, combatResult.finalDamage);
    const baseXp = getCombatXpAward({
      command,
      isUnique,
      damage: combatResult.finalDamage,
      defeated: applied.defeated
    });
    const xpResult = this.viewerDb.addXp(username, applyXpRewardRules({
      viewer,
      classKey: classCfg.key,
      activeTitle: viewer.title || "",
      baseXp
    }));

    if (xpResult?.leveledUp) {
      this.onPlayerLevelUp({
        username,
        level: xpResult.level,
        previousLevel: xpResult.previousLevel,
        totalXp: xpResult.totalXp,
        xpAwarded: xpResult.xpAwarded,
        levelsGained: xpResult.levelsGained,
        source: "combat"
      });
    }

    const hpText = applied.defeated ? "defeated" : `${applied.hp}/${applied.maxHp}`;
    this.broadcast({
      type: "boss_attack_result",
      by: username,
      command,
      notation,
      damage: combatResult.finalDamage,
      baseDamage: roll.total,
      wasCrit: combatResult.wasCrit,
      hpText
    });

    return {
      handled: true,
      reply: `${username} used ${command} for ${combatResult.finalDamage} damage${combatResult.wasCrit ? " (CRIT)" : ""} (${notation}). Boss HP: ${hpText}.`
    };
  }

  getAttackNotation(command, classCfg, weaponCfg, isUnique) {
    if (command === "!smite") {
      return "25";
    }

    if (isUnique && classCfg.uniqueDice) {
      return classCfg.uniqueDice;
    }

    if (command === "!spell") {
      return classCfg.spellDice;
    }

    if (command === "!attack" && weaponCfg?.attackDice) {
      return weaponCfg.attackDice;
    }

    return classCfg.attackDice;
  }

  getCooldownMs(command, isUnique) {
    if (command === "!attack") return 15000;
    if (command === "!spell") return 30000;
    if (command === "!smite") return 20000;
    if (isUnique) return 45000;
    return 15000;
  }
}

module.exports = {
  ShopHandler
};
