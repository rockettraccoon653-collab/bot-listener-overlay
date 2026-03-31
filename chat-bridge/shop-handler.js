const { CLASSES, WEAPONS, MONSTERS, TITLES, XP_BOOSTS, EFFECTS, SOUNDS, findShopItem } = require("./shop-config");
const { rollDice } = require("./dice");

class ShopHandler {
  constructor(options) {
    this.viewerDb = options.viewerDb;
    this.bossEngine = options.bossEngine;
    this.broadcast = options.broadcast;
    this.announce = options.announce;
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
        reply: "Shop: !buy fighter | !buy mage | !buy blood-sword | !buy xp-boost | !buy goblin"
      };
    }

    if (cmd === "!class") {
      const viewer = this.viewerDb.getViewer(username);
      const classCfg = CLASSES[viewer.className] || CLASSES.peasant;
      const weaponCfg = WEAPONS[viewer.weapon] || null;
      return {
        handled: true,
        reply: `${username}, class: ${classCfg.name}${weaponCfg ? `, weapon: ${weaponCfg.name}` : ""}.`
      };
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

  buyItem(username, rawItemKey) {
    const item = findShopItem(rawItemKey);
    if (!item) {
      return { handled: true, reply: `${username}, that item is unknown.` };
    }

    const affordable = this.viewerDb.canAfford(username, item.cost || 0);
    if (!affordable) {
      return { handled: true, reply: `${username}, you need ${item.cost} gold for ${item.name}.` };
    }

    this.viewerDb.spendGold(username, item.cost || 0);

    if (CLASSES[item.key]) {
      this.viewerDb.setClass(username, item.key);
      this.broadcast({ type: "shop_purchase", by: username, itemType: "class", itemName: item.name });
      return { handled: true, reply: `${username} is now a ${item.name}.` };
    }

    if (WEAPONS[item.key]) {
      this.viewerDb.setWeapon(username, item.key);
      this.broadcast({ type: "shop_purchase", by: username, itemType: "weapon", itemName: item.name });
      return { handled: true, reply: `${username} equipped ${item.name}.` };
    }

    if (MONSTERS[item.key]) {
      const spawn = this.bossEngine.spawnBossByKey(item.key, username);
      if (!spawn.ok) {
        this.viewerDb.addGold(username, item.cost || 0);
        if (spawn.reason === "not-ready") {
          const needed = Number(spawn.requiredArmed || 0);
          return {
            handled: true,
            reply: `${username}, ${item.name} is locked until at least ${needed} armed adventurer${needed === 1 ? "" : "s"} are active.`
          };
        }
        return { handled: true, reply: `${username}, a boss is already active.` };
      }

      this.broadcast({ type: "shop_purchase", by: username, itemType: "summon", itemName: item.name });
      return { handled: true, reply: `${username} summoned ${item.name}.` };
    }

    if (TITLES[item.key]) {
      this.viewerDb.setTitle(username, item.name);
      this.broadcast({ type: "shop_purchase", by: username, itemType: "title", itemName: item.name });
      return { handled: true, reply: `${username} unlocked title: ${item.name}.` };
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
    const applied = this.bossEngine.applyDamage(username, command, roll.total, {
      className: classCfg.key,
      weapon: weaponCfg?.key || "",
      title: viewer.title || ""
    });

    if (!applied.ok) {
      return { handled: true, reply: `${username}, attack failed (${applied.reason}).` };
    }

    this.cooldowns.set(key, now + cooldownMs);
    this.viewerDb.addDamage(username, roll.total);

    const hpText = applied.defeated ? "defeated" : `${applied.hp}/${applied.maxHp}`;
    this.broadcast({
      type: "boss_attack_result",
      by: username,
      command,
      notation,
      damage: roll.total,
      hpText
    });

    return {
      handled: true,
      reply: `${username} used ${command} for ${roll.total} damage (${notation}). Boss HP: ${hpText}.`
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
