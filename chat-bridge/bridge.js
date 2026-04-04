const https = require("https");
const tmi = require("tmi.js");
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");
const SockJS = require("sockjs-client");
const OBSWebSocketModule = require("obs-websocket-js");
const viewerDb = require("./viewer-db");
const { BossEngine } = require("./boss-engine");
const { ShopHandler } = require("./shop-handler");
const { toOverlayRelayEvents } = require("./overlay-relay");
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
const relayInstanceId = `${process.pid}-${Date.now().toString(36)}`;
let relaySequence = 0;
let activeXpBoostEndsAt = 0;
const recentPurchases = [];

const CHAT_GOLD_RULES = {
  cooldownMs: 120000,
  minLength: 6,
  minWords: 2,
  goldPerReward: 1
};

let localWss = null;
let obsClient = null;
let obsReconnectTimer = null;
let streamlabsClient = null;
let streamlabsReconnectTimer = null;
let streamlabsPollTimer = null;
let streamlabsRpcId = 1;
let activeSceneId = null;
let localWsClientId = 0;
const streamlabsPending = new Map();

function sanitizeUsername(rawUsername) {
  const safe = String(rawUsername || "").trim();
  return safe || "traveler";
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
      viewerDb.addGold(fighter.name, split);
    }

    if (topDealer) {
      viewerDb.addGold(topDealer, 10);
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
  spawnIntervalMs: Number(process.env.BOSS_SPAWN_INTERVAL_MS || 10 * 60 * 1000),
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
  }
});

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
    xpBoostEndsAt,
    purchases: recentPurchases.slice(0, 5)
  };
}

function sendLocalSnapshot(client) {
  sendLocalPayload(client, buildShopStatePayload());
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

  return localPayloads.map((entry) => stampRelayPayload(entry));
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
  broadcastLocal({
    type: "scene_change",
    sceneName,
    sceneId,
    provider,
    at: Date.now()
  });
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

chatClient.on("message", async (channel, tags, message, self) => {
  if (self) return;

  const username = sanitizeUsername(tags["display-name"] || tags.username || "Traveler");
  const safeMessage = sanitizeMessage(message);

  viewerDb.markChatActivity(username);

  if (safeMessage.startsWith("!")) {
    const commandResult = shopHandler.handleChatCommand(username, safeMessage);
    if (commandResult.handled) {
      if (commandResult.reply) {
        try {
          await chatClient.say(channel, commandResult.reply);
        } catch (error) {
          console.error("[bridge] failed to send command reply:", error.message);
        }
      }
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
