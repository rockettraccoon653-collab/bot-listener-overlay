const https = require("https");
const tmi = require("tmi.js");
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");
const SockJS = require("sockjs-client");
const OBSWebSocketModule = require("obs-websocket-js");
const viewerDb = require("./viewer-db");
const { BossEngine } = require("./boss-engine");
const { ShopHandler } = require("./shop-handler");
const { createLocalGuildSite } = require("./local-site");
const { toOverlayRelayEvents } = require("./overlay-relay");
const { MONSTERS, normalizeKey } = require("./shop-config");
const { getBossParticipationXp } = require("./player-progression");
const { applyGoldRewardRules, applyXpRewardRules } = require("./player-rules");
const { buildGuildHallUrl, createGuildHallAuthToken } = require("./guild-site-auth");
require("dotenv").config();

const OBSWebSocket = OBSWebSocketModule.default || OBSWebSocketModule;
const EventSubscription = OBSWebSocketModule.EventSubscription || OBSWebSocket.EventSubscription || {};

const REQUIRED_ENV = [
  "TWITCH_BOT_USERNAME",
  "TWITCH_BOT_OAUTH_TOKEN",
  "TWITCH_CHANNEL",
  "TWITCH_EXTENSION_CLIENT_ID",
  "TWITCH_EXTENSION_OWNER_USER_ID",
  "TWITCH_EXTENSION_SECRET_BASE64",
  "TWITCH_BROADCASTER_ID"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[bridge] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const MIN_RELAY_LENGTH = Number(process.env.MIN_RELAY_LENGTH || 4);
const MAX_RELAY_PER_10S = Number(process.env.MAX_RELAY_PER_10S || 18);
const STATE_BROADCAST_INTERVAL_MS = Math.max(5000, Number(process.env.STATE_BROADCAST_INTERVAL_MS || 15000));
const LOCAL_WS_ENABLED = String(process.env.LOCAL_WS_ENABLED || "true").toLowerCase() !== "false";
const LOCAL_WS_PORT = Number(process.env.LOCAL_WS_PORT || 8787);
const LOCAL_WS_DEBUG = String(process.env.LOCAL_WS_DEBUG || "true").toLowerCase() !== "false";
const LOCAL_SITE_ENABLED = String(process.env.LOCAL_SITE_ENABLED || "true").toLowerCase() !== "false";
const LOCAL_SITE_HOST = process.env.LOCAL_SITE_HOST || "127.0.0.1";
const LOCAL_SITE_PORT = Number(process.env.LOCAL_SITE_PORT || 8788);
const ALLOW_ADMIN_MODS = String(process.env.ALLOW_ADMIN_MODS || "true").toLowerCase() !== "false";
const SCENE_RELAY_PROVIDER = String(process.env.SCENE_RELAY_PROVIDER || "streamlabs").toLowerCase();

const STREAMLABS_SCENE_RELAY_ENABLED = String(process.env.STREAMLABS_SCENE_RELAY_ENABLED || "true").toLowerCase() !== "false";
const STREAMLABS_API_URL = process.env.STREAMLABS_API_URL || "http://127.0.0.1:59650/api";
const STREAMLABS_API_TOKEN = process.env.STREAMLABS_API_TOKEN || process.env.OBS_WS_PASSWORD || "";
const STREAMLABS_SCENE_POLL_MS = Number(process.env.STREAMLABS_SCENE_POLL_MS || 1250);
const STREAMLABS_RECONNECT_MS = Number(process.env.STREAMLABS_RECONNECT_MS || 5000);

const OBS_SCENE_RELAY_ENABLED = String(process.env.OBS_SCENE_RELAY_ENABLED || "false").toLowerCase() !== "false";
const OBS_WS_URL = process.env.OBS_WS_URL || "ws://127.0.0.1:4455";
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD || process.env.OBS_WS_TOKEN || process.env.STREAMLABS_API_TOKEN || "";
const OBS_RECONNECT_MS = Number(process.env.OBS_RECONNECT_MS || 5000);
const OBS_CONNECT_TIMEOUT_MS = Number(process.env.OBS_CONNECT_TIMEOUT_MS || 8000);
const relayWindow = {
  startedAt: Date.now(),
  count: 0
};

const chatGoldWindow = new Map();
let relayInstanceId = `${process.pid}-${Date.now().toString(36)}`;
let relaySequence = 0;
let activeXpBoostEndsAt = 0;
const recentPurchases = [];
const ADMIN_COMMANDS = new Set(["!spawnboss", "!clearboss", "!resetsession", "!givegold", "!testevent"]);

const CHAT_GOLD_RULES = {
  cooldownMs: 120000,
  minLength: 6,
  minWords: 2,
  goldPerReward: 1
};

let localWss = null;
let localGuildSite = null;
let obsClient = null;
let obsReconnectTimer = null;
let streamlabsClient = null;
let streamlabsReconnectTimer = null;
let streamlabsPollTimer = null;
let streamlabsRpcId = 1;
let activeSceneId = null;
let localWsClientId = 0;
let currentSceneSnapshot = null;
let lastLocalOverlayEvent = null;
const recentLocalOverlayEvents = [];
const streamlabsPending = new Map();

function resetRelaySessionState() {
  chatGoldWindow.clear();
  relayWindow.startedAt = Date.now();
  relayWindow.count = 0;
  activeXpBoostEndsAt = 0;
  recentPurchases.length = 0;
  activeSceneId = null;
  currentSceneSnapshot = null;
  lastLocalOverlayEvent = null;
  recentLocalOverlayEvents.length = 0;
}

function beginRelaySession(preserveScene = false) {
  const sceneSnapshot = preserveScene ? currentSceneSnapshot : null;
  const sceneId = preserveScene ? activeSceneId : null;

  relayInstanceId = `${process.pid}-${Date.now().toString(36)}`;
  relaySequence = 0;
  resetRelaySessionState();
  currentSceneSnapshot = sceneSnapshot;
  activeSceneId = sceneId;
}

function sanitizeUsername(rawUsername) {
  const safe = String(rawUsername || "").trim();
  return safe || "traveler";
}

function getPublicLocalShopUrl(username = "") {
  return buildGuildHallUrl({
    host: LOCAL_SITE_HOST,
    port: LOCAL_SITE_PORT,
    player: username
  });
}

function getLocalShopUrl(username = "") {
  const safeUser = String(username || "").trim().toLowerCase();
  return buildGuildHallUrl({
    host: LOCAL_SITE_HOST,
    port: LOCAL_SITE_PORT,
    player: safeUser,
    authToken: safeUser ? createGuildHallAuthToken(safeUser) : ""
  });
}

function normalizeBossLookup(rawBossName) {
  const candidate = normalizeKey(rawBossName);
  if (!candidate) {
    return "";
  }

  if (MONSTERS[candidate]) {
    return candidate;
  }

  const matchedBoss = Object.values(MONSTERS).find((boss) => normalizeKey(boss.name) === candidate);
  return matchedBoss ? matchedBoss.key : "";
}

function getBadgeValue(tags, badgeKey) {
  const badges = tags && typeof tags.badges === "object" ? tags.badges : {};
  return String(badges[badgeKey] || "");
}

function isBroadcaster(tags, username) {
  const normalizedUser = String(tags?.username || username || "").trim().toLowerCase();
  const normalizedChannel = String(process.env.TWITCH_CHANNEL || "").trim().toLowerCase();
  return getBadgeValue(tags, "broadcaster") === "1" || normalizedUser === normalizedChannel;
}

function isModerator(tags) {
  return Boolean(tags?.mod) || getBadgeValue(tags, "moderator") === "1" || getBadgeValue(tags, "mod") === "1";
}

function canRunAdminCommand(tags, username) {
  return isBroadcaster(tags, username) || (ALLOW_ADMIN_MODS && isModerator(tags));
}

function isAdminCommand(messageText) {
  const command = String(messageText || "").trim().split(/\s+/)[0].toLowerCase();
  return ADMIN_COMMANDS.has(command);
}

async function broadcastOverlay(payload) {
  rememberRuntimeState(payload);
  const stamped = stampRelayPayload(payload);
  broadcastLocalPayloads(payload);

  try {
    await postExtensionBroadcast(stamped);
  } catch (error) {
    console.error("[bridge] extension broadcast failed:", error.message);
  }
}

function broadcastPlayerLevelUp(payload) {
  const safePayload = {
    type: "player_level_up",
    username: payload.username,
    level: Number(payload.level || 1),
    previousLevel: Number(payload.previousLevel || 1),
    totalXp: Number(payload.totalXp || 0),
    xpAwarded: Number(payload.xpAwarded || 0),
    levelsGained: Number(payload.levelsGained || 0),
    source: String(payload.source || "progression")
  };

  console.log(`[bridge][progression] ${safePayload.username} reached level ${safePayload.level} (+${safePayload.xpAwarded} XP, ${safePayload.source})`);
  broadcastOverlay(safePayload).catch((error) => {
    console.error("[bridge][progression] level-up broadcast failed:", error.message);
  });
}

function rememberRuntimeState(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (payload.type === "shop_xpboost") {
    activeXpBoostEndsAt = Math.max(0, Number(payload.endsAt || payload.expiresAt || 0));
    return;
  }

  if (payload.type === "shop_purchase" && payload.by && payload.itemName) {
    recentPurchases.unshift({
      who: String(payload.by || ""),
      itemName: String(payload.itemName || ""),
      itemType: String(payload.itemType || ""),
      at: Date.now()
    });

    if (recentPurchases.length > 5) {
      recentPurchases.length = 5;
    }
  }
}

function stampRelayPayload(payload) {
  relaySequence += 1;
  return {
    ...payload,
    relayMeta: {
      id: `${relayInstanceId}-${relaySequence}`,
      instanceId: relayInstanceId,
      seq: relaySequence,
      at: Date.now()
    }
  };
}

async function sendChatReply(channel, reply) {
  if (!reply) {
    return;
  }

  try {
    await chatClient.say(channel, reply);
  } catch (error) {
    console.error("[bridge] failed to send command reply:", error.message);
  }
}

function resetLiveSession(requestedBy = "system") {
  console.log(`[bridge][admin] resetting session requested by ${requestedBy}`);
  bossEngine.resetSession();
  beginRelaySession(true);
  bossEngine.start();

  if (currentSceneSnapshot) {
    broadcastLocal(stampRelayPayload(currentSceneSnapshot));
  }

  broadcastShopState();
}

function handleAdminCommand(username, messageText) {
  const text = String(messageText || "").trim();
  const parts = text.split(/\s+/);
  const command = String(parts[0] || "").toLowerCase();

  if (command === "!spawnboss") {
    const requestedBoss = parts.slice(1).join(" ").trim();
    const bossKey = normalizeBossLookup(requestedBoss);
    const result = requestedBoss
      ? bossEngine.spawnBossByKey(bossKey, username, { force: true })
      : bossEngine.spawnRandomBoss(username, { force: true });

    if (requestedBoss && !bossKey) {
      console.warn(`[bridge][admin] ${username} requested unknown boss '${requestedBoss}'`);
      return { handled: true, reply: `${username}, unknown boss '${requestedBoss}'.` };
    }

    if (!result.ok) {
      console.warn(`[bridge][admin] ${username} failed to spawn boss (${result.reason})`);
      return { handled: true, reply: `${username}, boss spawn failed (${result.reason}).` };
    }

    console.log(`[bridge][admin] ${username} spawned ${result.boss.name}`);
    return { handled: true, reply: `${username} spawned ${result.boss.name}.` };
  }

  if (command === "!clearboss") {
    const result = bossEngine.clearActiveBoss(username, { announce: false });
    if (!result.ok) {
      console.warn(`[bridge][admin] ${username} tried to clear boss with none active`);
      return { handled: true, reply: `${username}, there is no active boss.` };
    }

    console.log(`[bridge][admin] ${username} cleared ${result.bossName}`);
    return { handled: true, reply: `${username} cleared ${result.bossName}.` };
  }

  if (command === "!resetsession") {
    resetLiveSession(username);
    return { handled: true, reply: `${username} reset the live session state.` };
  }

  if (command === "!givegold") {
    const targetUser = sanitizeUsername(parts[1] || "");
    const amount = Math.floor(Number(parts[2] || 0));
    if (!parts[1] || !Number.isFinite(amount) || amount <= 0) {
      return { handled: true, reply: `${username}, usage: !givegold [username] [amount].` };
    }

    const updated = viewerDb.addGold(targetUser, amount);
    console.log(`[bridge][admin] ${username} gave ${amount} gold to ${targetUser}`);
    return { handled: true, reply: `${targetUser} received ${amount} gold and now has ${updated.gold}.` };
  }

  if (command === "!testevent") {
    console.log(`[bridge][admin] ${username} triggered a test overlay event`);
    broadcastOverlay({
      type: "shop_purchase",
      by: username,
      itemType: "admin",
      itemName: "Admin Test Event"
    }).catch((error) => {
      console.error("[bridge][admin] test event broadcast failed:", error.message);
    });
    return { handled: true, reply: `${username} triggered a test overlay event.` };
  }

  return { handled: false };
}

const bossEngine = new BossEngine({
  onBroadcast: (payload) => {
    broadcastOverlay(payload);
  },
  onAnnounce: (messageText) => {
    chatClient.say(process.env.TWITCH_CHANNEL, messageText).catch(() => {});
  },
  onDefeat: ({ fighters, topDealer }) => {
    if (!fighters.length) return;

    const rewardPool = 20;
    const split = Math.max(1, Math.floor(rewardPool / fighters.length));

    for (const fighter of fighters) {
      const fighterViewer = viewerDb.getViewer(fighter.name);
      const goldAward = applyGoldRewardRules({
        viewer: fighterViewer,
        classKey: fighterViewer?.className,
        activeTitle: fighterViewer?.title,
        baseGold: split
      });
      viewerDb.addGold(fighter.name, goldAward);
      const xpAward = applyXpRewardRules({
        viewer: fighterViewer,
        classKey: fighterViewer?.className,
        activeTitle: fighterViewer?.title,
        baseXp: getBossParticipationXp({
          damageDealt: fighter.dealt,
          isTopDealer: fighter.name === topDealer
        })
      });
      const xpResult = viewerDb.addXp(fighter.name, xpAward);

      if (xpResult?.leveledUp) {
        broadcastPlayerLevelUp({
          username: fighter.name,
          level: xpResult.level,
          previousLevel: xpResult.previousLevel,
          totalXp: xpResult.totalXp,
          xpAwarded: xpResult.xpAwarded,
          levelsGained: xpResult.levelsGained,
          source: fighter.name === topDealer ? "boss-defeat-top-dealer" : "boss-defeat"
        });
      }
    }

    if (topDealer) {
      const topDealerViewer = viewerDb.getViewer(topDealer);
      const topDealerBonus = applyGoldRewardRules({
        viewer: topDealerViewer,
        classKey: topDealerViewer?.className,
        activeTitle: topDealerViewer?.title,
        baseGold: 10
      });
      viewerDb.addGold(topDealer, topDealerBonus);
    }

    broadcastOverlay({
      type: "boss_rewards",
      topDealer: topDealer || "",
      split,
      fighters: fighters.map((entry) => entry.name),
      guildXp: 50
    });
  },
  getActiveCount: () => viewerDb.countRecentlyActive(3 * 60 * 1000),
  getCombatReadiness: () => viewerDb.getCombatReadiness(3 * 60 * 1000),
  cooldownMs: Number(process.env.BOSS_COOLDOWN_MS || process.env.BOSS_SPAWN_INTERVAL_MS || 10 * 60 * 1000),
  initialSpawnDelayMs: Number(process.env.BOSS_INITIAL_SPAWN_MS || process.env.BOSS_COOLDOWN_MS || process.env.BOSS_SPAWN_INTERVAL_MS || 10 * 60 * 1000),
  retreatMs: Number(process.env.BOSS_RETREAT_MS || 5 * 60 * 1000)
});

const shopHandler = new ShopHandler({
  viewerDb,
  bossEngine,
  broadcast: (payload) => {
    broadcastOverlay(payload);
  },
  announce: (messageText) => {
    chatClient.say(process.env.TWITCH_CHANNEL, messageText).catch(() => {});
  },
  onPlayerLevelUp: broadcastPlayerLevelUp,
  getShopUrl: getLocalShopUrl
});

if (LOCAL_SITE_ENABLED) {
  localGuildSite = createLocalGuildSite({
    host: LOCAL_SITE_HOST,
    port: LOCAL_SITE_PORT,
    viewerDb,
    bossEngine,
    getPublicShopUrl: getPublicLocalShopUrl,
    broadcast: (payload) => {
      broadcastOverlay(payload);
    },
    getShopUrl: getLocalShopUrl,
    defaultPlayer: process.env.TWITCH_CHANNEL || "traveler"
  });
}

function canAwardChatGold(username, safeMessage) {
  const compact = safeMessage.trim();
  const words = compact.split(/\s+/).filter(Boolean);

  if (compact.length < CHAT_GOLD_RULES.minLength) {
    return false;
  }

  if (words.length < CHAT_GOLD_RULES.minWords) {
    return false;
  }

  const now = Date.now();
  const key = String(username || "").toLowerCase();
  const lastAwarded = Number(chatGoldWindow.get(key) || 0);

  if (now - lastAwarded < CHAT_GOLD_RULES.cooldownMs) {
    return false;
  }

  chatGoldWindow.set(key, now);
  return true;
}

if (LOCAL_WS_ENABLED) {
  localWss = new WebSocketServer({ host: "127.0.0.1", port: LOCAL_WS_PORT });
  localWss.on("listening", () => {
    console.log(`[bridge] local ws relay active at ws://127.0.0.1:${LOCAL_WS_PORT}`);
  });
  localWss.on("connection", (client) => {
    client._relayDebugId = ++localWsClientId;
    logLocalWsEvent("connect", { clientId: client._relayDebugId });
    client.on("message", (rawMessage) => {
      logLocalWsEvent("incoming", rawMessage, `client=${client._relayDebugId}`);
    });
    client.on("close", () => {
      logLocalWsEvent("disconnect", { clientId: client._relayDebugId });
    });
    client.on("error", (error) => {
      console.error(`[bridge][ws][client-error] client=${client._relayDebugId} ${error.message}`);
    });
    sendLocalSnapshot(client);
  });
  localWss.on("error", (error) => {
    console.error("[bridge] local ws error:", error.message);
  });
}

function sendLocalPayload(client, payload) {
  if (!client || client.readyState !== 1) {
    return;
  }

  logLocalWsEvent("outgoing", payload, `client=${client._relayDebugId || "snapshot"}`);
  client.send(JSON.stringify(stampRelayPayload(payload)));
}

function buildShopStatePayload() {
  const leaderboard = viewerDb.getTopGold(5).map((entry) => {
    const viewer = viewerDb.getViewer(entry.username);
    return {
      username: entry.username,
      gold: entry.gold,
      title: (viewer && viewer.title) || ""
    };
  });

  const bossState = bossEngine.getState();
  const xpBoostEndsAt = activeXpBoostEndsAt > Date.now() ? activeXpBoostEndsAt : 0;
  if (!xpBoostEndsAt) {
    activeXpBoostEndsAt = 0;
  }

  return {
    type: "shop_state",
    leaderboard,
    boss: bossState.active ? {
      key: bossState.bossKey,
      name: bossState.bossName,
      hp: bossState.hp,
      maxHp: bossState.maxHp,
      tier: bossState.tier,
      visual: bossState.visual,
      summonedBy: bossState.summonedBy,
      recentFighters: bossState.recentFighters || []
    } : null,
    nextSpawnAt: Number(bossState.nextSpawnAt || 0),
    cooldownMs: Number(bossState.cooldownMs || 0),
    xpBoostEndsAt,
    purchases: recentPurchases.slice(0, 5)
  };
}

function sendLocalSnapshot(client) {
  sendLocalPayload(client, buildLocalStateSyncPayload());
}

function buildLocalStateSyncPayload() {
  const shopState = buildShopStatePayload();

  return {
    type: "state_sync",
    scene: currentSceneSnapshot ? {
      type: currentSceneSnapshot.type,
      sceneName: currentSceneSnapshot.sceneName,
      sceneId: currentSceneSnapshot.sceneId,
      provider: currentSceneSnapshot.provider,
      at: currentSceneSnapshot.at
    } : null,
    boss: shopState.boss,
    shop: shopState,
    recentGuildEvents: recentLocalOverlayEvents.slice(0, 5),
    lastEvent: lastLocalOverlayEvent,
    syncedAt: Date.now()
  };
}

function broadcastLocal(payload) {
  if (!localWss) return;

  const serialized = JSON.stringify(payload);
  for (const client of localWss.clients) {
    if (client.readyState === 1) {
      logLocalWsEvent("outgoing", payload, `client=${client._relayDebugId || "broadcast"}`);
      client.send(serialized);
    }
  }
}

function broadcastLocalPayloads(payload) {
  const localPayloads = buildLocalRelayPayloads(payload);
  for (const localPayload of localPayloads) {
    broadcastLocal(localPayload);
  }
}

function buildLocalRelayPayloads(payload) {
  const localPayloads = toOverlayRelayEvents(payload);
  if (!localPayloads.length) {
    return [];
  }

  rememberLocalOverlayEvents(localPayloads);

  return localPayloads.map((entry) => stampRelayPayload(entry));
}

function rememberLocalOverlayEvents(localPayloads) {
  if (!Array.isArray(localPayloads)) {
    return;
  }

  for (const payload of localPayloads) {
    if (!payload || typeof payload !== "object") {
      continue;
    }

    if (payload.type === "boss_update" || payload.type === "attack" || payload.type === "shop") {
      lastLocalOverlayEvent = payload;
      recentLocalOverlayEvents.unshift(payload);
      if (recentLocalOverlayEvents.length > 5) {
        recentLocalOverlayEvents.length = 5;
      }
    }
  }
}

function logLocalWsEvent(direction, payload, details = "") {
  if (!LOCAL_WS_DEBUG) {
    return;
  }

  let summary = "";
  if (typeof payload === "string" || Buffer.isBuffer(payload)) {
    summary = String(payload);
  } else if (payload && typeof payload === "object") {
    try {
      summary = JSON.stringify(payload);
    } catch (error) {
      summary = String(payload && payload.type || "unknown");
    }
  } else {
    summary = String(payload || "");
  }

  if (summary.length > 400) {
    summary = `${summary.slice(0, 397)}...`;
  }

  const suffix = details ? ` ${details}` : "";
  console.log(`[bridge][ws][${direction}]${suffix} ${summary}`.trim());
}

function scheduleObsReconnect() {
  if (!OBS_SCENE_RELAY_ENABLED) return;
  if (obsReconnectTimer) return;

  obsReconnectTimer = setTimeout(() => {
    obsReconnectTimer = null;
    connectObsSceneRelay();
  }, OBS_RECONNECT_MS);
}

function scheduleStreamlabsReconnect() {
  if (!STREAMLABS_SCENE_RELAY_ENABLED) return;
  if (streamlabsReconnectTimer) return;

  streamlabsReconnectTimer = setTimeout(() => {
    streamlabsReconnectTimer = null;
    connectStreamlabsSceneRelay();
  }, STREAMLABS_RECONNECT_MS);
}

function sendStreamlabsRpc(method, params = {}, onResult) {
  if (!streamlabsClient || streamlabsClient.readyState !== 1) {
    return;
  }

  const id = streamlabsRpcId++;
  if (typeof onResult === "function") {
    streamlabsPending.set(id, onResult);
  }

  streamlabsClient.send(JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params
  }));
}

function broadcastSceneChange(sceneName, sceneId, provider) {
  currentSceneSnapshot = {
    type: "scene_change",
    sceneName,
    sceneId,
    provider,
    at: Date.now()
  };

  broadcastLocal(currentSceneSnapshot);
  console.log(`[bridge] scene changed (${provider}): ${sceneName}`);
}

function handleStreamlabsScenesModel(model) {
  if (!model || typeof model !== "object") {
    return;
  }

  const nextSceneId = model.activeSceneId;
  if (!nextSceneId || nextSceneId === activeSceneId) {
    return;
  }

  activeSceneId = nextSceneId;
  const sceneName = model?.scenes?.[nextSceneId]?.name || nextSceneId;
  broadcastSceneChange(sceneName, nextSceneId, "streamlabs");
}

function stopStreamlabsPolling() {
  if (streamlabsPollTimer) {
    clearInterval(streamlabsPollTimer);
    streamlabsPollTimer = null;
  }
}

function startStreamlabsPolling() {
  stopStreamlabsPolling();
  sendStreamlabsRpc("getModel", { resource: "ScenesService" }, handleStreamlabsScenesModel);
  streamlabsPollTimer = setInterval(() => {
    sendStreamlabsRpc("getModel", { resource: "ScenesService" }, handleStreamlabsScenesModel);
  }, STREAMLABS_SCENE_POLL_MS);
}

function connectStreamlabsSceneRelay() {
  if (!STREAMLABS_SCENE_RELAY_ENABLED) return;

  if (!STREAMLABS_API_TOKEN) {
    console.warn("[bridge] Streamlabs scene relay disabled: STREAMLABS_API_TOKEN is missing.");
    return;
  }

  try {
    if (streamlabsClient) {
      streamlabsClient.close();
    }
  } catch (error) {
    // Ignore stale socket cleanup errors.
  }

  stopStreamlabsPolling();
  streamlabsPending.clear();
  activeSceneId = null;

  console.log(`[bridge] connecting Streamlabs scene relay to ${STREAMLABS_API_URL}...`);
  const client = new SockJS(STREAMLABS_API_URL);
  streamlabsClient = client;

  client.onopen = () => {
    sendStreamlabsRpc("auth", {
      resource: "TcpServerService",
      args: [STREAMLABS_API_TOKEN]
    }, (result) => {
      if (result !== true) {
        console.error("[bridge] Streamlabs auth failed.");
        client.close();
        return;
      }

      console.log("[bridge] Streamlabs scene relay authenticated.");
      startStreamlabsPolling();
    });
  };

  client.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        const handler = streamlabsPending.get(message.id);
        if (handler) {
          streamlabsPending.delete(message.id);
          if (message.error) {
            console.error(`[bridge] Streamlabs RPC error (${message.id}): ${message.error.message}`);
          } else {
            handler(message.result);
          }
        }
      }
    } catch (error) {
      // Ignore malformed RPC payloads.
    }
  };

  client.onclose = () => {
    console.warn("[bridge] Streamlabs scene relay disconnected; retrying...");
    stopStreamlabsPolling();
    streamlabsPending.clear();
    scheduleStreamlabsReconnect();
  };

  client.onerror = () => {
    console.error("[bridge] Streamlabs scene relay socket error.");
  };
}

async function connectObsSceneRelay() {
  if (!OBS_SCENE_RELAY_ENABLED || !OBSWebSocket) return;

  if (obsClient) {
    try {
      obsClient.removeAllListeners();
      await obsClient.disconnect();
    } catch (error) {
      // Ignore cleanup errors.
    }
    obsClient = null;
  }

  const client = new OBSWebSocket();
  obsClient = client;

  client.on("CurrentProgramSceneChanged", (eventData) => {
    const sceneName = eventData?.sceneName || eventData?.currentProgramSceneName || "Unknown Scene";
    broadcastSceneChange(sceneName, sceneName, "obs");
  });

  client.on("ConnectionClosed", () => {
    console.warn("[bridge] OBS scene relay disconnected; retrying...");
    scheduleObsReconnect();
  });

  client.on("error", (error) => {
    console.error("[bridge] OBS scene relay error:", error.message);
  });

  try {
    const sceneEvents = (EventSubscription.General || 0) | (EventSubscription.Scenes || 0);
    const identification = sceneEvents ? { eventSubscriptions: sceneEvents } : undefined;
    console.log(`[bridge] connecting OBS scene relay to ${OBS_WS_URL}...`);
    const connectPromise = client.connect(OBS_WS_URL, OBS_WS_PASSWORD || undefined, identification);
    await Promise.race([
      connectPromise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`OBS connect timeout after ${OBS_CONNECT_TIMEOUT_MS}ms`));
        }, OBS_CONNECT_TIMEOUT_MS);
      })
    ]);
    console.log(`[bridge] OBS scene relay connected at ${OBS_WS_URL}`);

    try {
      const sceneInfo = await client.call("GetCurrentProgramScene");
      const currentScene = sceneInfo?.currentProgramSceneName;
      if (currentScene) {
        broadcastSceneChange(currentScene, currentScene, "obs");
      }
    } catch (error) {
      // Scene fetch can fail on older implementations; live events still work.
    }
  } catch (error) {
    console.error("[bridge] OBS scene relay connect failed:", error.message);
    scheduleObsReconnect();
  }
}

function rotateWindowIfNeeded() {
  const now = Date.now();
  if (now - relayWindow.startedAt >= 10000) {
    relayWindow.startedAt = now;
    relayWindow.count = 0;
  }
}

function canRelay() {
  rotateWindowIfNeeded();
  if (relayWindow.count >= MAX_RELAY_PER_10S) {
    return false;
  }

  relayWindow.count += 1;
  return true;
}

function buildExtensionJwt() {
  const secret = Buffer.from(process.env.TWITCH_EXTENSION_SECRET_BASE64, "base64");

  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60,
    user_id: process.env.TWITCH_EXTENSION_OWNER_USER_ID,
    role: "external",
    channel_id: process.env.TWITCH_BROADCASTER_ID,
    pubsub_perms: {
      send: ["broadcast"]
    }
  };

  return jwt.sign(payload, secret, { algorithm: "HS256" });
}

function postExtensionBroadcast(messageObject) {
  return new Promise((resolve, reject) => {
    const token = buildExtensionJwt();

    const body = JSON.stringify({
      broadcaster_id: process.env.TWITCH_BROADCASTER_ID,
      target: ["broadcast"],
      is_global_broadcast: false,
      message: JSON.stringify(messageObject)
    });

    const req = https.request(
      "https://api.twitch.tv/helix/extensions/pubsub",
      {
        method: "POST",
        headers: {
          "Client-Id": process.env.TWITCH_EXTENSION_CLIENT_ID,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }

          reject(new Error(`Twitch API ${res.statusCode}: ${data}`));
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sanitizeMessage(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

const chatClient = new tmi.Client({
  connection: { reconnect: true, secure: true },
  identity: {
    username: process.env.TWITCH_BOT_USERNAME,
    password: process.env.TWITCH_BOT_OAUTH_TOKEN
  },
  channels: [process.env.TWITCH_CHANNEL]
});

resetRelaySessionState();

chatClient.on("message", async (channel, tags, message, self) => {
  if (self) return;

  const username = sanitizeUsername(tags["display-name"] || tags.username || "Traveler");
  const safeMessage = sanitizeMessage(message);

  viewerDb.markChatActivity(username);

  if (safeMessage.startsWith("!")) {
    if (isAdminCommand(safeMessage)) {
      if (!canRunAdminCommand(tags, username)) {
        console.log(`[bridge][admin] ignored unauthorized command from ${username}: ${safeMessage}`);
        return;
      }

      const adminResult = handleAdminCommand(username, safeMessage);
      if (adminResult.handled) {
        await sendChatReply(channel, adminResult.reply);
        return;
      }
    }

    const commandResult = shopHandler.handleChatCommand(username, safeMessage);
    if (commandResult.handled) {
      await sendChatReply(channel, commandResult.reply);
      return;
    }
  }

  if (canAwardChatGold(username, safeMessage)) {
    const updated = viewerDb.addGold(username, CHAT_GOLD_RULES.goldPerReward);
    if (updated && updated.gold % 25 === 0) {
      chatClient.say(channel, `${username} now holds ${updated.gold} gold pieces.`).catch(() => {});
    }
  }

  // Tiny messages are usually low-quality noise and are skipped here.
  if (safeMessage.length < MIN_RELAY_LENGTH) {
    return;
  }

  // Outbound relay cap to avoid flooding extension broadcast.
  if (!canRelay()) {
    return;
  }

  const payload = {
    type: "chat",
    username,
    message: safeMessage,
    at: Date.now()
  };

  try {
    await broadcastOverlay(payload);
    console.log(`[bridge] relayed: ${username}: ${safeMessage}`);
  } catch (error) {
    console.error("[bridge] relay failed:", error.message);
  }
});

function broadcastShopState() {
  broadcastOverlay(buildShopStatePayload());
}

chatClient.connect()
  .then(() => {
    console.log("[bridge] connected to Twitch chat and relay is active.");
    beginRelaySession(false);
    bossEngine.start();

    broadcastShopState();
    console.log(`[bridge] state heartbeat every ${STATE_BROADCAST_INTERVAL_MS}ms`);

    setInterval(broadcastShopState, STATE_BROADCAST_INTERVAL_MS);

    if (SCENE_RELAY_PROVIDER === "streamlabs") {
      connectStreamlabsSceneRelay();
      return;
    }

    if (SCENE_RELAY_PROVIDER === "obs") {
      connectObsSceneRelay();
      return;
    }

    if (SCENE_RELAY_PROVIDER === "off") {
      console.log("[bridge] scene relay disabled by SCENE_RELAY_PROVIDER=off");
      return;
    }

    // Fallback for invalid provider values.
    console.warn(`[bridge] unknown SCENE_RELAY_PROVIDER='${SCENE_RELAY_PROVIDER}', defaulting to streamlabs.`);
    connectStreamlabsSceneRelay();
  })
  .catch((error) => {
    console.error("[bridge] failed to connect:", error.message);
    process.exit(1);
  });
