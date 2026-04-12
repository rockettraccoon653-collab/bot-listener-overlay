const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  SHOP_CATALOG,
  CLASSES,
  WEAPONS,
  TITLES,
  GEAR_WEAPONS,
  ARMOR,
  ACCESSORIES,
  MONSTERS,
  EFFECTS,
  SOUNDS,
  XP_BOOSTS,
  PROGRESSION_PERKS,
  findShopItem,
  normalizeKey
} = require("./shop-config");
const {
  STAT_RULES,
  CLASS_RULES,
  EQUIPMENT_SLOT_RULES,
  getTitleRule,
  getEffectiveShopCost
} = require("./player-rules");
const { PROGRESSION_RULES, getXpRequiredForLevel } = require("./player-progression");
const { ShopHandler } = require("./shop-handler");
const { verifyGuildHallAuthToken } = require("./guild-site-auth");

const CREATION_ALLOWED_CLASSES = new Set(["warrior", "rogue", "mage", "cleric", "ranger"]);

const repoRoot = path.resolve(__dirname, "..");
const siteRoot = path.join(repoRoot, "guild-site");

const STATIC_ROUTES = Object.freeze({
  "/guild-shop": "index.html",
  "/guild-shop/": "index.html",
  "/guild-shop/app.js": "app.js",
  "/guild-shop/config.js": "config.js",
  "/guild-shop/styles.css": "styles.css"
});

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
});

function parseAllowedOrigins(input) {
  const normalizedOrigins = [];

  for (const rawEntry of String(input || "").split(",").map((entry) => entry.trim()).filter(Boolean)) {
    if (rawEntry === "*") {
      normalizedOrigins.push(rawEntry);
      continue;
    }

    try {
      normalizedOrigins.push(new URL(rawEntry).origin);
    } catch (_error) {
      normalizedOrigins.push(rawEntry.replace(/\/+$/, ""));
    }
  }

  return Array.from(new Set(normalizedOrigins));
}

function buildCorsHeaders(request, allowedOrigins) {
  const rawOrigin = String(request.headers.origin || "").trim();
  const origin = rawOrigin ? rawOrigin.replace(/\/+$/, "") : "";
  const responseHeaders = {
    "Vary": "Origin"
  };

  if (!origin) {
    return responseHeaders;
  }

  if (!allowedOrigins.length || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    responseHeaders["Access-Control-Allow-Origin"] = allowedOrigins.includes("*") ? "*" : origin;
    responseHeaders["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    responseHeaders["Access-Control-Allow-Headers"] = "Content-Type";
  }

  return responseHeaders;
}

function normalizePlayerName(input, fallback = "traveler") {
  const safe = String(input || "").trim().toLowerCase();
  return safe || fallback;
}

function normalizeAuthToken(input) {
  return String(input || "").trim();
}

function resolveGuildAccessContext({ requestUrl, payload, defaultPlayer }) {
  const requestedPlayer = normalizePlayerName(payload?.player || requestUrl.searchParams.get("player"), defaultPlayer);
  const authToken = normalizeAuthToken(payload?.authToken || requestUrl.searchParams.get("auth"));

  return {
    player: requestedPlayer,
    authToken,
    canEdit: verifyGuildHallAuthToken(requestedPlayer, authToken)
  };
}

function getUnlockedValues(viewer, collection) {
  if (collection === "classes") {
    return Array.isArray(viewer?.classData?.unlockedClasses) ? viewer.classData.unlockedClasses.map((entry) => normalizeKey(entry)) : [];
  }

  if (collection === "titles") {
    return Array.isArray(viewer?.titleData?.unlockedTitles) ? viewer.titleData.unlockedTitles.map((entry) => normalizeKey(entry)) : [];
  }

  if (collection === "weapons") {
    return Array.isArray(viewer?.permanentUnlocks?.weapons) ? viewer.permanentUnlocks.weapons.map((entry) => normalizeKey(entry)) : [];
  }

  if (collection === "perks") {
    return Array.isArray(viewer?.permanentUnlocks?.perks) ? viewer.permanentUnlocks.perks.map((entry) => normalizeKey(entry)) : [];
  }

  return [];
}

function isItemOwnedByViewer(viewer, item) {
  if (!viewer || !item) {
    return false;
  }

  if (item.itemType === "gear") {
    return (Array.isArray(viewer.inventory) ? viewer.inventory : [])
      .some((entry) => normalizeKey(entry.itemId || entry.id || entry.key || entry.name || "") === normalizeKey(item.id || item.key));
  }

  if (item.unlockCollection) {
    return getUnlockedValues(viewer, item.unlockCollection).includes(normalizeKey(item.key || item.id));
  }

  return false;
}

function isItemEquippedByViewer(viewer, item) {
  if (!viewer || !item) {
    return false;
  }

  if (item.itemType === "gear") {
    const slot = normalizeKey(item.category || item.gearCategory || "");
    return normalizeKey(viewer?.equipment?.[slot] || "") === normalizeKey(item.id || item.key);
  }

  if (CLASSES[item.key]) {
    return normalizeKey(viewer?.classData?.activeClassPrimary || viewer?.className || "peasant") === normalizeKey(item.key);
  }

  if (WEAPONS[item.key]) {
    return normalizeKey(viewer?.weapon || "") === normalizeKey(item.key);
  }

  if (TITLES[item.key]) {
    return normalizeKey(viewer?.title || viewer?.titleData?.activeTitle || "") === normalizeKey(item.name || item.key);
  }

  return false;
}

function buildItemActionState(viewer, item) {
  const owned = isItemOwnedByViewer(viewer, item);
  const active = isItemEquippedByViewer(viewer, item);
  const pricing = getEffectiveShopCost({ viewer, item, baseCost: item.cost || 0 });

  return {
    owned,
    active,
    finalCost: Number(pricing.finalCost || item.cost || 0),
    canAfford: Number(viewer?.gold || viewer?.currency?.gold || 0) >= Number(pricing.finalCost || item.cost || 0),
    actionState: item.itemType === "gear"
      ? active ? "equipped" : owned ? "owned" : "buy"
      : active ? "active" : owned ? "owned" : "buy"
  };
}

function mapShopItems(items, viewer) {
  return Object.values(items || {})
    .map((item) => {
      const baseItem = {
        id: item.id || item.key || "",
        key: item.key || item.id || "",
        name: item.name || item.key || "Unknown",
        cost: Number(item.cost || 0),
        itemType: item.itemType || item.type || "item",
        category: item.category || item.gearCategory || item.shopGroup || "misc",
        rarity: item.rarity || "standard",
        purchaseScope: item.purchaseScope || "persistent",
        duplicatePolicy: item.duplicatePolicy || "owned-once",
        passiveText: item.passiveText || "",
        description: item.description || "",
        titleType: item.titleType || "",
        equipable: Boolean(item.equipable),
        permanent: item.permanent !== false,
        statBonuses: item.statBonuses || {},
        effects: item.effects || {},
        unlockCollection: item.unlockCollection || ""
      };

      return {
        ...baseItem,
        ...buildItemActionState(viewer, item)
      };
    })
    .sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name));
}

function buildCatalogPayload(viewer) {
  return {
    permanentUnlocks: {
      classes: mapShopItems(SHOP_CATALOG.permanentUnlocks?.classes, viewer),
      weapons: mapShopItems(SHOP_CATALOG.permanentUnlocks?.weapons, viewer),
      titles: mapShopItems(SHOP_CATALOG.permanentUnlocks?.titles, viewer)
    },
    gear: {
      weapons: mapShopItems(SHOP_CATALOG.gear?.weapons, viewer),
      armor: mapShopItems(SHOP_CATALOG.gear?.armor, viewer),
      accessories: mapShopItems(SHOP_CATALOG.gear?.accessories, viewer)
    },
    temporarySessionBoosts: {
      xpBoosts: mapShopItems(SHOP_CATALOG.temporarySessionBoosts?.xpBoosts, viewer)
    },
    consumables: {
      summons: mapShopItems(SHOP_CATALOG.consumables?.summons, viewer),
      effects: mapShopItems(SHOP_CATALOG.consumables?.effects, viewer),
      sounds: mapShopItems(SHOP_CATALOG.consumables?.sounds, viewer)
    }
  };
}

function buildEquipmentCatalog(viewer) {
  return {
    weapon: mapShopItems(GEAR_WEAPONS, viewer),
    armor: mapShopItems(ARMOR, viewer),
    accessory: mapShopItems(ACCESSORIES, viewer)
  };
}

function buildClassReference() {
  return Object.values(CLASS_RULES)
    .map((classRule) => ({
      key: classRule.key,
      name: classRule.name,
      role: classRule.role,
      fantasy: classRule.fantasy,
      coreStat: classRule.coreStat,
      passiveLabel: classRule.passiveLabel,
      passiveText: classRule.passiveText,
      combatImpactNow: classRule.combatImpactNow,
      rewardImpactNow: classRule.rewardImpactNow,
      shopImpactNow: classRule.shopImpactNow,
      bonuses: classRule.bonuses,
      creationEligible: CREATION_ALLOWED_CLASSES.has(classRule.key)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildStatReference() {
  return Object.entries(STAT_RULES).map(([key, rule]) => ({
    key,
    label: rule.label,
    meaning: rule.meaning,
    affectsNow: rule.affectsNow || [],
    futureHooks: rule.futureHooks || []
  }));
}

function buildTitleReference() {
  return Object.values(TITLES)
    .map((title) => {
      const titleRule = getTitleRule(title.key);
      return {
        key: title.key,
        name: title.name,
        type: title.titleType || titleRule?.type || "cosmetic",
        passiveText: title.passiveText || titleRule?.passiveText || "Cosmetic only for now.",
        description: title.description || ""
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildHelpPayload() {
  return {
    stats: buildStatReference(),
    classes: buildClassReference(),
    systems: [
      {
        key: "gold",
        title: "Gold",
        body: "Gold is earned from chat activity, boss rewards, and some class or title bonuses. Spend it on classes, titles, weapons, gear, boosts, and summons."
      },
      {
        key: "xp",
        title: "XP and Levels",
        body: `Combat and boss rewards grant XP. Level pacing starts at ${PROGRESSION_RULES.levelBaseXp} XP and increases by ${PROGRESSION_RULES.levelStepXp} XP per level.`,
        details: {
          levelTwoThreshold: getXpRequiredForLevel(1),
          levelThreeThreshold: getXpRequiredForLevel(2)
        }
      },
      {
        key: "gear",
        title: "Gear",
        body: "Owned gear stays in your persistent inventory. Weapons, armor, and accessories can each occupy one equipment slot, and equipped bonuses feed into combat, rewards, or shop discounts."
      },
      {
        key: "shop",
        title: "Shop and Equipment",
        body: "The Guild Hall now supports site-based buying plus gear equip and unequip actions. Chat commands still use the same persistence layer, so either surface stays in sync."
      },
      {
        key: "boss",
        title: "Boss Fights",
        body: "Bosses are community encounters. Players attack through chat commands, deal persistent damage totals, and share gold and XP rewards when the boss falls."
      }
    ],
    commands: [
      "!shop",
      "!gold",
      "!class",
      "!class list",
      "!class choose primary [class]",
      "!class choose secondary [class]",
      "!class clear secondary",
      "!title",
      "!titles",
      "!title equip [title]",
      "!inventory",
      "!gear",
      "!equip [item]",
      "!unequip [slot]",
      "!buy [item]",
      "!attack",
      "!spell",
      "!smite"
    ],
    equipmentSlots: Object.entries(EQUIPMENT_SLOT_RULES).map(([key, rule]) => ({
      key,
      label: rule.label,
      affectsNow: rule.affectsNow || [],
      futureHooks: rule.futureHooks || []
    }))
  };
}

function buildProfilePayload(viewer) {
  if (!viewer) {
    return null;
  }

  return {
    username: viewer.username,
    displayName: viewer.displayName,
    currency: viewer.currency,
    progression: viewer.progression,
    stats: viewer.stats,
    classData: viewer.classData,
    titleData: viewer.titleData,
    inventory: Array.isArray(viewer.inventory) ? viewer.inventory : [],
    equipment: viewer.equipment,
    equipmentItems: viewer.equipmentItems || { weapon: null, armor: null, accessory: null },
    ownedUnlocks: viewer.ownedUnlocks,
    combat: viewer.combat,
    characterProfileComplete: Boolean(viewer.characterProfileComplete),
    characterCreatedAt: Number(viewer.characterCreatedAt || 0)
  };
}

function buildActionFingerprint(viewer, bossEngine) {
  const bossState = bossEngine.getState();
  return JSON.stringify({
    gold: Number(viewer?.gold || viewer?.currency?.gold || 0),
    className: normalizeKey(viewer?.className || viewer?.classData?.activeClassPrimary || ""),
    weapon: normalizeKey(viewer?.weapon || ""),
    title: normalizeKey(viewer?.title || viewer?.titleData?.activeTitle || ""),
    inventory: Array.isArray(viewer?.inventory) ? viewer.inventory.map((entry) => ({
      itemId: normalizeKey(entry.itemId || entry.id || entry.key || ""),
      quantity: Number(entry.quantity || 1)
    })) : [],
    equipment: viewer?.equipment || {},
    equipmentItems: Object.fromEntries(Object.entries(viewer?.equipmentItems || {}).map(([slot, item]) => [slot, item ? normalizeKey(item.itemId || item.id || item.key || "") : ""])),
    boss: {
      active: Boolean(bossState.active),
      key: String(bossState.bossKey || ""),
      hp: Number(bossState.hp || 0)
    }
  });
}

function buildActionResponse({ ok, message, player, canEdit, viewerDb, bossEngine, getShopUrl, getPublicShopUrl }) {
  const viewer = viewerDb.getViewer(player);
  return {
    ok,
    message,
    dashboard: buildDashboardPayload({ player, viewer, viewerDb, bossEngine, getShopUrl, getPublicShopUrl, canEdit })
  };
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendFile(response, filePath, headers = {}) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      ...headers
    });
    response.end(content);
  } catch (_error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...headers });
    response.end("Not found");
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 128) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function buildDashboardPayload({ player, viewer, viewerDb, bossEngine, getShopUrl, getPublicShopUrl, canEdit = false }) {
  const leaderboard = viewerDb.getTopGold(8).map((entry) => ({
    username: entry.username,
    gold: Number(entry.gold || 0),
    title: viewerDb.getViewer(entry.username)?.title || ""
  }));
  const bossState = bossEngine.getState();

  return {
    runtime: {
      localOnly: true,
      readOnly: !canEdit,
      canEdit,
      player,
      generatedAt: Date.now(),
      entryUrl: canEdit ? getShopUrl(player) : getPublicShopUrl(player),
      sections: ["character-creation", "profile", "stats", "classes", "inventory", "equipment", "shop", "help"],
      interactiveScopes: canEdit ? ["character-creation", "site-shop-buy", "site-equip", "site-unequip"] : [],
      scaffoldedScopes: ["site-class-management", "site-title-management"],
      profileAccessLocked: !viewer?.characterProfileComplete
    },
    onboarding: {
      required: !viewer?.characterProfileComplete,
      rules: viewerDb.CHARACTER_CREATION_RULES,
      starterClasses: buildClassReference().filter((entry) => entry.creationEligible)
    },
    profile: buildProfilePayload(viewer),
    leaderboard,
    boss: bossState.active ? {
      active: true,
      key: bossState.bossKey,
      name: bossState.bossName,
      hp: bossState.hp,
      maxHp: bossState.maxHp,
      tier: bossState.tier,
      summonedBy: bossState.summonedBy,
      nextSpawnAt: Number(bossState.nextSpawnAt || 0),
      cooldownMs: Number(bossState.cooldownMs || 0)
    } : {
      active: false,
      nextSpawnAt: Number(bossState.nextSpawnAt || 0),
      cooldownMs: Number(bossState.cooldownMs || 0)
    },
    shop: buildCatalogPayload(viewer),
    equipmentCatalog: buildEquipmentCatalog(viewer),
    help: buildHelpPayload()
  };
}

function createLocalGuildSite(options) {
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 8788);
  const allowedOrigins = parseAllowedOrigins(options.allowedOrigins || process.env.GUILD_HALL_ALLOWED_ORIGINS || "");
  const viewerDb = options.viewerDb;
  const bossEngine = options.bossEngine;
  const getShopUrl = options.getShopUrl;
  const getPublicShopUrl = options.getPublicShopUrl || ((player) => getShopUrl(player));
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : () => {};
  const defaultPlayer = normalizePlayerName(options.defaultPlayer || "traveler", "traveler");
  const shopHandler = new ShopHandler({
    viewerDb,
    bossEngine,
    broadcast,
    announce: () => {},
    getShopUrl
  });
  const overlayEventClients = new Set();
  const overlayEventBacklog = [];

  function pushOverlayEvent(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const serialized = JSON.stringify(payload);
    overlayEventBacklog.push(serialized);
    if (overlayEventBacklog.length > 40) {
      overlayEventBacklog.shift();
    }

    for (const client of overlayEventClients) {
      try {
        client.write(`data: ${serialized}\n\n`);
      } catch (_error) {
        overlayEventClients.delete(client);
      }
    }
  }

  const overlayHeartbeat = setInterval(() => {
    for (const client of overlayEventClients) {
      try {
        client.write(": keepalive\n\n");
      } catch (_error) {
        overlayEventClients.delete(client);
      }
    }
  }, 20000);

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    const corsHeaders = buildCorsHeaders(request, allowedOrigins);

    if (request.method === "OPTIONS" && (requestUrl.pathname.startsWith("/api/guild/") || requestUrl.pathname.startsWith("/api/overlay/"))) {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/overlay/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
        ...corsHeaders
      });

      response.write(": connected\n\n");

      for (const serialized of overlayEventBacklog) {
        response.write(`data: ${serialized}\n\n`);
      }

      overlayEventClients.add(response);
      request.on("close", () => {
        overlayEventClients.delete(response);
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/guild/dashboard") {
      const access = resolveGuildAccessContext({ requestUrl, defaultPlayer });
      const player = access.player;
      const viewer = viewerDb.getViewer(player);
      sendJson(response, 200, buildDashboardPayload({
        player,
        viewer,
        viewerDb,
        bossEngine,
        getShopUrl,
        getPublicShopUrl,
        canEdit: access.canEdit
      }), corsHeaders);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/guild/character/create") {
      try {
        const payload = await readRequestBody(request);
        const access = resolveGuildAccessContext({ requestUrl, payload, defaultPlayer });
        const player = access.player;
        if (!access.canEdit) {
          sendJson(response, 403, buildActionResponse({
            ok: false,
            message: "You can only edit your own Guild Hall profile.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }
        const classKey = String(payload.classKey || "").trim().toLowerCase();
        const classRule = CLASS_RULES[classKey];
        if (!classRule || classKey === "peasant") {
          sendJson(response, 400, {
            ok: false,
            errors: ["Choose a valid starting class."]
          }, corsHeaders);
          return;
        }

        const result = viewerDb.initializeCharacterProfile(player, {
          classKey,
          stats: payload.stats
        });

        if (!result.ok) {
          sendJson(response, 400, result, corsHeaders);
          return;
        }

        sendJson(response, 200, {
          ok: true,
          profile: buildProfilePayload(result.viewer),
          onboarding: {
            required: false,
            rules: viewerDb.CHARACTER_CREATION_RULES
          },
          entryUrl: getShopUrl(player)
        }, corsHeaders);
        return;
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          errors: [error.message || "Unable to create character."]
        }, corsHeaders);
        return;
      }
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/guild/shop/buy") {
      try {
        const payload = await readRequestBody(request);
        const access = resolveGuildAccessContext({ requestUrl, payload, defaultPlayer });
        const player = access.player;
        if (!access.canEdit) {
          sendJson(response, 403, buildActionResponse({
            ok: false,
            message: "You can only edit your own Guild Hall profile.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }
        const viewer = viewerDb.getViewer(player);
        if (!viewer?.characterProfileComplete) {
          sendJson(response, 403, buildActionResponse({
            ok: false,
            message: "Finish character creation before using the shop.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }
        const itemKey = String(payload.itemKey || "").trim();
        const knownItem = findShopItem(itemKey);
        if (!knownItem) {
          sendJson(response, 400, buildActionResponse({
            ok: false,
            message: "That item is not in the guild catalog.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }

        const beforeViewer = viewerDb.getViewer(player);
        const beforeFingerprint = buildActionFingerprint(beforeViewer, bossEngine);
        const action = shopHandler.buyItem(player, itemKey);
        const afterViewer = viewerDb.getViewer(player);
        const afterFingerprint = buildActionFingerprint(afterViewer, bossEngine);
        const ok = beforeFingerprint !== afterFingerprint;

        sendJson(response, ok ? 200 : 400, buildActionResponse({
          ok,
          message: action.reply || `${player} could not buy ${knownItem.name}.`,
          player,
          canEdit: access.canEdit,
          viewerDb,
          bossEngine,
          getShopUrl,
          getPublicShopUrl
        }), corsHeaders);
        return;
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          message: error.message || "Unable to buy item."
        }, corsHeaders);
        return;
      }
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/guild/equipment/equip") {
      try {
        const payload = await readRequestBody(request);
        const access = resolveGuildAccessContext({ requestUrl, payload, defaultPlayer });
        const player = access.player;
        if (!access.canEdit) {
          sendJson(response, 403, buildActionResponse({
            ok: false,
            message: "You can only edit your own Guild Hall profile.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }
        const viewer = viewerDb.getViewer(player);
        if (!viewer?.characterProfileComplete) {
          sendJson(response, 403, buildActionResponse({
            ok: false,
            message: "Finish character creation before equipping gear.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }
        const itemKey = String(payload.itemKey || "").trim();
        const beforeViewer = viewerDb.getViewer(player);
        const beforeFingerprint = buildActionFingerprint(beforeViewer, bossEngine);
        const action = shopHandler.equipInventoryItem(player, itemKey);
        const afterViewer = viewerDb.getViewer(player);
        const afterFingerprint = buildActionFingerprint(afterViewer, bossEngine);
        const ok = beforeFingerprint !== afterFingerprint;

        sendJson(response, ok ? 200 : 400, buildActionResponse({
          ok,
          message: action.reply || `${player} could not equip that item.`,
          player,
          canEdit: access.canEdit,
          viewerDb,
          bossEngine,
          getShopUrl,
          getPublicShopUrl
        }), corsHeaders);
        return;
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          message: error.message || "Unable to equip item."
        }, corsHeaders);
        return;
      }
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/guild/equipment/unequip") {
      try {
        const payload = await readRequestBody(request);
        const access = resolveGuildAccessContext({ requestUrl, payload, defaultPlayer });
        const player = access.player;
        if (!access.canEdit) {
          sendJson(response, 403, buildActionResponse({
            ok: false,
            message: "You can only edit your own Guild Hall profile.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }
        const viewer = viewerDb.getViewer(player);
        if (!viewer?.characterProfileComplete) {
          sendJson(response, 403, buildActionResponse({
            ok: false,
            message: "Finish character creation before changing equipment.",
            player,
            canEdit: access.canEdit,
            viewerDb,
            bossEngine,
            getShopUrl,
            getPublicShopUrl
          }), corsHeaders);
          return;
        }
        const slot = String(payload.slot || "").trim();
        const beforeViewer = viewerDb.getViewer(player);
        const beforeFingerprint = buildActionFingerprint(beforeViewer, bossEngine);
        const action = shopHandler.unequipSlot(player, slot);
        const afterViewer = viewerDb.getViewer(player);
        const afterFingerprint = buildActionFingerprint(afterViewer, bossEngine);
        const ok = beforeFingerprint !== afterFingerprint;

        sendJson(response, ok ? 200 : 400, buildActionResponse({
          ok,
          message: action.reply || `${player} could not unequip that slot.`,
          player,
          canEdit: access.canEdit,
          viewerDb,
          bossEngine,
          getShopUrl,
          getPublicShopUrl
        }), corsHeaders);
        return;
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          message: error.message || "Unable to unequip item."
        }, corsHeaders);
        return;
      }
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" }, corsHeaders);
      return;
    }

    const staticFile = STATIC_ROUTES[requestUrl.pathname];
    if (staticFile) {
      sendFile(response, path.join(siteRoot, staticFile), corsHeaders);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders });
    response.end("Not found");
  });

  server.listen(port, host, () => {
    console.log(`[bridge] local guild site active at http://${host}:${port}/guild-shop/`);
  });

  server.on("error", (error) => {
    console.error(`[bridge] local guild site error: ${error.message}`);
  });

  server.on("close", () => {
    clearInterval(overlayHeartbeat);
    for (const client of overlayEventClients) {
      try {
        client.end();
      } catch (_error) {
        // ignore best-effort cleanup
      }
    }
    overlayEventClients.clear();
  });

  server.publishOverlayEvent = pushOverlayEvent;

  return server;
}

module.exports = {
  createLocalGuildSite
};