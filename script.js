let currentXP = 0;
let currentLevel = 1;
let xpToNext = 100;

const DEV_MODE = false;
const DEV_HOLD_SCENE = false;
const DEV_EXTRA_VISIBLE_MS = 1800;
const LEVELUP_DURATION_MS = 5200;
const ALERT_DURATION_MS = 5200;

const LEVELUP_TITLES = [
  "LEVEL UP",
  "NEW RANK EARNED",
  "GUILD RANK INCREASED",
  "ROGUE ASCENSION"
];

const RANK_NAMES = [
  /* Tier 1 - Street Level (1-10) */
  "Drifter",             // 1
  "Cutpurse",            // 2
  "Footpad",             // 3
  "Lurker",              // 4
  "Knife in the Dark",   // 5
  "Shade Walker",        // 6
  "Ironcloak",           // 7
  "Hollow Eye",          // 8
  "Thornmantle",         // 9
  "Dusk Runner",         // 10
  /* Tier 2 - Guild Initiate (11-20) */
  "Sable Hood",          // 11
  "Phantom Hand",        // 12
  "Veil Stalker",        // 13
  "Crimson Dagger",      // 14
  "Ashmark",             // 15
  "Gravewatch",          // 16
  "Twilight Blade",      // 17
  "Hexcloaker",          // 18
  "Wraithkin",           // 19
  "Shadow Adept",        // 20
  /* Tier 3 - Nightblade Rank (21-30) */
  "Bloodmask",           // 21
  "Ebonmantle",          // 22
  "Nightblade",          // 23
  "Silent Consul",       // 24
  "Bone Shroud",         // 25
  "Mirrorless",          // 26
  "Black Lantern",       // 27
  "Dread Veil",          // 28
  "Ink Reaper",          // 29
  "Guild Enforcer",      // 30
  /* Tier 4 - Shadow Council (31-40) */
  "Pale Executioner",    // 31
  "Thornwarden",         // 32
  "Emberveil",           // 33
  "Forsaken Blade",      // 34
  "Hollow Crown",        // 35
  "Iron Specter",        // 36
  "Vault Specter",       // 37
  "Duskbringer",         // 38
  "Wraith Ascendant",    // 39
  "Master of Whispers",  // 40
  /* Tier 5 - Legend (41-50) */
  "Grave Sentinel",      // 41
  "Void Mantle",         // 42
  "Obsidian Marked",     // 43
  "Eternal Shade",       // 44
  "Shadow Sovereign",    // 45
  "Ruinwalker",          // 46
  "Sable Revenant",      // 47
  "Umbral Sovereign",    // 48
  "The Undying",         // 49
  "The Nameless"         // 50
];

const xpBar = document.getElementById("xp-bar");
const xpText = document.getElementById("xp-text");
const levelLabel = document.getElementById("level-label");
const xpBoostBadge = document.getElementById("xp-boost-badge");
const transportStatus = document.getElementById("transport-status");
const alertBox = document.getElementById("alert-box");
const alertTitle = document.getElementById("alert-title");
const alertMessage = document.getElementById("alert-message");
const eventLog = document.getElementById("event-log");
const overlay = document.getElementById("overlay");
const topBar = document.getElementById("top-bar");
const leftPanel = document.getElementById("left-panel");
const bossPanel = document.getElementById("boss-panel");
const bossName = document.getElementById("boss-name");
const bossHpText = document.getElementById("boss-hp-text");
const bossHpFill = document.getElementById("boss-hp-fill");
const bossLastHit = document.getElementById("boss-last-hit");
const bossNextTimer = document.getElementById("boss-next-timer");
const bossThresholdText = document.getElementById("boss-threshold-text");
const bossAvatar = document.getElementById("boss-avatar");
const bossAvatarGlyph = document.getElementById("boss-avatar-glyph");
const bossLore = document.getElementById("boss-lore");
const bossPartyStrip = document.getElementById("boss-party-strip");
const shopToast = document.getElementById("shop-toast");
const shopToastTitle = document.getElementById("shop-toast-title");
const shopToastBody = document.getElementById("shop-toast-body");

const questlinePanel = document.getElementById("questline-panel");
const questActiveTitle = document.getElementById("quest-active-title");
const questActiveObjective = document.getElementById("quest-active-objective");
const questProgressText = document.getElementById("quest-progress-text");
const questProgressReward = document.getElementById("quest-progress-reward");
const questProgressFill = document.getElementById("quest-progress-fill");
const questUpcomingList = document.getElementById("quest-upcoming-list");

const levelupScene = document.getElementById("levelup-scene");
const levelupTitle = document.getElementById("levelup-title");
const levelupSubtitle = document.getElementById("levelup-subtitle");
const levelupRankLine = document.getElementById("levelup-rank-line");
const sigilPrimary = document.getElementById("sigil-primary");
const sigilSecondary = document.getElementById("sigil-secondary");
const embers = Array.from(document.querySelectorAll(".ember"));
const sparks = Array.from(document.querySelectorAll(".spark"));
const SCENE_AUDIO_EVENT = "overlay:levelup-audio";
const UI_FEEDBACK_EVENT = "overlay:ui-feedback";

const SIGIL_FORMS = [
  {
    primary: "M200 62 L260 120 L242 176 L292 200 L242 224 L260 280 L200 338 L140 280 L158 224 L108 200 L158 176 L140 120 Z",
    secondary: "M200 108 L218 168 L282 170 L230 212 L248 272 L200 236 L152 272 L170 212 L118 170 L182 168 Z"
  },
  {
    primary: "M200 58 L242 108 L300 128 L272 188 L312 240 L250 248 L200 328 L150 248 L88 240 L128 188 L100 128 L158 108 Z",
    secondary: "M200 112 L232 150 L280 162 L254 202 L270 252 L224 236 L200 282 L176 236 L130 252 L146 202 L120 162 L168 150 Z"
  },
  {
    primary: "M200 70 L268 112 L290 184 L334 200 L290 216 L268 288 L200 330 L132 288 L110 216 L66 200 L110 184 L132 112 Z",
    secondary: "M200 110 L220 160 L278 180 L230 200 L246 258 L200 224 L154 258 L170 200 L122 180 L180 160 Z"
  },
  {
    primary: "M200 56 L252 96 L324 108 L288 176 L332 236 L264 248 L232 320 L168 320 L136 248 L68 236 L112 176 L76 108 L148 96 Z",
    secondary: "M200 116 L246 152 L282 198 L232 204 L216 264 L184 264 L168 204 L118 198 L154 152 Z"
  }
];

const CHAT_EVENT_NAME = "overlay:chat-message";
const RUNTIME_OVERRIDE_STORAGE_KEY = "rockett-dnd-runtime-overrides";

function readStoredRuntimeOverrides() {
  try {
    const raw = window.localStorage.getItem(RUNTIME_OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function readRuntimeOverrides() {
  const params = new URLSearchParams(window.location.search);
  const hostname = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = !hostname || hostname === "localhost" || hostname === "127.0.0.1";
  const allowStoredOverrides = window.location.protocol === "file:" || isLocalHost;
  const stored = allowStoredOverrides ? readStoredRuntimeOverrides() : {};
  const rawTransportMode = String(params.get("transport") || stored.transportMode || "").trim().toLowerCase();
  return {
    transportMode: rawTransportMode.replace(/[^a-z]/g, ""),
    localWsUrl: String(params.get("ws") || stored.localWsUrl || "").trim().replace(/\^/g, ""),
    staleAfterMs: Number(params.get("staleAfterMs") || stored.staleAfterMs || 0),
    expectedChannelId: String(params.get("channelId") || stored.expectedChannelId || "").trim(),
    authTimeoutMs: Number(params.get("authTimeoutMs") || stored.authTimeoutMs || 0)
  };
}

const runtimeOverrides = readRuntimeOverrides();

// Chat progression config with fallbacks if config.js omits fields.
const chatConfig = {
  enabled: overlayConfig.chatParticipation?.enabled ?? false,
  transportMode: String(runtimeOverrides.transportMode || overlayConfig.chatParticipation?.transportMode || "auto").toLowerCase(),
  localWsEnabled: overlayConfig.chatParticipation?.localWsEnabled ?? true,
  localWsUrl: runtimeOverrides.localWsUrl || overlayConfig.chatParticipation?.localWsUrl || "ws://127.0.0.1:8787",
  expectedChannelId: String(runtimeOverrides.expectedChannelId || overlayConfig.chatParticipation?.expectedChannelId || "").trim(),
  authTimeoutMs: Math.max(2000, Number(runtimeOverrides.authTimeoutMs || overlayConfig.chatParticipation?.authTimeoutMs || 12000)),
  staleAfterMs: Math.max(5000, Number(runtimeOverrides.staleAfterMs || overlayConfig.chatParticipation?.staleAfterMs || 45000)),
  messageCooldownMs: overlayConfig.chatParticipation?.messageCooldownMs ?? 10000,
  messagesPerReward: overlayConfig.chatParticipation?.messagesPerReward ?? 5,
  xpPerReward: overlayConfig.chatParticipation?.xpPerReward ?? 6,
  minMessageLength: overlayConfig.chatParticipation?.minMessageLength ?? 6,
  minWordCount: overlayConfig.chatParticipation?.minWordCount ?? 2,
  minUniqueChars: overlayConfig.chatParticipation?.minUniqueChars ?? 4,
  maxRepeatedCharRatio: overlayConfig.chatParticipation?.maxRepeatedCharRatio ?? 0.55,
  milestoneBonuses: overlayConfig.chatParticipation?.milestoneBonuses ?? { 25: 18, 50: 38, 100: 85 },
  milestoneNotifications: overlayConfig.chatParticipation?.milestoneNotifications ?? [
    "A Familiar Voice Rises in the Tavern",
    "Guild Presence Strengthens",
    "The Hall Grows Louder"
  ]
};

const chatUserState = new Map();
const sortedMilestones = Object.keys(chatConfig.milestoneBonuses)
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value) && value > 0)
  .sort((a, b) => a - b);

const questlineConfig = {
  enabled: overlayConfig.questline?.enabled ?? true,
  loopQuests: overlayConfig.questline?.loopQuests ?? true,
  quests: (overlayConfig.questline?.quests || []).map((quest, index) => ({
    id: quest.id || `quest-${index + 1}`,
    title: quest.title || `Guild Contract ${index + 1}`,
    objective: quest.objective || "Complete the guild contract.",
    target: Math.max(1, Number(quest.target) || 1),
    rewardXP: Math.max(1, Number(quest.rewardXP) || 10),
    track: quest.track || { "event.any": 1 }
  }))
};

const sceneControlConfig = {
  enabled: overlayConfig.sceneControl?.enabled ?? true,
  justChattingSceneName: String(overlayConfig.sceneControl?.justChattingSceneName || "Just Chatting"),
  gameSceneName: String(overlayConfig.sceneControl?.gameSceneName || "Game Screen"),
  questlineRevealCommand: String(overlayConfig.sceneControl?.questlineRevealCommand || "!quest"),
  questlineRevealDurationMs: Math.max(5000, Number(overlayConfig.sceneControl?.questlineRevealDurationMs) || 30000),
  minRevealDurationMs: Math.max(5000, Number(overlayConfig.sceneControl?.minRevealDurationMs) || 10000),
  maxRevealDurationMs: Math.max(10000, Number(overlayConfig.sceneControl?.maxRevealDurationMs) || 180000),
  gameEventsPanelOpacity: Math.max(0.1, Math.min(1, Number(overlayConfig.sceneControl?.gameEventsPanelOpacity) || 0.38)),
  gameEventsRevealDurationMs: Math.max(2000, Number(overlayConfig.sceneControl?.gameEventsRevealDurationMs) || 8000)
};

const questlineState = {
  activeQuestIndex: 0,
  progressByQuestId: new Map()
};

const sceneState = {
  currentName: "",
  questlineVisibleUntil: 0,
  questlineTimer: null,
  eventsTimer: null
};

const bossState = {
  active: false,
  key: "",
  name: "",
  tier: 1,
  visual: null,
  hp: 0,
  maxHp: 0,
  nextSpawnAt: 0,
  recentFighters: []
};

const xpBoostState = {
  multiplier: 1,
  expiresAt: 0
};

let chatLocalSocket = null;
let chatSocketRetryTimer = null;
let bossCountdownTicker = null;
let overlayDevMessageListenerBound = false;
let activeRelaySessionId = "";
const seenRelayEvents = new Map();

const DEV_OVERLAY_MESSAGE_TYPES = new Set([
  "boss_spawn",
  "boss_damage",
  "boss_defeat",
  "shop_purchase",
  "scene_change",
  "shop_state"
]);

const transportState = {
  requestedMode: ["auto", "local", "twitch"].includes(chatConfig.transportMode) ? chatConfig.transportMode : "auto",
  activeSource: "idle",
  status: "waiting",
  lastMessageAt: 0,
  lastEventType: "",
  lastError: "",
  authorizedChannelId: "",
  isExtensionAuthorized: false,
  authTimer: null,
  bootstrapTimer: null,
  transportListenerBound: false,
  authHandlerBound: false
};

let alertTimer = null;
let levelupTimer = null;
let glowTimer = null;
let shudderTimer = null;
let pulseTimers = [];
let toastTimer = null;
let bossFeedbackTimer = null;
let purchaseFeedbackTimer = null;
let attackFeedBurst = null;

const FEED_MAX_ITEMS = 6;
const FEED_COLLAPSE_WINDOW_MS = 2200;
const FEED_PRIORITY_DURATION_MS = {
  high: 16000,
  medium: 10500,
  low: 7600,
  soft: 5200
};

function getXpMultiplier() {
  if (Date.now() <= xpBoostState.expiresAt) {
    return xpBoostState.multiplier;
  }

  xpBoostState.multiplier = 1;
  xpBoostState.expiresAt = 0;
  return 1;
}

function renderXpBoostBadge() {
  if (!xpBoostBadge) return;

  const multiplier = getXpMultiplier();
  if (multiplier <= 1) {
    xpBoostBadge.classList.add("hidden");
    return;
  }

  const remainingMs = Math.max(0, xpBoostState.expiresAt - Date.now());
  const sec = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  xpBoostBadge.classList.remove("hidden");
  xpBoostBadge.textContent = `${multiplier}x XP Boost ${mm}:${ss}`;
}

function hasTwitchBroadcastSupport() {
  return Boolean(window.Twitch && window.Twitch.ext && typeof window.Twitch.ext.listen === "function");
}

function normalizeChannelId(value) {
  return String(value || "").trim();
}

function canUseLocalTransport() {
  return chatConfig.enabled && chatConfig.localWsEnabled && transportState.requestedMode !== "twitch";
}

function isLocalDevRelayMode() {
  const hostname = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = !hostname || hostname === "localhost" || hostname === "127.0.0.1";
  return canUseLocalTransport() && (transportState.requestedMode === "local" || window.location.protocol === "file:" || isLocalHost);
}

function syncOverlayDebugBindings() {
  if (!isLocalDevRelayMode()) {
    try {
      delete window.overlaySocket;
      delete window.testOverlayEvent;
    } catch (_error) {
      window.overlaySocket = undefined;
      window.testOverlayEvent = undefined;
    }
    return;
  }

  window.overlaySocket = chatLocalSocket;
  window.testOverlayEvent = (payload) => {
    routeDevOverlayPayload(payload);
    return payload;
  };

  bindDevOverlayMessageListener();
}

function routeDevOverlayPayload(payload) {
  noteTransportActivity("local", payload);
  handleOverlayPayload(payload);
}

function getDevOverlayPayload(messageData) {
  if (!messageData || typeof messageData !== "object") {
    return null;
  }

  const directPayload = typeof messageData.type === "string" ? messageData : null;
  const nestedPayload = messageData.overlayPayload && typeof messageData.overlayPayload === "object"
    ? messageData.overlayPayload
    : null;
  const payload = directPayload || nestedPayload;

  if (!payload || !DEV_OVERLAY_MESSAGE_TYPES.has(String(payload.type || ""))) {
    return null;
  }

  return payload;
}

function bindDevOverlayMessageListener() {
  if (overlayDevMessageListenerBound) {
    return;
  }

  window.addEventListener("message", (event) => {
    if (!isLocalDevRelayMode()) {
      return;
    }

    const payload = getDevOverlayPayload(event.data);
    if (!payload) {
      return;
    }

    routeDevOverlayPayload(payload);
  });

  overlayDevMessageListenerBound = true;
}

function shouldLogOverlayWsDebug() {
  return isLocalDevRelayMode();
}

function shouldUseTwitchTransport() {
  if (transportState.requestedMode === "local") {
    return false;
  }

  return hasTwitchBroadcastSupport();
}

function clearTransportTimer(timerKey) {
  if (!transportState[timerKey]) {
    return;
  }

  clearTimeout(transportState[timerKey]);
  transportState[timerKey] = null;
}

function startTwitchAuthorizationWatch() {
  if (transportState.requestedMode === "local") {
    return;
  }

  clearTransportTimer("authTimer");
  transportState.authTimer = setTimeout(() => {
    if (transportState.isExtensionAuthorized) {
      return;
    }

    setTransportState({
      activeSource: "twitch",
      status: "error",
      lastError: hasTwitchBroadcastSupport() ? "Auth timeout" : "No context"
    });
  }, chatConfig.authTimeoutMs);
}

function validateAuthorizedChannel(channelId) {
  const expectedChannelId = normalizeChannelId(chatConfig.expectedChannelId);
  if (!expectedChannelId || !channelId) {
    return true;
  }

  return expectedChannelId === channelId;
}

function handleTwitchAuthorized(auth) {
  const channelId = normalizeChannelId(auth?.channelId);
  clearTransportTimer("authTimer");

  if (!validateAuthorizedChannel(channelId)) {
    setTransportState({
      isExtensionAuthorized: false,
      authorizedChannelId: channelId,
      activeSource: "twitch",
      status: "error",
      lastError: "Channel mismatch"
    });
    addEventLog(`Twitch auth mismatch: expected ${chatConfig.expectedChannelId}, got ${channelId}.`);
    return;
  }

  setTransportState({
    isExtensionAuthorized: true,
    authorizedChannelId: channelId,
    activeSource: "twitch",
    status: "waiting",
    lastError: ""
  });
}

function bindTwitchTransport() {
  if (!hasTwitchBroadcastSupport()) {
    return false;
  }

  if (!transportState.transportListenerBound) {
    window.Twitch.ext.listen("broadcast", (_target, _contentType, message) => {
      try {
        const payload = typeof message === "string" ? JSON.parse(message) : message;
        noteTransportActivity("twitch", payload);
        handleOverlayPayload(payload);
      } catch (_error) {
        // Ignore malformed broadcast payloads from unrelated extension traffic.
      }
    });
    transportState.transportListenerBound = true;
  }

  if (!transportState.authHandlerBound && typeof window.Twitch.ext.onAuthorized === "function") {
    window.Twitch.ext.onAuthorized((auth) => {
      handleTwitchAuthorized(auth);
    });
    transportState.authHandlerBound = true;
  }

  setTransportState({ activeSource: "twitch", status: "waiting", lastError: "" });
  startTwitchAuthorizationWatch();
  return true;
}

function beginTransportBootstrap() {
  if (transportState.requestedMode === "local") {
    connectLocalChatSocket();
    return;
  }

  if (bindTwitchTransport()) {
    return;
  }

  const giveUpAfterMs = transportState.requestedMode === "twitch" ? chatConfig.authTimeoutMs : 1500;
  const startedAt = Date.now();
  setTransportState({ activeSource: "twitch", status: "waiting", lastError: "Loading" });

  const pollForTwitch = () => {
    if (bindTwitchTransport()) {
      clearTransportTimer("bootstrapTimer");
      return;
    }

    if (Date.now() - startedAt >= giveUpAfterMs) {
      clearTransportTimer("bootstrapTimer");
      if (transportState.requestedMode === "twitch") {
        setTransportState({ activeSource: "twitch", status: "error", lastError: "No context" });
        return;
      }

      connectLocalChatSocket();
      return;
    }

    transportState.bootstrapTimer = setTimeout(pollForTwitch, 250);
  };

  transportState.bootstrapTimer = setTimeout(pollForTwitch, 250);
}

function setTransportState(nextState) {
  Object.assign(transportState, nextState || {});
  renderTransportStatus();
}

function noteTransportActivity(source, payload = null) {
  setTransportState({
    activeSource: source,
    status: "live",
    lastMessageAt: Date.now(),
    lastEventType: payload && payload.type ? String(payload.type) : transportState.lastEventType,
    lastError: ""
  });
}

function renderTransportStatus() {
  if (!transportStatus) return;

  let status = transportState.status;
  const now = Date.now();
  if (transportState.lastMessageAt && now - transportState.lastMessageAt > chatConfig.staleAfterMs && status !== "error") {
    status = "stale";
  }

  const sourceLabel = (transportState.activeSource === "idle" ? transportState.requestedMode : transportState.activeSource).toUpperCase();
  let detail = "Awaiting relay";

  if (status === "live") {
    detail = "Live";
  } else if (status === "stale") {
    detail = "Stale";
  } else if (status === "error") {
    detail = transportState.lastError || "Error";
  } else if (transportState.isExtensionAuthorized && transportState.activeSource === "idle") {
    detail = "Authorized";
  }

  transportStatus.className = `transport-status transport-status-${status}`;

  if (isLocalDevRelayMode() && transportState.activeSource !== "twitch") {
    const lastEventType = transportState.lastEventType || "none";
    const lastSeen = transportState.lastMessageAt
      ? new Date(transportState.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "--:--:--";
    transportStatus.textContent = `${sourceLabel} ${detail} ${lastEventType} ${lastSeen}`;
    transportStatus.title = `Relay ${detail.toLowerCase()} | last event: ${lastEventType} | last message: ${lastSeen}`;
    return;
  }

  transportStatus.textContent = `${sourceLabel} ${detail}`;
  transportStatus.title = "";
}

function showShopToastMessage(title, body) {
  showShopToastMessageWithOptions(title, body);
}

function dispatchOverlayFeedback(detail) {
  window.dispatchEvent(new CustomEvent(UI_FEEDBACK_EVENT, {
    detail: detail || {}
  }));
}

function clearTimedClass(element, className, timerRefName) {
  if (!element) {
    return;
  }

  if (timerRefName && globalThis[timerRefName]) {
    clearTimeout(globalThis[timerRefName]);
    globalThis[timerRefName] = null;
  }

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);

  if (timerRefName) {
    globalThis[timerRefName] = setTimeout(() => {
      element.classList.remove(className);
      globalThis[timerRefName] = null;
    }, 680);
  }
}

function pulseBossPanel(mode) {
  if (!bossPanel) return;

  const safeMode = String(mode || "damage").toLowerCase();
  bossPanel.classList.remove("boss-panel-spawn", "boss-panel-damage", "boss-panel-defeat");
  void bossPanel.offsetWidth;
  bossPanel.classList.add(`boss-panel-${safeMode}`);

  if (bossFeedbackTimer) {
    clearTimeout(bossFeedbackTimer);
  }

  bossFeedbackTimer = setTimeout(() => {
    bossPanel.classList.remove("boss-panel-spawn", "boss-panel-damage", "boss-panel-defeat");
    bossFeedbackTimer = null;
  }, safeMode === "defeat" ? 980 : 720);

  dispatchOverlayFeedback({ system: "boss", mode: safeMode, boss: { ...bossState } });
}

function pulsePurchaseFeedback(mode = "purchase") {
  if (!shopToast) return;

  const safeMode = String(mode || "purchase").toLowerCase();
  shopToast.classList.remove("shop-toast-purchase", "shop-toast-boost", "shop-toast-effect");
  void shopToast.offsetWidth;
  shopToast.classList.add(`shop-toast-${safeMode}`);

  if (purchaseFeedbackTimer) {
    clearTimeout(purchaseFeedbackTimer);
  }

  purchaseFeedbackTimer = setTimeout(() => {
    shopToast.classList.remove("shop-toast-purchase", "shop-toast-boost", "shop-toast-effect");
    purchaseFeedbackTimer = null;
  }, 1200);

  dispatchOverlayFeedback({ system: "purchase", mode: safeMode });
}

function nudgeBossHpBar(mode = "damage") {
  if (!bossHpFill) return;

  bossHpFill.classList.remove("boss-hp-hit", "boss-hp-spawn");
  void bossHpFill.offsetWidth;
  bossHpFill.classList.add(mode === "spawn" ? "boss-hp-spawn" : "boss-hp-hit");
}

function showShopToastMessageWithOptions(title, body, options = {}) {
  if (!shopToast || !shopToastTitle || !shopToastBody) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  const tone = String(options.tone || "purchase").toLowerCase();
  shopToastTitle.textContent = title;
  shopToastBody.textContent = body;
  shopToast.dataset.tone = tone;
  shopToast.classList.remove("hidden");
  pulsePurchaseFeedback(tone);
  dispatchOverlayFeedback({ system: "toast", tone, title, body });

  toastTimer = setTimeout(() => {
    shopToast.classList.add("hidden");
  }, 4200);
}

function clearBossState() {
  bossState.active = false;
  bossState.key = "";
  bossState.name = "";
  bossState.tier = 1;
  bossState.visual = null;
  bossState.hp = 0;
  bossState.maxHp = 0;
  bossState.nextSpawnAt = 0;
  bossState.recentFighters = [];
  bossThresholdText.textContent = "";
  bossLastHit.textContent = "";
}

function resetOverlaySessionState() {
  clearBossState();
  renderBossPanel();
  renderBossCountdown();

  questlineState.activeQuestIndex = 0;
  questlineState.progressByQuestId.clear();
  renderQuestlinePanel();

  xpBoostState.multiplier = 1;
  xpBoostState.expiresAt = 0;
  renderXpBoostBadge();

  currentXP = 0;
  currentLevel = 1;
  xpToNext = 100;
  updateXPBar();

  chatUserState.clear();
  seenRelayEvents.clear();

  sceneState.currentName = "";
  sceneState.questlineVisibleUntil = 0;
  clearQuestlineRevealTimer();
  clearEventsRevealTimer();
  applySceneLayoutState();

  if (eventLog) {
    eventLog.innerHTML = "";
  }

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (shopToast) {
    shopToast.classList.add("hidden");
  }

  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }
  if (alertBox) {
    alertBox.classList.add("hidden");
  }

  stopLevelUpScene();
}

function syncRelaySession(payload) {
  const nextSessionId = String(payload?.relayMeta?.instanceId || "").trim();
  if (!nextSessionId) {
    return;
  }

  if (activeRelaySessionId && activeRelaySessionId !== nextSessionId) {
    resetOverlaySessionState();
  }

  activeRelaySessionId = nextSessionId;
}

function renderBossPanel() {
  if (!bossPanel) return;

  if (!bossState.active) {
    bossPanel.classList.add("hidden");
    bossHpFill.style.width = "0%";
    return;
  }

  const visual = resolveBossVisual();
  bossPanel.classList.remove("hidden");
  bossName.textContent = bossState.name || "Unknown Boss";
  bossAvatarGlyph.textContent = visual.glyph;
  if (bossAvatar) {
    bossAvatar.style.borderColor = `${visual.accent}aa`;
  }
  if (bossLore) {
    bossLore.textContent = visual.lore;
  }
  bossHpText.textContent = `${Math.max(0, Math.round(bossState.hp))} / ${Math.max(0, Math.round(bossState.maxHp))} HP`;
  const percent = bossState.maxHp > 0 ? Math.max(0, Math.min(100, (bossState.hp / bossState.maxHp) * 100)) : 0;
  bossPanel.style.setProperty("--boss-accent", visual.accent);
  bossPanel.style.setProperty("--boss-hp-percent", `${percent.toFixed(2)}%`);
  bossHpFill.style.width = `${percent}%`;
  renderBossPartyStrip();
}

function resolveBossVisual() {
  const fallback = getBossFallbackVisual(bossState.key, bossState.name, bossState.tier);
  const visual = bossState.visual || {};
  return {
    glyph: String(visual.glyph || fallback.glyph || "??").slice(0, 2).toUpperCase(),
    accent: String(visual.accent || fallback.accent || "#d98b5a"),
    lore: String(visual.lore || fallback.lore || "The guild braces for impact.")
  };
}

function getBossFallbackVisual(bossKey, bossNameValue, tier) {
  const key = String(bossKey || "").toLowerCase();
  if (key === "goblin") {
    return { glyph: "GK", accent: "#8bcf62", lore: "A reckless tyrant testing the guild's first steel." };
  }

  if (key === "troll") {
    return { glyph: "ST", accent: "#9cbca9", lore: "A bruiser from the old caves that punishes weak formation." };
  }

  if (key === "dragon") {
    return { glyph: "ED", accent: "#f2906f", lore: "An apex nightmare meant for a battle-ready party." };
  }

  const initials = String(bossNameValue || "Boss")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return {
    glyph: initials || "BO",
    accent: tier >= 3 ? "#f2906f" : tier >= 2 ? "#9cbca9" : "#8bcf62",
    lore: "The guild studies its next opponent."
  };
}

function renderBossPartyStrip() {
  if (!bossPartyStrip) return;

  bossPartyStrip.innerHTML = "";
  const fighters = Array.isArray(bossState.recentFighters) ? bossState.recentFighters.slice(0, 6) : [];

  if (!fighters.length) {
    const empty = document.createElement("div");
    empty.className = "fighter-chip";
    const name = document.createElement("div");
    name.className = "fighter-chip-name";
    name.textContent = "No strikes yet";
    const meta = document.createElement("div");
    meta.className = "fighter-chip-meta";
    meta.textContent = "Awaiting first attack";
    empty.appendChild(name);
    empty.appendChild(meta);
    bossPartyStrip.appendChild(empty);
    return;
  }

  fighters.forEach((fighter) => {
    const chip = document.createElement("div");
    chip.className = "fighter-chip";

    const name = document.createElement("div");
    name.className = "fighter-chip-name";
    name.textContent = String(fighter.username || "Traveler");

    const meta = document.createElement("div");
    meta.className = "fighter-chip-meta";
    const className = String(fighter.className || "peasant").replace(/-/g, " ");
    const weaponName = String(fighter.weapon || "fists").replace(/-/g, " ");
    meta.textContent = `${className} | ${weaponName}`;

    chip.appendChild(name);
    chip.appendChild(meta);
    bossPartyStrip.appendChild(chip);
  });
}

function shouldProcessRelayPayload(payload) {
  const relayId = payload?.relayMeta?.id;
  if (!relayId) {
    return true;
  }

  const now = Date.now();
  const existing = seenRelayEvents.get(relayId);
  if (existing && now - existing < 30000) {
    return false;
  }

  seenRelayEvents.set(relayId, now);
  if (seenRelayEvents.size > 800) {
    for (const [id, timestamp] of seenRelayEvents.entries()) {
      if (now - timestamp > 30000) {
        seenRelayEvents.delete(id);
      }
    }
  }

  return true;
}

function renderBossCountdown() {
  if (!bossNextTimer) return;

  if (bossState.active) {
    bossNextTimer.textContent = "Boss active now";
    return;
  }

  if (!bossState.nextSpawnAt) {
    bossNextTimer.textContent = "Next boss in --:--";
    return;
  }

  const remainingMs = Math.max(0, bossState.nextSpawnAt - Date.now());
  const sec = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  bossNextTimer.textContent = `Next boss in ${mm}:${ss}`;
}

function applyShopStatePayload(payload) {
  if (payload.boss) {
    bossState.active = true;
    bossState.key = payload.boss.key || bossState.key;
    bossState.name = payload.boss.name || bossState.name || "Unknown Boss";
    bossState.tier = Number(payload.boss.tier || bossState.tier || 1);
    bossState.visual = payload.boss.visual || bossState.visual || null;
    bossState.hp = Number(payload.boss.hp || bossState.hp || 0);
    bossState.maxHp = Number(payload.boss.maxHp || bossState.maxHp || 0);
    bossState.nextSpawnAt = 0;
    bossState.recentFighters = Array.isArray(payload.boss.recentFighters) ? payload.boss.recentFighters : [];
    bossLastHit.textContent = `Summoned by ${payload.boss.summonedBy || "the guild"}.`;
    renderBossPanel();
  } else {
    bossState.active = false;
    bossState.key = "";
    bossState.name = "";
    bossState.hp = 0;
    bossState.maxHp = 0;
    bossState.recentFighters = [];
    bossThresholdText.textContent = "";
    renderBossPanel();
  }

  bossState.nextSpawnAt = Number(payload.nextSpawnAt || bossState.nextSpawnAt || 0);
  if (typeof payload.xpBoostEndsAt === "number") {
    xpBoostState.expiresAt = Number(payload.xpBoostEndsAt || 0);
    xpBoostState.multiplier = xpBoostState.expiresAt > Date.now() ? Math.max(2, xpBoostState.multiplier) : 1;
    renderXpBoostBadge();
  }
  renderBossCountdown();
}

function buildFeedEntry(entry) {
  const baseEntry = typeof entry === "string"
    ? { type: "system", kicker: "Guild", detail: entry }
    : { ...(entry || {}) };

  const policyByType = {
    "boss-spawn": { priority: "high", emphasis: "high" },
    "boss-defeat": { priority: "high", emphasis: "high" },
    "boss-threshold": { priority: "medium", emphasis: "medium" },
    "boss-retreat": { priority: "soft", emphasis: "soft" },
    attack: { priority: "low", emphasis: "medium" },
    purchase: { priority: "low", emphasis: "medium" },
    reward: { priority: "medium", emphasis: "medium" },
    scene: { priority: "soft", emphasis: "soft" },
    system: { priority: "soft", emphasis: "soft" }
  };

  const policy = policyByType[baseEntry.type] || policyByType.system;
  const priority = baseEntry.priority || policy.priority;

  return {
    type: baseEntry.type || "system",
    kicker: baseEntry.kicker || "Guild",
    detail: baseEntry.detail || "Guild synced.",
    emphasis: baseEntry.emphasis || policy.emphasis,
    priority,
    durationMs: Number(baseEntry.durationMs || FEED_PRIORITY_DURATION_MS[priority] || FEED_PRIORITY_DURATION_MS.soft),
    actor: baseEntry.actor || "",
    damage: Number(baseEntry.damage || 0),
    hpText: baseEntry.hpText || ""
  };
}

function updateEventLogItem(item, entry) {
  const safeEntry = buildFeedEntry(entry);

  item.className = "event-item";
  item.dataset.eventType = safeEntry.type;
  item.dataset.emphasis = safeEntry.emphasis;
  item.dataset.priority = safeEntry.priority;

  let kicker = item.querySelector(".event-item-kicker");
  if (!kicker) {
    kicker = document.createElement("div");
    kicker.className = "event-item-kicker";
    item.appendChild(kicker);
  }
  kicker.textContent = safeEntry.kicker;

  let detail = item.querySelector(".event-item-detail");
  if (!detail) {
    detail = document.createElement("div");
    detail.className = "event-item-detail";
    item.appendChild(detail);
  }
  detail.textContent = safeEntry.detail;

  if (item._dismissTimer) {
    clearTimeout(item._dismissTimer);
  }

  item._dismissTimer = setTimeout(() => {
    if (attackFeedBurst && attackFeedBurst.item === item) {
      attackFeedBurst = null;
    }
    if (item.parentElement === eventLog) {
      eventLog.removeChild(item);
    }
  }, safeEntry.durationMs);

  return safeEntry;
}

function makeAttackBurstEntry(burst, latestEntry) {
  if (burst.count <= 1) {
    return latestEntry;
  }

  const hpNote = burst.lastHpText ? ` • ${burst.lastHpText} left` : "";
  return {
    type: "attack",
    kicker: "Attack Flurry",
    detail: `${burst.count} strikes • ${burst.totalDamage} dmg${hpNote}`,
    priority: "low",
    emphasis: "soft",
    durationMs: FEED_PRIORITY_DURATION_MS.low
  };
}

function mergeAttackFeedEntry(entry) {
  if (entry.type !== "attack") {
    attackFeedBurst = null;
    return false;
  }

  const now = Date.now();
  if (!attackFeedBurst || !attackFeedBurst.item?.isConnected || now - attackFeedBurst.lastAt > FEED_COLLAPSE_WINDOW_MS) {
    return false;
  }

  attackFeedBurst.count += 1;
  attackFeedBurst.totalDamage += Number(entry.damage || 0);
  attackFeedBurst.lastAt = now;
  attackFeedBurst.lastHpText = entry.hpText || attackFeedBurst.lastHpText;
  updateEventLogItem(attackFeedBurst.item, makeAttackBurstEntry(attackFeedBurst, entry));
  return true;
}

function trimEventLog() {
  while (eventLog.children.length > FEED_MAX_ITEMS) {
    const lastChild = eventLog.lastChild;
    if (lastChild?._dismissTimer) {
      clearTimeout(lastChild._dismissTimer);
    }
    if (attackFeedBurst && attackFeedBurst.item === lastChild) {
      attackFeedBurst = null;
    }
    eventLog.removeChild(lastChild);
  }
}

function describeGuildEvent(payload) {
  function systemEntry(kicker, detail) {
    return {
      type: "system",
      kicker,
      detail,
      priority: "soft",
      emphasis: "soft"
    };
  }

  if (!payload || typeof payload !== "object") {
    return systemEntry("Sync", "Guild synced.");
  }

  if (payload.type === "attack") {
    return {
      type: "attack",
      kicker: "Attack",
      detail: `${payload.by || "Traveler"} hit ${payload.damage || 0}${payload.hpText ? ` • ${payload.hpText} left` : ""}`,
      actor: payload.by || "Traveler",
      damage: Number(payload.damage || 0),
      hpText: payload.hpText || "",
      priority: "low",
      emphasis: "medium"
    };
  }

  if (payload.type === "shop") {
    return {
      type: "purchase",
      kicker: "Purchase",
      detail: `${payload.by || "Traveler"} bought ${payload.itemName || "item"}.`,
      priority: "low",
      emphasis: "medium"
    };
  }

  if (payload.type === "boss_update") {
    if (payload.event === "spawn") {
      return {
        type: "boss-spawn",
        kicker: "Boss Spawn",
        detail: `${(payload.boss && payload.boss.name) || "Boss"} enters.`,
        priority: "high",
        emphasis: "high"
      };
    }

    if (payload.event === "damage") {
      return {
        type: "attack",
        kicker: "Attack",
        detail: `${(payload.lastAttack && payload.lastAttack.by) || "Traveler"} hit ${(payload.lastAttack && payload.lastAttack.damage) || 0}`,
        actor: (payload.lastAttack && payload.lastAttack.by) || "Traveler",
        damage: Number((payload.lastAttack && payload.lastAttack.damage) || 0),
        hpText: (payload.boss && payload.boss.hpText) || "",
        priority: "low",
        emphasis: "medium"
      };
    }

    if (payload.event === "threshold") {
      return {
        type: "boss-threshold",
        kicker: "Rage",
        detail: `${Math.round(Number(payload.threshold || 0) * 100)}% threshold hit.`,
        priority: "medium",
        emphasis: "medium"
      };
    }

    if (payload.event === "defeat") {
      return {
        type: "boss-defeat",
        kicker: "Boss Defeat",
        detail: `${(payload.boss && payload.boss.name) || "Boss"} falls.`,
        priority: "high",
        emphasis: "high"
      };
    }

    if (payload.event === "retreat") {
      return {
        type: "boss-retreat",
        kicker: "Boss Retreat",
        detail: `${(payload.boss && payload.boss.name) || "Boss"} withdraws.`,
        priority: "soft",
        emphasis: "soft"
      };
    }
  }

  return systemEntry("Guild", "Guild synced.");
}

function createEventLogItem(entry) {
  const safeEntry = buildFeedEntry(entry);

  const item = document.createElement("div");
  updateEventLogItem(item, safeEntry);
  return item;
}

function renderRecentGuildEvents(events) {
  if (!eventLog) return;

  eventLog.innerHTML = "";
  const entries = Array.isArray(events) ? events.slice(0, 5) : [];

  entries.slice().reverse().forEach((payload) => {
    const item = createEventLogItem(describeGuildEvent(payload));
    eventLog.prepend(item);
  });
}

function applyStateSyncPayload(payload) {
  if (payload.scene && payload.scene.sceneName) {
    setActiveScene(payload.scene.sceneName);
  }

  if (payload.shop && typeof payload.shop === "object") {
    applyShopStatePayload(payload.shop);
  } else if (payload.boss && typeof payload.boss === "object") {
    applyShopStatePayload({
      boss: payload.boss,
      nextSpawnAt: bossState.nextSpawnAt,
      xpBoostEndsAt: xpBoostState.expiresAt
    });
  }

  if (Array.isArray(payload.recentGuildEvents)) {
    renderRecentGuildEvents(payload.recentGuildEvents);
  }
}

function handleOverlayPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  syncRelaySession(payload);
  if (!shouldProcessRelayPayload(payload)) return;

  if (payload.type === "state_sync") {
    applyStateSyncPayload(payload);
    return;
  }

  if (payload.type === "boss_update") {
    applyBossUpdatePayload(payload);
    return;
  }

  if (payload.type === "player_attack") {
    bossLastHit.textContent = `${payload.by || "Traveler"} used ${payload.command || "!attack"} for ${payload.damage || 0} damage.`;
    addEventLog({
      type: "attack",
      kicker: "Attack",
      detail: `${payload.by || "Traveler"} hit ${payload.damage || 0}${payload.hpText ? ` • ${payload.hpText} left` : ""}`,
      actor: payload.by || "Traveler",
      damage: Number(payload.damage || 0),
      hpText: payload.hpText || "",
      priority: "low",
      emphasis: "medium"
    });
    return;
  }

  if (payload.type === "attack") {
    bossLastHit.textContent = `${payload.by || "Traveler"} used ${payload.command || "!attack"} for ${payload.damage || 0} damage.`;
    addEventLog(describeGuildEvent(payload));
    return;
  }

  if (payload.type === "chat" && payload.username && payload.message) {
    handleIncomingChat(payload.username, payload.message);
    return;
  }

  if (payload.type === "shop") {
    showShopToastMessageWithOptions("Shop Purchase", `${payload.by || "A traveler"} bought ${payload.itemName || "an item"}.`, { tone: "purchase" });
    addEventLog(describeGuildEvent(payload));
    return;
  }

  if (payload.type === "scene_change") {
    const sceneName = String(payload.sceneName || "").trim();
    if (!sceneName) return;
    setActiveScene(sceneName);
    addEventLog({ type: "scene", kicker: "Scene", detail: `${sceneName} live.`, priority: "soft", emphasis: "soft" });
    return;
  }

  if (payload.type === "shop_purchase") {
    showShopToastMessageWithOptions("Shop Purchase", `${payload.by || "A traveler"} bought ${payload.itemName || "an item"}.`, { tone: "purchase" });
    addEventLog({
      type: "purchase",
      kicker: "Purchase",
      detail: `${payload.by || "Traveler"} bought ${payload.itemName || "item"}.`,
      priority: "low",
      emphasis: "medium"
    });
    return;
  }

  if (payload.type === "shop_effect") {
    showShopToastMessageWithOptions("Arcane Effect", `${payload.by || "A traveler"} invoked ${payload.itemName || payload.effectKey}.`, { tone: "effect" });
    triggerScreenShudder(0.75);
    return;
  }

  if (payload.type === "shop_sound") {
    showShopToastMessageWithOptions("Guild Sound", `${payload.by || "A traveler"} played ${payload.itemName || payload.soundKey}.`, { tone: "purchase" });
    return;
  }

  if (payload.type === "shop_xpboost") {
    xpBoostState.multiplier = Math.max(1, Number(payload.multiplier || 1));
    xpBoostState.expiresAt = Number(payload.endsAt || payload.expiresAt || 0);
    renderXpBoostBadge();
    showShopToastMessageWithOptions("XP Boost Active", `${payload.by || "A traveler"} activated ${xpBoostState.multiplier}x XP.`, { tone: "boost" });
    return;
  }

  if (payload.type === "shop_state") {
    applyShopStatePayload(payload);
    return;
  }

  if (payload.type === "boss_timer") {
    bossState.nextSpawnAt = Number(payload.nextSpawnAt || 0);
    renderBossCountdown();
    return;
  }

  if (payload.type === "boss_spawn") {
    bossState.active = true;
    bossState.key = payload.boss?.key || "";
    bossState.name = payload.boss?.name || "Unknown Boss";
    bossState.tier = Number(payload.boss?.tier || 1);
    bossState.visual = payload.boss?.visual || null;
    bossState.hp = Number(payload.boss?.hp || 0);
    bossState.maxHp = Number(payload.boss?.maxHp || 0);
    bossState.nextSpawnAt = 0;
    bossState.recentFighters = [];
    bossThresholdText.textContent = "";
    bossLastHit.textContent = `Summoned by ${payload.boss?.summonedBy || "the guild"}.`;
    renderBossPanel();
    renderBossCountdown();
    nudgeBossHpBar("spawn");
    pulseBossPanel("spawn");
    showShopToastMessageWithOptions("Boss Spawned", `${bossState.name} enters.`, { tone: "effect" });
    addEventLog({ type: "boss-spawn", kicker: "Boss Spawn", detail: `${bossState.name} enters.`, priority: "high", emphasis: "high" });
    return;
  }

  if (payload.type === "boss_damage") {
    bossState.active = true;
    bossState.key = payload.bossKey || bossState.key;
    bossState.name = payload.bossName || bossState.name;
    bossState.hp = Number(payload.hp || bossState.hp);
    bossState.maxHp = Number(payload.maxHp || bossState.maxHp);
    if (Array.isArray(payload.recentFighters)) {
      bossState.recentFighters = payload.recentFighters;
    }
    bossLastHit.textContent = `${payload.by || "Traveler"} used ${payload.command || "!attack"} for ${payload.damage || 0} damage.`;
    nudgeBossHpBar("damage");
    pulseBossPanel("damage");
    renderBossPanel();
    return;
  }

  if (payload.type === "boss_threshold") {
    const thresholdPercent = Math.round(Number(payload.threshold || 0) * 100);
    bossThresholdText.textContent = `${thresholdPercent}% Rage`;
    triggerScreenShudder(1.1);
    return;
  }

  if (payload.type === "boss_defeat") {
    pulseBossPanel("defeat");
    showShopToastMessageWithOptions("Boss Defeated", `${payload.bossName || "Boss"} falls.`, { tone: "effect" });
    addEventLog({ type: "boss-defeat", kicker: "Boss Defeat", detail: `${payload.bossName || "Boss"} falls.`, priority: "high", emphasis: "high" });
    bossState.active = false;
    bossState.key = "";
    bossState.name = "";
    bossState.hp = 0;
    bossState.maxHp = 0;
    bossState.recentFighters = [];
    bossThresholdText.textContent = "";
    renderBossPanel();
    return;
  }

  if (payload.type === "boss_retreat") {
    showShopToastMessageWithOptions("Boss Retreated", `${payload.bossName || "Boss"} withdraws.`, { tone: "effect" });
    addEventLog({ type: "boss-retreat", kicker: "Boss Retreat", detail: `${payload.bossName || "Boss"} withdraws.`, priority: "soft", emphasis: "soft" });
    bossState.active = false;
    bossState.key = "";
    bossState.name = "";
    bossState.hp = 0;
    bossState.maxHp = 0;
    bossState.recentFighters = [];
    bossThresholdText.textContent = "";
    renderBossPanel();
    return;
  }

  if (payload.type === "boss_rewards") {
    awardXP(Number(payload.guildXp || 0));
    addEventLog({ type: "reward", kicker: "Reward", detail: `Guild +${payload.guildXp || 0} XP.`, priority: "medium", emphasis: "medium" });
  }
}

function applyBossUpdatePayload(payload) {
  const boss = payload.boss || {};

  if (payload.event === "spawn") {
    bossState.active = true;
    bossState.key = boss.key || "";
    bossState.name = boss.name || "Unknown Boss";
    bossState.tier = Number(boss.tier || 1);
    bossState.visual = boss.visual || null;
    bossState.hp = Number(boss.hp || 0);
    bossState.maxHp = Number(boss.maxHp || 0);
    bossState.nextSpawnAt = 0;
    bossState.recentFighters = Array.isArray(boss.recentFighters) ? boss.recentFighters : [];
    bossThresholdText.textContent = "";
    bossLastHit.textContent = `Summoned by ${boss.summonedBy || "the guild"}.`;
    renderBossPanel();
    renderBossCountdown();
    nudgeBossHpBar("spawn");
    pulseBossPanel("spawn");
    showShopToastMessageWithOptions("Boss Spawned", `${bossState.name} enters.`, { tone: "effect" });
    addEventLog({ type: "boss-spawn", kicker: "Boss Spawn", detail: `${bossState.name} enters.`, priority: "high", emphasis: "high" });
    return;
  }

  if (payload.event === "damage") {
    bossState.active = true;
    bossState.key = boss.key || bossState.key;
    bossState.name = boss.name || bossState.name;
    bossState.hp = Number(boss.hp || bossState.hp);
    bossState.maxHp = Number(boss.maxHp || bossState.maxHp);
    if (Array.isArray(boss.recentFighters)) {
      bossState.recentFighters = boss.recentFighters;
    }
    bossLastHit.textContent = `${payload.lastAttack?.by || "Traveler"} used ${payload.lastAttack?.command || "!attack"} for ${payload.lastAttack?.damage || 0} damage.`;
    nudgeBossHpBar("damage");
    pulseBossPanel("damage");
    renderBossPanel();
    return;
  }

  if (payload.event === "threshold") {
    const thresholdPercent = Math.round(Number(payload.threshold || 0) * 100);
    bossThresholdText.textContent = `${thresholdPercent}% Rage`;
    triggerScreenShudder(1.1);
    return;
  }

  if (payload.event === "defeat") {
    pulseBossPanel("defeat");
    showShopToastMessageWithOptions("Boss Defeated", `${boss.name || "Boss"} falls.`, { tone: "effect" });
    addEventLog({ type: "boss-defeat", kicker: "Boss Defeat", detail: `${boss.name || "Boss"} falls.`, priority: "high", emphasis: "high" });
    bossState.active = false;
    bossState.key = "";
    bossState.name = "";
    bossState.hp = 0;
    bossState.maxHp = 0;
    bossState.recentFighters = [];
    bossThresholdText.textContent = "";
    renderBossPanel();
    return;
  }

  if (payload.event === "retreat") {
    showShopToastMessageWithOptions("Boss Retreated", `${boss.name || "Boss"} withdraws.`, { tone: "effect" });
    addEventLog({ type: "boss-retreat", kicker: "Boss Retreat", detail: `${boss.name || "Boss"} withdraws.`, priority: "soft", emphasis: "soft" });
    bossState.active = false;
    bossState.key = "";
    bossState.name = "";
    bossState.hp = 0;
    bossState.maxHp = 0;
    bossState.recentFighters = [];
    bossThresholdText.textContent = "";
    renderBossPanel();
  }
}

function updateOverlayScale() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const scale = Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight);
  const safeScale = Math.max(0.1, scale);
  overlay.style.setProperty("--overlay-scale", safeScale.toFixed(4));
}

function normalizeSceneName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isGameScene(sceneName) {
  return normalizeSceneName(sceneName) === normalizeSceneName(sceneControlConfig.gameSceneName);
}

function isJustChattingScene(sceneName) {
  return normalizeSceneName(sceneName) === normalizeSceneName(sceneControlConfig.justChattingSceneName);
}

function clearQuestlineRevealTimer() {
  if (!sceneState.questlineTimer) return;
  clearTimeout(sceneState.questlineTimer);
  sceneState.questlineTimer = null;
}

function clearEventsRevealTimer() {
  if (!sceneState.eventsTimer) return;
  clearTimeout(sceneState.eventsTimer);
  sceneState.eventsTimer = null;
}

function tempShowEventsPanel(durationMs = 0) {
  if (!overlay || !isGameScene(sceneState.currentName)) return;
  clearEventsRevealTimer();
  overlay.classList.add("events-temp-visible");
  const revealDurationMs = Math.max(sceneControlConfig.gameEventsRevealDurationMs, Number(durationMs || 0));
  sceneState.eventsTimer = setTimeout(() => {
    overlay.classList.remove("events-temp-visible");
    sceneState.eventsTimer = null;
  }, revealDurationMs);
}

function applySceneLayoutState() {
  if (!overlay || !sceneControlConfig.enabled) return;

  const gameScene = isGameScene(sceneState.currentName);
  const justChattingScene = isJustChattingScene(sceneState.currentName);
  const questlineTempVisible = gameScene && Date.now() < sceneState.questlineVisibleUntil;

  overlay.classList.toggle("scene-game", gameScene);
  overlay.classList.toggle("scene-just-chatting", justChattingScene);
  overlay.classList.toggle("scene-default", !gameScene && !justChattingScene);
  overlay.classList.toggle("questline-temp-visible", questlineTempVisible);

  if (!gameScene) {
    sceneState.questlineVisibleUntil = 0;
    clearQuestlineRevealTimer();
    clearEventsRevealTimer();
    overlay.classList.remove("events-temp-visible");
  }
}

function setActiveScene(sceneName) {
  if (!sceneControlConfig.enabled) return;

  const normalizedIncoming = normalizeSceneName(sceneName);
  if (!normalizedIncoming) return;

  if (normalizedIncoming === normalizeSceneName(sceneState.currentName)) {
    return;
  }

  sceneState.currentName = String(sceneName).trim();
  applySceneLayoutState();
}

function parseRevealDurationMs(messageText) {
  const parts = String(messageText || "").trim().split(/\s+/);
  const seconds = Number(parts[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return sceneControlConfig.questlineRevealDurationMs;
  }

  const ms = Math.round(seconds * 1000);
  return Math.max(sceneControlConfig.minRevealDurationMs, Math.min(sceneControlConfig.maxRevealDurationMs, ms));
}

function handleSceneCommand(username, messageText) {
  if (!sceneControlConfig.enabled || !sceneControlConfig.questlineRevealCommand) {
    return false;
  }

  const text = String(messageText || "").trim();
  if (!text) return false;

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  if (command !== sceneControlConfig.questlineRevealCommand.toLowerCase()) {
    return false;
  }

  if (!isGameScene(sceneState.currentName)) {
    return true;
  }

  const durationMs = parseRevealDurationMs(text);
  sceneState.questlineVisibleUntil = Date.now() + durationMs;
  applySceneLayoutState();

  clearQuestlineRevealTimer();
  sceneState.questlineTimer = setTimeout(() => {
    sceneState.questlineVisibleUntil = 0;
    sceneState.questlineTimer = null;
    applySceneLayoutState();
  }, durationMs);

  const safeUser = String(username || "Traveler").trim() || "Traveler";
  const seconds = Math.round(durationMs / 1000);
  addEventLog(`${safeUser} revealed guild questline for ${seconds}s.`);
  return true;
}

function handleIncomingChat(username, messageText) {
  const handledCommand = handleSceneCommand(username, messageText);
  if (handledCommand) {
    return;
  }

  processChatParticipation(username, messageText);
}

function getCurrentQuest() {
  if (!questlineConfig.quests.length) return null;
  return questlineConfig.quests[questlineState.activeQuestIndex] || null;
}

function getQuestProgress(questId) {
  return questlineState.progressByQuestId.get(questId) || 0;
}

function setQuestProgress(questId, value) {
  questlineState.progressByQuestId.set(questId, Math.max(0, value));
}

function renderQuestlinePanel() {
  if (!questlinePanel) return;

  if (!questlineConfig.enabled || !questlineConfig.quests.length) {
    questlinePanel.classList.add("hidden");
    return;
  }

  questlinePanel.classList.remove("hidden");

  const quest = getCurrentQuest();
  if (!quest) {
    questActiveTitle.textContent = "All Contracts Completed";
    questActiveObjective.textContent = "The guild awaits new trials.";
    questProgressText.textContent = "Complete";
    questProgressReward.textContent = "+0 XP";
    questProgressFill.style.width = "100%";
    questUpcomingList.textContent = "No active contracts.";
    return;
  }

  const progress = Math.min(getQuestProgress(quest.id), quest.target);
  const percent = Math.min(100, (progress / quest.target) * 100);

  questActiveTitle.textContent = quest.title;
  questActiveObjective.textContent = quest.objective;
  questProgressText.textContent = `${progress} / ${quest.target}`;
  questProgressReward.textContent = `+${quest.rewardXP} XP`;
  questProgressFill.style.width = `${percent}%`;

  questUpcomingList.innerHTML = "";
  const item = document.createElement("div");
  item.className = "quest-upcoming-item";
  item.textContent = "Next contract chosen at random.";
  questUpcomingList.appendChild(item);
}

function advanceQuestline() {
  const quests = questlineConfig.quests;
  if (!quests.length) return;

  let nextIndex = questlineState.activeQuestIndex;
  if (quests.length > 1) {
    do {
      nextIndex = Math.floor(Math.random() * quests.length);
    } while (nextIndex === questlineState.activeQuestIndex);
  }

  questlineState.activeQuestIndex = nextIndex;
  questlineState.progressByQuestId.delete(quests[nextIndex].id);
}

function applyQuestProgress(activityKey, sourceUser = "Traveler") {
  if (!questlineConfig.enabled) return;

  const quest = getCurrentQuest();
  if (!quest) return;

  const directGain = Number(quest.track[activityKey] || 0);
  const fallbackGain = activityKey.startsWith("event.") ? Number(quest.track["event.any"] || 0) : 0;
  const gain = directGain || fallbackGain;

  if (gain <= 0) return;

  const currentProgress = getQuestProgress(quest.id);
  const nextProgress = Math.min(quest.target, currentProgress + gain);
  setQuestProgress(quest.id, nextProgress);
  renderQuestlinePanel();

  if (nextProgress >= quest.target) {
    awardXP(quest.rewardXP);
    showAlert("Contract Fulfilled", `${quest.title} completed by the guild (+${quest.rewardXP} XP).`);
    addEventLog(`Quest Complete - ${quest.title} (${sourceUser})`);
    advanceQuestline();
    renderQuestlinePanel();
  }
}

function normalizeChatMessage(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLongestRunRatio(text) {
  if (!text.length) return 1;

  let longestRun = 1;
  let currentRun = 1;

  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) {
      currentRun++;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return longestRun / text.length;
}

function getChatUserState(username) {
  if (!chatUserState.has(username)) {
    chatUserState.set(username, {
      validMessages: 0,
      lastCountedAt: 0,
      lastNormalized: "",
      milestonesAwarded: new Set()
    });
  }

  return chatUserState.get(username);
}

function validateChatMessage(messageText, state, now) {
  const normalized = normalizeChatMessage(messageText);
  const compact = normalized.replace(/\s/g, "");
  const words = normalized.length ? normalized.split(" ").filter(Boolean) : [];

  if (!normalized) {
    return { valid: false, normalized, reason: "empty" };
  }

  if (now - state.lastCountedAt < chatConfig.messageCooldownMs) {
    return { valid: false, normalized, reason: "cooldown" };
  }

  if (normalized.length < chatConfig.minMessageLength) {
    return { valid: false, normalized, reason: "too-short" };
  }

  if (words.length < chatConfig.minWordCount) {
    return { valid: false, normalized, reason: "too-few-words" };
  }

  if (new Set(compact).size < chatConfig.minUniqueChars) {
    return { valid: false, normalized, reason: "low-unique-chars" };
  }

  if (getLongestRunRatio(compact) > chatConfig.maxRepeatedCharRatio) {
    return { valid: false, normalized, reason: "repeated-chars" };
  }

  if (normalized === state.lastNormalized) {
    return { valid: false, normalized, reason: "duplicate" };
  }

  return { valid: true, normalized, reason: "ok" };
}

function awardXP(xpGain) {
  const multiplier = getXpMultiplier();
  const adjusted = Math.max(0, Math.round(Number(xpGain || 0) * multiplier));
  currentXP += adjusted;
  levelUpCheck();
  updateXPBar();
}

function getMilestoneNotification(milestone) {
  const pool = chatConfig.milestoneNotifications;
  if (!pool.length) {
    return "Guild Presence Strengthens";
  }

  return pool[milestone % pool.length];
}

function processChatParticipation(username, messageText) {
  if (!chatConfig.enabled) return;

  const safeUser = String(username || "Traveler").trim() || "Traveler";
  const state = getChatUserState(safeUser.toLowerCase());
  const now = Date.now();
  const validation = validateChatMessage(messageText, state, now);

  if (!validation.valid) {
    return;
  }

  state.lastCountedAt = now;
  state.lastNormalized = validation.normalized;
  state.validMessages++;

  applyQuestProgress("chat.valid", safeUser);

  // Award base participation XP every N valid messages.
  if (state.validMessages % chatConfig.messagesPerReward === 0) {
    const previousLevel = currentLevel;
    awardXP(chatConfig.xpPerReward);

    if (currentLevel === previousLevel) {
      addEventLog(`Tavern chatter: ${safeUser} sustained presence (+${chatConfig.xpPerReward} XP).`);
    }
  }

  // One-time milestone rewards and themed announcements.
  for (const milestone of sortedMilestones) {
    if (state.validMessages >= milestone && !state.milestonesAwarded.has(milestone)) {
      const bonusXP = chatConfig.milestoneBonuses[milestone] || 0;
      state.milestonesAwarded.add(milestone);

      const previousLevel = currentLevel;
      if (bonusXP > 0) {
        awardXP(bonusXP);
      }

      const milestoneTitle = getMilestoneNotification(milestone);
      const milestoneMessage = `${safeUser} reached ${milestone} valid tavern calls (+${bonusXP} XP).`;

      if (currentLevel === previousLevel) {
        showAlert(milestoneTitle, milestoneMessage);
      }

      addEventLog(`${milestoneTitle} - ${safeUser} (${milestone} messages)`);
    }
  }
}

function connectLocalChatSocket() {
  if (!canUseLocalTransport()) return;

  if (chatLocalSocket && (chatLocalSocket.readyState === WebSocket.OPEN || chatLocalSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    chatLocalSocket = new WebSocket(chatConfig.localWsUrl);
    if (shouldLogOverlayWsDebug()) {
      console.log(`[overlay][ws][connect] ${chatConfig.localWsUrl}`);
    }
    syncOverlayDebugBindings();
  } catch (error) {
    if (shouldLogOverlayWsDebug()) {
      console.error(`[overlay][ws][connect-error] ${chatConfig.localWsUrl}`, error);
    }
    scheduleLocalSocketReconnect();
    return;
  }

  chatLocalSocket.addEventListener("open", () => {
    if (shouldLogOverlayWsDebug()) {
      console.log(`[overlay][ws][open] ${chatConfig.localWsUrl}`);
    }
    setTransportState({ activeSource: "local", status: "waiting", lastError: "" });
    addEventLog("Local chat relay linked.");
  });

  chatLocalSocket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      logOverlayWsMessage("incoming", payload);
      noteTransportActivity("local", payload);
      handleOverlayPayload(payload);
    } catch (error) {
      if (shouldLogOverlayWsDebug()) {
        console.error("[overlay][ws][parse-error]", event.data, error);
      }
    }
  });

  chatLocalSocket.addEventListener("close", (event) => {
    if (shouldLogOverlayWsDebug()) {
      console.warn(`[overlay][ws][close] code=${event.code} reason=${event.reason || "n/a"}`);
    }
    chatLocalSocket = null;
    syncOverlayDebugBindings();
    setTransportState({ activeSource: "local", status: "stale", lastError: "Disconnected" });
    scheduleLocalSocketReconnect();
  });

  chatLocalSocket.addEventListener("error", (event) => {
    if (shouldLogOverlayWsDebug()) {
      console.error("[overlay][ws][error]", event);
    }
    syncOverlayDebugBindings();
    setTransportState({ activeSource: "local", status: "error", lastError: "Reconnect" });
    scheduleLocalSocketReconnect();
  });
}

function scheduleLocalSocketReconnect() {
  if (!canUseLocalTransport()) {
    return;
  }

  if (chatSocketRetryTimer) {
    return;
  }

  chatSocketRetryTimer = setTimeout(() => {
    chatSocketRetryTimer = null;
    if (shouldLogOverlayWsDebug()) {
      console.log(`[overlay][ws][reconnect] retrying ${chatConfig.localWsUrl}`);
    }
    connectLocalChatSocket();
  }, 2500);
}

function logOverlayWsMessage(direction, payload) {
  if (!shouldLogOverlayWsDebug()) {
    return;
  }

  let summary = "";

  if (payload && typeof payload === "object") {
    try {
      summary = JSON.stringify(payload);
    } catch (error) {
      summary = String(payload.type || "unknown");
    }
  } else {
    summary = String(payload || "");
  }

  if (summary.length > 400) {
    summary = `${summary.slice(0, 397)}...`;
  }

  console.log(`[overlay][ws][${direction}] ${summary}`);
}

function getRankName(level) {
  return RANK_NAMES[(level - 1) % RANK_NAMES.length];
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function setSceneGlowIntensity(intensity, durationMs = 260) {
  const clamped = Math.max(0, Math.min(1.35, intensity));
  levelupScene.style.setProperty("--audio-glow", clamped.toFixed(2));

  if (glowTimer) {
    clearTimeout(glowTimer);
  }

  glowTimer = setTimeout(() => {
    levelupScene.style.setProperty("--audio-glow", "0");
  }, durationMs);
}

function clearPulseSequence() {
  pulseTimers.forEach((timerId) => {
    clearTimeout(timerId);
  });
  pulseTimers = [];
}

function playPulseSequence(baseIntensity, isMilestone) {
  clearPulseSequence();

  const beats = isMilestone
    ? [
        { t: 0, glow: 0.85, shake: 0.9, hold: 180 },
        { t: 220, glow: 1.05, shake: 1.05, hold: 180 },
        { t: 450, glow: 1.2, shake: 1.28, hold: 240 },
        { t: 760, glow: 0.78, shake: 0.7, hold: 220 }
      ]
    : [
        { t: 0, glow: 0.68, shake: 0.72, hold: 150 },
        { t: 250, glow: 0.88, shake: 0.98, hold: 200 },
        { t: 560, glow: 0.58, shake: 0.56, hold: 180 }
      ];

  beats.forEach((beat) => {
    const timerId = setTimeout(() => {
      const glow = Math.min(1.35, beat.glow * baseIntensity);
      const shake = Math.min(1.5, beat.shake * baseIntensity);
      setSceneGlowIntensity(glow, beat.hold);
      triggerScreenShudder(shake);
    }, beat.t);

    pulseTimers.push(timerId);
  });
}

function triggerScreenShudder(intensity = 0.8) {
  const clamped = Math.max(0.2, Math.min(1.5, intensity));
  overlay.style.setProperty("--shake-amp", `${(2 + clamped * 5).toFixed(2)}px`);

  overlay.classList.remove("shudder");
  void overlay.offsetWidth;
  overlay.classList.add("shudder");

  if (shudderTimer) {
    clearTimeout(shudderTimer);
  }

  shudderTimer = setTimeout(() => {
    overlay.classList.remove("shudder");
  }, 430);
}

function applyRankSigil(level, isMilestone) {
  if (!sigilPrimary || !sigilSecondary) return;

  const index = (level - 1) % SIGIL_FORMS.length;
  const form = SIGIL_FORMS[index];
  sigilPrimary.setAttribute("d", form.primary);
  sigilSecondary.setAttribute("d", form.secondary);

  // Milestones get denser ritual linework.
  sigilPrimary.style.strokeWidth = isMilestone ? "3.2" : "2.6";
  sigilSecondary.style.strokeWidth = isMilestone ? "2.8" : "2.2";
}

function seedProceduralParticles(isMilestone) {
  embers.forEach((ember, index) => {
    const direction = index % 2 === 0 ? -1 : 1;
    const spread = randomRange(70, 360) * direction;
    const arcDrift = randomRange(-130, 130);

    ember.style.setProperty("--sx", `${Math.round(spread)}px`);
    ember.style.setProperty("--sy", `${Math.round(randomRange(10, 84))}px`);
    ember.style.setProperty("--dx", `${Math.round(arcDrift)}px`);
    ember.style.setProperty("--dy", `${Math.round(randomRange(210, isMilestone ? 420 : 340))}px`);
    ember.style.setProperty("--scale", randomRange(0.55, 1.2).toFixed(2));
    ember.style.setProperty("--delay", `${randomRange(0.02, 0.95).toFixed(2)}s`);
    ember.style.setProperty("--dur", `${randomRange(1.7, isMilestone ? 3.1 : 2.6).toFixed(2)}s`);
  });

  sparks.forEach((spark, index) => {
    const rotation = Math.round(randomRange(-32, 212));
    const offset = Math.round(randomRange(-130, 120));
    spark.style.transform = `translate(-50%, ${offset}px) rotate(${rotation}deg)`;
    spark.style.animationDelay = `${randomRange(0, 0.35).toFixed(2)}s`;
  });
}

function getLevelupTitle(levelsGained, isMilestone) {
  if (levelsGained >= 2) {
    return "ASCENSION x" + levelsGained;
  }

  if (isMilestone) {
    return "ROGUE ASCENSION";
  }

  const index = Math.floor(Math.random() * LEVELUP_TITLES.length);
  return LEVELUP_TITLES[index];
}

function updateXPBar() {
  const percent = (currentXP / xpToNext) * 100;
  xpBar.style.width = `${Math.min(percent, 100)}%`;
  xpText.textContent = `${currentXP} / ${xpToNext} XP`;
  levelLabel.textContent = `Level ${currentLevel} ${getRankName(currentLevel)}`;
}

function addEventLog(entry) {
  const safeEntry = buildFeedEntry(entry);

  tempShowEventsPanel(safeEntry.durationMs);

  if (mergeAttackFeedEntry(safeEntry)) {
    dispatchOverlayFeedback({ system: "event-log", entry: safeEntry, collapsed: true });
    return;
  }

  const item = createEventLogItem(safeEntry);
  eventLog.prepend(item);
  if (safeEntry.type === "attack") {
    attackFeedBurst = {
      item,
      count: 1,
      totalDamage: Number(safeEntry.damage || 0),
      lastHpText: safeEntry.hpText || "",
      lastAt: Date.now()
    };
  } else {
    attackFeedBurst = null;
  }

  dispatchOverlayFeedback({ system: "event-log", entry: safeEntry });

  trimEventLog();
}

function showAlert(title, message) {
  if (alertTimer) {
    clearTimeout(alertTimer);
  }

  alertTitle.textContent = title;
  alertMessage.textContent = message;
  alertBox.classList.remove("hidden");

  // Force animation replay for repeated alerts.
  alertBox.style.animation = "none";
  void alertBox.offsetWidth;
  alertBox.style.animation = "";

  alertTimer = setTimeout(() => {
    alertBox.classList.add("hidden");
  }, ALERT_DURATION_MS);
}

function stopLevelUpScene() {
  if (levelupTimer) {
    clearTimeout(levelupTimer);
    levelupTimer = null;
  }

  if (glowTimer) {
    clearTimeout(glowTimer);
    glowTimer = null;
  }

  if (shudderTimer) {
    clearTimeout(shudderTimer);
    shudderTimer = null;
  }

  clearPulseSequence();

  levelupScene.classList.remove("active", "milestone", "dev-hold", "dev-persist");
  levelupScene.classList.add("hidden");
  levelupScene.setAttribute("aria-hidden", "true");
  levelupScene.style.setProperty("--audio-glow", "0");
  overlay.classList.remove("shudder");
  overlay.classList.remove("levelup-active");
}

function playLevelUpSfx() {
  // Hook this to your own sound system if desired.
  // Example: window.dispatchEvent(new CustomEvent("overlay:levelup-sfx"));
  window.dispatchEvent(new CustomEvent(SCENE_AUDIO_EVENT, {
    detail: {
      intensity: 0.82,
      durationMs: 320
    }
  }));
}

function triggerLevelUpEffects(level, options = {}) {
  const levelsGained = options.levelsGained || 1;
  const isMilestone = options.isMilestone || level % 5 === 0;
  const shockwavePower = Math.min(1.5, 0.72 + levelsGained * 0.24 + (isMilestone ? 0.28 : 0));
  const rankName = getRankName(level);

  const titleText = getLevelupTitle(levelsGained, isMilestone);
  const subtitleText = isMilestone ? "Guild Promotion Ceremony" : "Guild Rank Increased";

  levelupTitle.textContent = titleText;
  levelupSubtitle.textContent = subtitleText;
  levelupRankLine.textContent = `Now Level ${level} - ${rankName}`;
  applyRankSigil(level, isMilestone);
  seedProceduralParticles(isMilestone);

  // Reset then replay the full-screen animation timeline.
  stopLevelUpScene();
  void levelupScene.offsetWidth;

  levelupScene.classList.remove("hidden");
  levelupScene.classList.add("active");

  if (isMilestone || levelsGained >= 2) {
    levelupScene.classList.add("milestone");
  }

  levelupScene.setAttribute("aria-hidden", "false");
  overlay.classList.add("levelup-active");
  playPulseSequence(shockwavePower, isMilestone);

  showAlert(titleText, `${subtitleText}: Level ${level} ${rankName}`);
  playLevelUpSfx();

  if (DEV_MODE && DEV_HOLD_SCENE) {
    levelupTimer = setTimeout(() => {
      levelupScene.classList.add("dev-hold");
    }, 1150);
    return;
  }

  const hideAfterMs = DEV_MODE ? LEVELUP_DURATION_MS + DEV_EXTRA_VISIBLE_MS : LEVELUP_DURATION_MS;
  levelupTimer = setTimeout(() => {
    stopLevelUpScene();
  }, hideAfterMs);
}

window.addEventListener(SCENE_AUDIO_EVENT, (event) => {
  const detail = event.detail || {};
  const intensity = Number(detail.intensity ?? 0.7);
  const durationMs = Number(detail.durationMs ?? 260);
  setSceneGlowIntensity(intensity, durationMs);
});

function levelUpCheck() {
  let levelsGained = 0;

  while (currentXP >= xpToNext) {
    currentXP -= xpToNext;
    currentLevel++;
    xpToNext = Math.floor(xpToNext * 1.2);
    levelsGained++;
  }

  if (levelsGained > 0) {
    triggerLevelUpEffects(currentLevel, {
      levelsGained,
      isMilestone: currentLevel % 5 === 0
    });

    if (levelsGained > 1) {
      addEventLog(`Massive breakthrough: +${levelsGained} ranks to Level ${currentLevel}.`);
    } else {
      addEventLog(`Guild Rank is now Level ${currentLevel}.`);
    }
  }
}

function triggerEvent(type, user = "Traveler") {
  const config = overlayConfig.eventText[type];
  const xpGain = overlayConfig.xpPerEvent[type] || 0;

  if (!config) return;

  const msg = config.message.replace("{user}", user);
  const previousLevel = currentLevel;

  applyQuestProgress(`event.${type}`, user);
  awardXP(xpGain);

  if (currentLevel === previousLevel) {
    showAlert(config.title, msg);
  }

  addEventLog(`${config.title} - ${user} (+${xpGain} XP)`);
}

function bindChatIntegration() {
  // Integration point 1: Dispatch browser events from your chat bridge.
  // Example:
  // window.dispatchEvent(new CustomEvent("overlay:chat-message", {
  //   detail: { username: "Viewer123", message: "The guild stands with you!" }
  // }));
  window.addEventListener(CHAT_EVENT_NAME, (event) => {
    const detail = event.detail || {};
    handleIncomingChat(detail.username || detail.user, detail.message || detail.text || "");
  });

  // Integration point 3: If you expose a tmi.js client globally, hook it here.
  // Expected shape: window.overlayChatClient.on("message", (channel, tags, message) => ...)
  if (window.overlayChatClient && typeof window.overlayChatClient.on === "function") {
    window.overlayChatClient.on("message", (channel, tags, message) => {
      handleIncomingChat(tags?.displayName || tags?.username, message);
    });
  }

  // Integration point 4: choose Twitch broadcast or local relay.
  beginTransportBootstrap();
}

updateXPBar();
renderQuestlinePanel();
applySceneLayoutState();
renderBossPanel();
renderBossCountdown();
renderXpBoostBadge();
syncOverlayDebugBindings();
bindChatIntegration();
updateOverlayScale();
window.addEventListener("resize", updateOverlayScale);

if (!bossCountdownTicker) {
  bossCountdownTicker = setInterval(() => {
    renderBossCountdown();
    renderXpBoostBadge();
    renderTransportStatus();
  }, 1000);
}

// Debug helper from browser console if needed:
// processChatParticipation("TestUser", "The tavern is alive tonight, guild!")

// Test buttons from browser console if needed:
// triggerEvent("follow", "TestUser")
// triggerEvent("sub", "RockettFan")
// triggerEvent("raid", "DungeonCrew")
// stopLevelUpScene()

renderTransportStatus();
