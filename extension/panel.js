(function () {
  "use strict";

  const RUNTIME_OVERRIDE_STORAGE_KEY = "rockett-dnd-runtime-overrides";

  // ── State ────────────────────────────────────────────────────────────────────
  const state = {
    boss: null,          // { name, hp, maxHp } or null
    nextSpawnAt: 0,      // epoch ms
    xpBoostEndsAt: 0,   // epoch ms
    leaderboard: [],     // [{ username, gold, title }]
    purchases: []        // last 5 purchases [{ who, itemName, itemType, at }]
  };

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
    const stored = readStoredRuntimeOverrides();
    const params = new URLSearchParams(window.location.search);
    return {
      transportMode: String(params.get("transport") || stored.transportMode || "auto").trim().toLowerCase(),
      localWsUrl: String(params.get("ws") || stored.localWsUrl || "ws://127.0.0.1:8787").trim(),
      expectedChannelId: String(params.get("channelId") || stored.expectedChannelId || "").trim(),
      authTimeoutMs: Math.max(2000, Number(params.get("authTimeoutMs") || stored.authTimeoutMs || 12000)),
      staleAfterMs: Math.max(5000, Number(params.get("staleAfterMs") || stored.staleAfterMs || 45000))
    };
  }

  function saveRuntimeOverrides(overrides) {
    window.localStorage.setItem(RUNTIME_OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  }

  function clearRuntimeOverrides() {
    window.localStorage.removeItem(RUNTIME_OVERRIDE_STORAGE_KEY);
  }

  const runtimeOverrides = readRuntimeOverrides();
  const requestedModeRaw = runtimeOverrides.transportMode;
  const localWsUrl = runtimeOverrides.localWsUrl;
  const expectedChannelId = runtimeOverrides.expectedChannelId;
  const authTimeoutMs = runtimeOverrides.authTimeoutMs;
  const staleAfterMs = runtimeOverrides.staleAfterMs;
  const transportState = {
    requestedMode: ["auto", "local", "twitch"].includes(requestedModeRaw) ? requestedModeRaw : "auto",
    activeSource: "idle",
    status: "waiting",
    lastMessageAt: 0,
    lastError: "",
    isAuthorized: false,
    authorizedChannelId: "",
    authTimer: null,
    bootstrapTimer: null,
    transportListenerBound: false,
    authHandlerBound: false
  };
  let localSocket = null;
  let localRetryTimer = null;

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const diagRequestedMode = document.getElementById("diag-requested-mode");
  const diagActiveSource = document.getElementById("diag-active-source");
  const diagExpectedChannel = document.getElementById("diag-expected-channel");
  const diagAuthorizedChannel = document.getElementById("diag-authorized-channel");
  const diagLocalWs = document.getElementById("diag-local-ws");
  const diagLastUpdate = document.getElementById("diag-last-update");
  const controlTransportMode = document.getElementById("control-transport-mode");
  const controlChannelId = document.getElementById("control-channel-id");
  const controlLocalWs = document.getElementById("control-local-ws");
  const controlAuthTimeout = document.getElementById("control-auth-timeout");
  const controlStaleAfter = document.getElementById("control-stale-after");
  const applyRuntimeOverridesButton = document.getElementById("apply-runtime-overrides");
  const clearRuntimeOverridesButton = document.getElementById("clear-runtime-overrides");
  const transportStatus  = document.getElementById("transport-status");
  const bossSection      = document.getElementById("boss-section");
  const bossIdle         = document.getElementById("boss-idle");
  const bossNameEl       = document.getElementById("boss-name");
  const bossLoreEl       = document.getElementById("boss-lore");
  const bossHpBar        = document.getElementById("boss-hp-bar");
  const bossHpText       = document.getElementById("boss-hp-text");
  const bossThreshold    = document.getElementById("boss-threshold");
  const nextBossTimer    = document.getElementById("next-boss-timer");
  const nextBossFlavor   = document.getElementById("next-boss-flavor");
  const xpBoostActive    = document.getElementById("xp-boost-active");
  const xpBoostInactive  = document.getElementById("xp-boost-inactive");
  const xpBoostTimer     = document.getElementById("xp-boost-timer");
  const leaderboardList  = document.getElementById("leaderboard-list");
  const purchasesList    = document.getElementById("purchases-list");

  // ── Boss lore map ─────────────────────────────────────────────────────────────
  const BOSS_LORE = {
    goblin:    "A warlord astride a giant wolf. His horde fills the tavern with chaos.",
    troll:     "A dungeon construct of ancient stone. Slow, but each blow shakes the walls.",
    "lich":    "An ancient necromancer draped in shadow. Every wound steals your strength.",
    serpent:   "A leviathan from the deep. Its coils drag fighters beneath the waves.",
    bandit:    "A cunning rogue who fights dirty. Watch your coin purse.",
    dragon:    "An elder terror from the northern wastes. Fire and fury incarnate."
  };

  function getBossLore(key) {
    if (!key) return "";
    const lower = String(key).toLowerCase();
    for (const [k, v] of Object.entries(BOSS_LORE)) {
      if (lower.includes(k)) return v;
    }
    return "A fearsome creature emerges from the darkness.";
  }

  // ── Threshold flavor ─────────────────────────────────────────────────────────
  const THRESHOLD_FLAVOR = {
    0.75: "⚠ Entering a rage — press the attack!",
    0.5:  "☠ Bloodied and furious!",
    0.25: "💀 On the brink — one last push!"
  };

  // ── Render functions ─────────────────────────────────────────────────────────
  function renderBoss() {
    if (!state.boss) {
      bossSection.style.display = "none";
      bossIdle.style.display    = "";
      return;
    }

    bossSection.style.display = "";
    bossIdle.style.display    = "none";

    const { name, hp, maxHp, key } = state.boss;
    bossNameEl.textContent  = name || "Unknown Foe";
    bossLoreEl.textContent  = getBossLore(key || name);

    const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
    bossHpBar.style.width   = pct + "%";
    bossHpText.textContent  = hp + " / " + maxHp + " HP";

    bossHpBar.classList.remove("warning", "critical");
    if (pct <= 25) {
      bossHpBar.classList.add("critical");
    } else if (pct <= 50) {
      bossHpBar.classList.add("warning");
    }
  }

  function renderTimer() {
    if (state.boss) {
      bossThreshold.style.display = "none";
      return;
    }

    const now  = Date.now();
    const diff = Math.max(0, state.nextSpawnAt - now);

    if (state.nextSpawnAt <= 0 || diff <= 0) {
      nextBossTimer.textContent  = "--:--";
      nextBossFlavor.textContent = "The darkness stirs...";
      return;
    }

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    nextBossTimer.textContent = pad(mins) + ":" + pad(secs);

    if (diff <= 60000) {
      nextBossFlavor.textContent = "Something approaches...";
    } else if (diff <= 180000) {
      nextBossFlavor.textContent = "Roars echo in the distance.";
    } else {
      nextBossFlavor.textContent = "The tavern grows uneasy...";
    }
  }

  function renderXpBoost() {
    const now  = Date.now();
    const diff = Math.max(0, state.xpBoostEndsAt - now);

    if (diff <= 0) {
      xpBoostActive.style.display   = "none";
      xpBoostInactive.style.display = "";
      return;
    }

    xpBoostActive.style.display   = "flex";
    xpBoostInactive.style.display = "none";

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    xpBoostTimer.textContent = pad(mins) + ":" + pad(secs) + " remaining";
  }

  function renderLeaderboard() {
    if (!state.leaderboard.length) {
      leaderboardList.innerHTML = '<div class="leaderboard-empty">Waiting for guild members...</div>';
      return;
    }

    const rankClass = ["top1", "top2", "top3"];
    const rankSymbol = ["♛", "♜", "♝", "4.", "5."];

    leaderboardList.innerHTML = state.leaderboard.map((entry, i) => {
      const cls    = rankClass[i] || "";
      const symbol = rankSymbol[i] || (i + 1) + ".";
      const title  = entry.title ? `<span class="leaderboard-title">${escHtml(entry.title)}</span>` : "";
      return `<div class="leaderboard-row">
        <div class="leaderboard-rank ${cls}">${symbol}</div>
        <div class="leaderboard-name">${escHtml(entry.username)}${title}</div>
        <div class="leaderboard-gold">🪙 ${entry.gold}</div>
      </div>`;
    }).join("");
  }

  function renderPurchases() {
    if (!state.purchases.length) {
      purchasesList.innerHTML = '<div class="purchases-empty">No purchases yet this session.</div>';
      return;
    }

    purchasesList.innerHTML = state.purchases.map((p) => {
      const typeClass = "purchase-type-" + (p.itemType || "");
      return `<div class="purchase-item">
        <span class="purchase-who">${escHtml(p.who)}</span>
        <span class="purchase-what"> bought </span>
        <span class="${typeClass}">${escHtml(p.itemName)}</span>
      </div>`;
    }).join("");
  }

  function renderAll() {
    renderBoss();
    renderTimer();
    renderXpBoost();
    renderLeaderboard();
    renderPurchases();
    renderTransportStatus();
  }

  function hasTwitchBroadcastSupport() {
    return typeof window.Twitch !== "undefined" && window.Twitch.ext && typeof window.Twitch.ext.listen === "function";
  }

  function normalizeChannelId(value) {
    return String(value || "").trim();
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
    transportState.authTimer = setTimeout(function () {
      if (transportState.isAuthorized) {
        return;
      }

      setTransportState({
        activeSource: "twitch",
        status: "error",
        lastError: hasTwitchBroadcastSupport() ? "Auth timeout" : "No context"
      });
    }, authTimeoutMs);
  }

  function validateAuthorizedChannel(channelId) {
    if (!expectedChannelId || !channelId) {
      return true;
    }

    return expectedChannelId === channelId;
  }

  function handleTwitchAuthorized(auth) {
    const channelId = normalizeChannelId(auth && auth.channelId);
    clearTransportTimer("authTimer");

    if (!validateAuthorizedChannel(channelId)) {
      setTransportState({
        isAuthorized: false,
        authorizedChannelId: channelId,
        activeSource: "twitch",
        status: "error",
        lastError: "Channel mismatch"
      });
      return;
    }

    setTransportState({
      isAuthorized: true,
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
      window.Twitch.ext.listen("broadcast", function (_target, _contentType, message) {
        noteTransportActivity("twitch");
        handlePayload(message);
      });
      transportState.transportListenerBound = true;
    }

    if (!transportState.authHandlerBound && typeof window.Twitch.ext.onAuthorized === "function") {
      window.Twitch.ext.onAuthorized(function (auth) {
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
      connectLocalRelay();
      return;
    }

    if (bindTwitchTransport()) {
      return;
    }

    var giveUpAfterMs = transportState.requestedMode === "twitch" ? authTimeoutMs : 1500;
    var startedAt = Date.now();
    setTransportState({ activeSource: "twitch", status: "waiting", lastError: "Loading" });

    function pollForTwitch() {
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

        connectLocalRelay();
        return;
      }

      transportState.bootstrapTimer = setTimeout(pollForTwitch, 250);
    }

    transportState.bootstrapTimer = setTimeout(pollForTwitch, 250);
  }

  function setTransportState(nextState) {
    Object.assign(transportState, nextState || {});
    renderTransportStatus();
  }

  function noteTransportActivity(source) {
    setTransportState({
      activeSource: source,
      status: "live",
      lastMessageAt: Date.now(),
      lastError: ""
    });
  }

  function renderTransportStatus() {
    if (!transportStatus) return;

    let status = transportState.status;
    if (transportState.lastMessageAt && Date.now() - transportState.lastMessageAt > staleAfterMs && status !== "error") {
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
    } else if (transportState.isAuthorized && transportState.activeSource === "idle") {
      detail = "Authorized";
    }

    transportStatus.className = "transport-status transport-status-" + status;
    transportStatus.textContent = sourceLabel + " " + detail;

    if (diagRequestedMode) {
      diagRequestedMode.textContent = transportState.requestedMode;
    }
    if (diagActiveSource) {
      diagActiveSource.textContent = transportState.activeSource;
    }
    if (diagExpectedChannel) {
      diagExpectedChannel.textContent = expectedChannelId || "—";
    }
    if (diagAuthorizedChannel) {
      diagAuthorizedChannel.textContent = transportState.authorizedChannelId || "—";
    }
    if (diagLocalWs) {
      diagLocalWs.textContent = localWsUrl;
    }
    if (diagLastUpdate) {
      if (!transportState.lastMessageAt) {
        diagLastUpdate.textContent = "never";
      } else {
        const sec = Math.max(0, Math.floor((Date.now() - transportState.lastMessageAt) / 1000));
        diagLastUpdate.textContent = sec + "s ago";
      }
    }
  }

  function populateControlValues() {
    if (controlTransportMode) controlTransportMode.value = transportState.requestedMode;
    if (controlChannelId) controlChannelId.value = expectedChannelId;
    if (controlLocalWs) controlLocalWs.value = localWsUrl;
    if (controlAuthTimeout) controlAuthTimeout.value = String(authTimeoutMs);
    if (controlStaleAfter) controlStaleAfter.value = String(staleAfterMs);
  }

  function readControlValues() {
    return {
      transportMode: String(controlTransportMode && controlTransportMode.value || "auto").trim().toLowerCase(),
      expectedChannelId: String(controlChannelId && controlChannelId.value || "").trim(),
      localWsUrl: String(controlLocalWs && controlLocalWs.value || "ws://127.0.0.1:8787").trim(),
      authTimeoutMs: Math.max(2000, Number(controlAuthTimeout && controlAuthTimeout.value || 12000)),
      staleAfterMs: Math.max(5000, Number(controlStaleAfter && controlStaleAfter.value || 45000))
    };
  }

  function bindAdminControls() {
    populateControlValues();

    if (applyRuntimeOverridesButton) {
      applyRuntimeOverridesButton.addEventListener("click", function () {
        saveRuntimeOverrides(readControlValues());
        window.location.reload();
      });
    }

    if (clearRuntimeOverridesButton) {
      clearRuntimeOverridesButton.addEventListener("click", function () {
        clearRuntimeOverrides();
        window.location.reload();
      });
    }
  }

  // ── Message handler ───────────────────────────────────────────────────────────
  function handlePayload(payload) {
    try {
      const msg = typeof payload === "string" ? JSON.parse(payload) : payload;
      if (!msg || !msg.type) return;

      switch (msg.type) {

        case "boss_spawn":
          state.boss = {
            key:    msg.boss && msg.boss.key,
            name:   msg.boss && msg.boss.name,
            hp:     msg.boss && msg.boss.hp,
            maxHp:  msg.boss && msg.boss.maxHp
          };
          state.nextSpawnAt = 0;
          bossThreshold.style.display = "none";
          break;

        case "boss_damage":
          if (state.boss) {
            state.boss.hp     = msg.hp;
            state.boss.maxHp  = msg.maxHp;
            state.boss.name   = msg.bossName || state.boss.name;
          }
          break;

        case "boss_threshold":
          if (state.boss) {
            const flavor = THRESHOLD_FLAVOR[msg.threshold] || "⚔ The boss rages!";
            bossThreshold.textContent   = flavor;
            bossThreshold.style.display = "";
            setTimeout(() => {
              bossThreshold.style.display = "none";
            }, 8000);
          }
          break;

        case "boss_defeat":
        case "boss_retreat":
          state.boss = null;
          bossThreshold.style.display = "none";
          break;

        case "boss_timer":
          state.nextSpawnAt = Number(msg.nextSpawnAt || 0);
          break;

        case "shop_xpboost":
          state.xpBoostEndsAt = Number(msg.endsAt || (Date.now() + 10 * 60 * 1000));
          break;

        case "shop_purchase":
          if (msg.by && msg.itemName) {
            state.purchases.unshift({
              who:      msg.by,
              itemName: msg.itemName,
              itemType: msg.itemType || "",
              at:       Date.now()
            });
            if (state.purchases.length > 5) {
              state.purchases.length = 5;
            }
          }
          break;

        case "shop_state":
          if (Array.isArray(msg.leaderboard)) {
            state.leaderboard = msg.leaderboard.slice(0, 5).map((e) => ({
              username: String(e.username || ""),
              gold:     Number(e.gold || 0),
              title:    String(e.title || "")
            }));
          }
          if (typeof msg.xpBoostEndsAt === "number") {
            state.xpBoostEndsAt = msg.xpBoostEndsAt;
          }
          if (Array.isArray(msg.purchases)) {
            state.purchases = msg.purchases.slice(0, 5).map((entry) => ({
              who: String(entry.who || ""),
              itemName: String(entry.itemName || ""),
              itemType: String(entry.itemType || ""),
              at: Number(entry.at || 0)
            }));
          }
          if (typeof msg.nextSpawnAt === "number") {
            state.nextSpawnAt = Number(msg.nextSpawnAt || 0);
          }
          if (msg.boss) {
            state.boss = {
              key: msg.boss.key,
              name: msg.boss.name,
              hp: Number(msg.boss.hp || 0),
              maxHp: Number(msg.boss.maxHp || 0)
            };
          } else {
            state.boss = null;
          }
          break;
      }

      renderAll();
    } catch (e) {
      // Silently ignore malformed payloads.
    }
  }

  function connectLocalRelay() {
    if (transportState.requestedMode === "twitch") {
      return;
    }

    if (localSocket && (localSocket.readyState === WebSocket.OPEN || localSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      localSocket = new WebSocket(localWsUrl);
    } catch (_error) {
      setTransportState({ activeSource: "local", status: "error", lastError: "Reconnect" });
      scheduleLocalReconnect();
      return;
    }

    localSocket.onopen = function () {
      setTransportState({ activeSource: "local", status: "waiting", lastError: "" });
    };

    localSocket.onmessage = function (event) {
      noteTransportActivity("local");
      handlePayload(event.data);
    };

    localSocket.onclose = function () {
      setTransportState({ activeSource: "local", status: "stale", lastError: "Disconnected" });
      scheduleLocalReconnect();
    };

    localSocket.onerror = function () {
      setTransportState({ activeSource: "local", status: "error", lastError: "Reconnect" });
      scheduleLocalReconnect();
    };
  }

  function scheduleLocalReconnect() {
    if (transportState.requestedMode === "twitch") {
      return;
    }

    if (localRetryTimer) {
      return;
    }

    localRetryTimer = setTimeout(function () {
      localRetryTimer = null;
      connectLocalRelay();
    }, 2500);
  }

  // ── Twitch Extension PubSub listener ─────────────────────────────────────────
  beginTransportBootstrap();

  // ── Render loop (updates timers every second) ─────────────────────────────────
  setInterval(function () {
    renderTimer();
    renderXpBoost();
    renderTransportStatus();
  }, 1000);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Initial render with empty state.
  bindAdminControls();
  renderAll();
})();
