(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────────────────────────
  const state = {
    boss: null,          // { name, hp, maxHp } or null
    nextSpawnAt: 0,      // epoch ms
    xpBoostEndsAt: 0,   // epoch ms
    leaderboard: [],     // [{ username, gold, title }]
    purchases: []        // last 5 purchases [{ who, itemName, itemType, at }]
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────────
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
          if (state.boss && msg.boss) {
            state.boss.hp    = msg.boss.hp;
            state.boss.maxHp = msg.boss.maxHp;
          }
          break;
      }

      renderAll();
    } catch (e) {
      // Silently ignore malformed payloads.
    }
  }

  // ── Twitch Extension PubSub listener ─────────────────────────────────────────
  if (typeof window.Twitch !== "undefined" && window.Twitch.ext) {
    window.Twitch.ext.listen("broadcast", function (_target, _contentType, message) {
      handlePayload(message);
    });
  } else {
    // Fallback for local file testing: connect to the local WS relay.
    try {
      const ws = new WebSocket("ws://127.0.0.1:8787");
      ws.onmessage = function (event) {
        handlePayload(event.data);
      };
    } catch (e) {
      // Local WS not available — running in extension context where Twitch.ext loads async.
      document.addEventListener("DOMContentLoaded", function () {
        if (typeof window.Twitch !== "undefined" && window.Twitch.ext) {
          window.Twitch.ext.listen("broadcast", function (_target, _contentType, message) {
            handlePayload(message);
          });
        }
      });
    }
  }

  // ── Render loop (updates timers every second) ─────────────────────────────────
  setInterval(function () {
    renderTimer();
    renderXpBoost();
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
  renderAll();
})();
