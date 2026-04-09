const fs = require("fs");
const http = require("http");
const path = require("path");
const { SHOP_CATALOG } = require("./shop-config");

const repoRoot = path.resolve(__dirname, "..");
const siteRoot = path.join(repoRoot, "guild-site");

const STATIC_ROUTES = Object.freeze({
  "/guild-shop": "index.html",
  "/guild-shop/": "index.html",
  "/guild-shop/app.js": "app.js",
  "/guild-shop/styles.css": "styles.css"
});

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
});

function normalizePlayerName(input, fallback = "traveler") {
  const safe = String(input || "").trim().toLowerCase();
  return safe || fallback;
}

function mapShopItems(items) {
  return Object.values(items || {})
    .map((item) => ({
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
      effects: item.effects || {}
    }))
    .sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name));
}

function buildCatalogPayload() {
  return {
    permanentUnlocks: {
      classes: mapShopItems(SHOP_CATALOG.permanentUnlocks?.classes),
      weapons: mapShopItems(SHOP_CATALOG.permanentUnlocks?.weapons),
      titles: mapShopItems(SHOP_CATALOG.permanentUnlocks?.titles)
    },
    gear: {
      weapons: mapShopItems(SHOP_CATALOG.gear?.weapons),
      armor: mapShopItems(SHOP_CATALOG.gear?.armor),
      accessories: mapShopItems(SHOP_CATALOG.gear?.accessories)
    },
    temporarySessionBoosts: {
      xpBoosts: mapShopItems(SHOP_CATALOG.temporarySessionBoosts?.xpBoosts)
    },
    consumables: {
      summons: mapShopItems(SHOP_CATALOG.consumables?.summons),
      effects: mapShopItems(SHOP_CATALOG.consumables?.effects),
      sounds: mapShopItems(SHOP_CATALOG.consumables?.sounds)
    }
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
    ownedUnlocks: viewer.ownedUnlocks,
    combat: viewer.combat
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendFile(response, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch (_error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function createLocalGuildSite(options) {
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 8788);
  const viewerDb = options.viewerDb;
  const bossEngine = options.bossEngine;
  const getShopUrl = options.getShopUrl;
  const defaultPlayer = normalizePlayerName(options.defaultPlayer || "traveler", "traveler");

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    if (requestUrl.pathname === "/api/guild/dashboard") {
      const player = normalizePlayerName(requestUrl.searchParams.get("player"), defaultPlayer);
      const viewer = viewerDb.getViewer(player);
      const leaderboard = viewerDb.getTopGold(8).map((entry) => ({
        username: entry.username,
        gold: Number(entry.gold || 0),
        title: viewerDb.getViewer(entry.username)?.title || ""
      }));
      const bossState = bossEngine.getState();

      sendJson(response, 200, {
        runtime: {
          readOnly: true,
          localOnly: true,
          player,
          generatedAt: Date.now(),
          entryUrl: getShopUrl(player),
          views: ["profile", "inventory", "classes", "titles", "shop", "leaderboard"]
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
          nextSpawnAt: Number(bossState.nextSpawnAt || 0)
        } : {
          active: false,
          nextSpawnAt: Number(bossState.nextSpawnAt || 0)
        },
        shop: buildCatalogPayload()
      });
      return;
    }

    const staticFile = STATIC_ROUTES[requestUrl.pathname];
    if (staticFile) {
      sendFile(response, path.join(siteRoot, staticFile));
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  server.listen(port, host, () => {
    console.log(`[bridge] local guild site active at http://${host}:${port}/guild-shop/`);
  });

  server.on("error", (error) => {
    console.error(`[bridge] local guild site error: ${error.message}`);
  });

  return server;
}

module.exports = {
  createLocalGuildSite
};