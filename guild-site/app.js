const playerForm = document.getElementById("player-form");
const playerInput = document.getElementById("player-input");
const readOnlyBadge = document.getElementById("read-only-badge");
const onboardingBadge = document.getElementById("onboarding-badge");
const entryUrl = document.getElementById("entry-url");
const heroNote = document.getElementById("hero-note");
const creationRules = document.getElementById("creation-rules");
const creationStatus = document.getElementById("creation-status");
const creationCopy = document.getElementById("creation-copy");
const selectedClassName = document.getElementById("selected-class-name");
const classOptions = document.getElementById("creation-class-options");
const statAllocator = document.getElementById("creation-stat-allocator");
const pointsRemaining = document.getElementById("points-remaining");
const creationSummary = document.getElementById("creation-summary");
const createCharacterButton = document.getElementById("create-character-button");
const creationFeedback = document.getElementById("creation-feedback");
const profileName = document.getElementById("profile-name");
const goldValue = document.getElementById("gold-value");
const levelValue = document.getElementById("level-value");
const xpValue = document.getElementById("xp-value");
const damageValue = document.getElementById("damage-value");
const profileStrip = document.getElementById("profile-strip");
const bossBanner = document.getElementById("boss-banner");
const statsList = document.getElementById("stats-list");
const statReferenceList = document.getElementById("stat-reference-list");
const classSlots = document.getElementById("class-slots");
const classReferenceList = document.getElementById("class-reference-list");
const inventoryList = document.getElementById("inventory-list");
const equipmentSlots = document.getElementById("equipment-slots");
const equipmentScaffoldNote = document.getElementById("equipment-scaffold-note");
const shopNote = document.getElementById("shop-note");
const shopColumns = document.getElementById("shop-columns");
const helpList = document.getElementById("help-list");
const commandList = document.getElementById("command-list");
const leaderboardList = document.getElementById("leaderboard-list");

const state = {
  player: "",
  authToken: "",
  extensionToken: "",
  authMode: "readonly",
  channelContext: { id: "", slug: "", source: "standalone" },
  requestHeaders: {},
  sessionReady: false,
  loadingDashboard: false,
  dashboard: null,
  selectedClassKey: "",
  creationStats: {},
  creationPending: false,
  actionPending: false,
  realtimeStream: null,
  realtimeReconnectTimer: null,
  pollingTimer: null,
  pendingRefreshTimer: null,
  actionFeedback: {
    shop: "",
    equipment: ""
  }
};

function getApiBaseUrl() {
  return String(window.GUILD_HALL_CONFIG?.apiBaseUrl || "").trim().replace(/\/+$/, "");
}

function buildApiUrl(path) {
  const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${String(path || "")}`;
  const apiBaseUrl = getApiBaseUrl();
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

function isProfileLocked() {
  return Boolean(state.dashboard?.onboarding?.required || state.dashboard?.runtime?.profileAccessLocked);
}

function canEditActiveProfile() {
  return Boolean(state.dashboard?.runtime?.canEdit);
}

function getPlayerFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("player") || "").trim().toLowerCase();
}

function getAuthTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("auth") || "").trim();
}

function getRuntimeConfig() {
  const runtime = window.GUILD_HALL_CONFIG?.runtime || {};
  return {
    mode: String(runtime.mode || "auto").trim().toLowerCase(),
    authTimeoutMs: Math.max(1000, Number(runtime.authTimeoutMs) || 4000),
    standaloneApiKey: String(runtime.standaloneApiKey || "").trim(),
    standalonePlayer: String(runtime.standalonePlayer || "").trim().toLowerCase(),
    standaloneChannelId: String(runtime.standaloneChannelId || "").trim(),
    standaloneChannelSlug: String(runtime.standaloneChannelSlug || "").trim().toLowerCase()
  };
}

function hasTwitchExtensionRuntime() {
  return Boolean(window.Twitch && window.Twitch.ext && typeof window.Twitch.ext.onAuthorized === "function");
}

function waitForTwitchAuthorization(timeoutMs) {
  if (!hasTwitchExtensionRuntime()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    window.Twitch.ext.onAuthorized((auth) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(auth || null);
    });
  });
}

function buildRequestHeaders() {
  const headers = {};
  if (state.extensionToken) {
    headers.Authorization = `Bearer ${state.extensionToken}`;
  }

  const runtime = getRuntimeConfig();
  if (!state.extensionToken && runtime.standaloneApiKey) {
    headers["X-Guild-Hall-Key"] = runtime.standaloneApiKey;
  }

  if (state.channelContext?.slug) {
    headers["X-Guild-Channel-Slug"] = state.channelContext.slug;
  }

  if (state.player) {
    headers["X-Guild-Player"] = state.player;
  }

  return headers;
}

function stopRealtimeSync() {
  if (state.pendingRefreshTimer) {
    clearTimeout(state.pendingRefreshTimer);
    state.pendingRefreshTimer = null;
  }

  if (state.realtimeReconnectTimer) {
    clearTimeout(state.realtimeReconnectTimer);
    state.realtimeReconnectTimer = null;
  }

  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }

  if (state.realtimeStream) {
    state.realtimeStream.close();
    state.realtimeStream = null;
  }
}

function scheduleDashboardRefresh(reason = "sync") {
  if (state.pendingRefreshTimer) {
    clearTimeout(state.pendingRefreshTimer);
  }

  state.pendingRefreshTimer = setTimeout(() => {
    state.pendingRefreshTimer = null;
    if (state.loadingDashboard || state.actionPending || state.creationPending) {
      return;
    }

    loadDashboard(state.player).catch(() => {});
  }, reason === "poll" ? 0 : 350);
}

function connectRealtimeSync() {
  stopRealtimeSync();

  const eventsUrl = buildApiUrl("/api/overlay/events");
  try {
    state.realtimeStream = new EventSource(eventsUrl);
  } catch (_error) {
    state.realtimeStream = null;
  }

  if (state.realtimeStream) {
    state.realtimeStream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const type = String(payload?.type || "");
        if (["shop", "shop_purchase", "shop_state", "boss_update", "state_sync"].includes(type)) {
          scheduleDashboardRefresh("sse");
        }
      } catch (_error) {
        // Ignore malformed SSE payloads.
      }
    };

    state.realtimeStream.onerror = () => {
      if (state.realtimeStream) {
        state.realtimeStream.close();
      }
      state.realtimeStream = null;
      if (!state.realtimeReconnectTimer) {
        state.realtimeReconnectTimer = setTimeout(() => {
          state.realtimeReconnectTimer = null;
          connectRealtimeSync();
        }, 2500);
      }
    };
  }

  state.pollingTimer = setInterval(() => {
    scheduleDashboardRefresh("poll");
  }, 20000);
}

async function initializeRuntimeSession(playerHint = "") {
  const runtime = getRuntimeConfig();
  const requestedMode = runtime.mode;
  const allowTwitch = requestedMode !== "standalone";
  const auth = allowTwitch ? await waitForTwitchAuthorization(runtime.authTimeoutMs) : null;

  state.extensionToken = String(auth?.token || "").trim();
  state.channelContext = {
    id: String(auth?.channelId || runtime.standaloneChannelId || "").trim(),
    slug: String(runtime.standaloneChannelSlug || "").trim().toLowerCase(),
    source: state.extensionToken ? "twitch" : "standalone"
  };

  const requestedPlayer = String(playerHint || state.player || runtime.standalonePlayer || getPlayerFromQuery() || "").trim().toLowerCase();
  const params = new URLSearchParams();
  if (requestedPlayer) {
    params.set("player", requestedPlayer);
  }
  if (state.channelContext.slug) {
    params.set("channelSlug", state.channelContext.slug);
  }

  const sessionResponse = await fetch(buildApiUrl(`/api/guild/session?${params.toString()}`), {
    method: "GET",
    cache: "no-store",
    headers: buildRequestHeaders()
  });

  if (!sessionResponse.ok) {
    throw new Error(`Session init failed: ${sessionResponse.status}`);
  }

  const sessionPayload = await sessionResponse.json();
  const session = sessionPayload?.session || {};
  state.player = String(session.player || requestedPlayer || "").trim().toLowerCase();
  state.authToken = state.authToken || getAuthTokenFromQuery();
  state.authMode = String(session.authMode || (state.extensionToken ? "twitch-extension" : "readonly"));
  state.channelContext = session.channel || state.channelContext;
  state.sessionReady = true;
  state.requestHeaders = buildRequestHeaders();
}

async function ensureRuntimeSession(playerHint = "") {
  if (state.sessionReady) {
    if (playerHint && playerHint !== state.player) {
      state.player = playerHint;
      state.requestHeaders = buildRequestHeaders();
    }
    return;
  }

  await initializeRuntimeSession(playerHint);
  connectRealtimeSync();
}

function setPlayerInQuery(player) {
  const params = new URLSearchParams(window.location.search);
  if (player) {
    params.set("player", player);
  } else {
    params.delete("player");
  }

  const nextQuery = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
}

function getCreationRules() {
  return state.dashboard?.onboarding?.rules || {
    statOrder: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
    baseStat: 8,
    minimumStat: 8,
    maximumStartingStat: 15,
    assignablePoints: 12
  };
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatKey(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatBonuses(bonuses) {
  const entries = Object.entries(bonuses || {}).filter(([, value]) => Number(value || 0) !== 0);
  if (!entries.length) {
    return "No bonus";
  }

  return entries.map(([key, value]) => {
    if (String(key).toLowerCase().includes("chance") || String(key).toLowerCase().includes("multiplier") || String(key).toLowerCase().includes("discount")) {
      return `${formatKey(key)}: ${formatPercent(value)}`;
    }
    return `${formatKey(key)}: +${value}`;
  }).join(" • ");
}

function setSectionFeedback(section, message, isError = false) {
  state.actionFeedback[section] = {
    message,
    isError
  };
}

function getSectionFeedback(section, fallback) {
  const entry = state.actionFeedback[section];
  return entry?.message || fallback;
}

function getSectionFeedbackIsError(section) {
  return Boolean(state.actionFeedback[section]?.isError);
}

function buildLockedCard(title, body) {
  return `<article class="reference-card locked-card"><strong>${title}</strong><div class="muted">${body}</div></article>`;
}

function getSelectedClassDefinition() {
  const options = state.dashboard?.onboarding?.starterClasses || [];
  return options.find((entry) => entry.key === state.selectedClassKey) || null;
}

function getCreationPointsSpent() {
  const rules = getCreationRules();
  return rules.statOrder.reduce((total, statKey) => total + Math.max(0, Number(state.creationStats[statKey] || rules.baseStat) - rules.baseStat), 0);
}

function getCreationPointsRemaining() {
  const rules = getCreationRules();
  return rules.assignablePoints - getCreationPointsSpent();
}

function creationStatsAreValid() {
  const rules = getCreationRules();
  const remaining = getCreationPointsRemaining();
  if (remaining < 0) {
    return false;
  }

  return rules.statOrder.every((statKey) => {
    const statValue = Number(state.creationStats[statKey] || rules.baseStat);
    return statValue >= rules.minimumStat && statValue <= rules.maximumStartingStat;
  });
}

function resetCreationState() {
  const rules = getCreationRules();
  state.creationStats = {};
  for (const statKey of rules.statOrder) {
    state.creationStats[statKey] = rules.baseStat;
  }

  const defaultClass = state.dashboard?.onboarding?.starterClasses?.[0]?.key || "";
  state.selectedClassKey = defaultClass;
}

function renderCreationRules() {
  const rules = getCreationRules();
  creationRules.innerHTML = [
    `<span class="chip">Base ${rules.baseStat}</span>`,
    `<span class="chip">Pool ${rules.assignablePoints}</span>`,
    `<span class="chip">Floor ${rules.minimumStat}</span>`,
    `<span class="chip">Cap ${rules.maximumStartingStat}</span>`
  ].join("");
}

function renderClassOptions() {
  classOptions.innerHTML = "";
  const classes = state.dashboard?.onboarding?.starterClasses || [];
  const selected = getSelectedClassDefinition();

  classes.forEach((classDefinition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `class-option${classDefinition.key === state.selectedClassKey ? " active" : ""}`;
    button.innerHTML = `
      <strong>${classDefinition.name}</strong>
      <span>${classDefinition.role}</span>
      <span>${classDefinition.passiveLabel || classDefinition.coreStat}</span>
      <p>${classDefinition.passiveText || classDefinition.fantasy || ""}</p>
    `;
    button.addEventListener("click", () => {
      state.selectedClassKey = classDefinition.key;
      renderCreationPanel();
    });
    classOptions.appendChild(button);
  });

  selectedClassName.textContent = selected ? `${selected.name} • ${selected.role}` : "No class selected";
}

function renderStatAllocator() {
  const rules = getCreationRules();
  statAllocator.innerHTML = "";
  pointsRemaining.textContent = `${getCreationPointsRemaining()} points remaining`;

  const statReference = new Map((state.dashboard?.help?.stats || []).map((entry) => [entry.key, entry]));

  rules.statOrder.forEach((statKey) => {
    const value = Number(state.creationStats[statKey] || rules.baseStat);
    const canDecrease = value > rules.minimumStat;
    const canIncrease = value < rules.maximumStartingStat && getCreationPointsRemaining() > 0;
    const statInfo = statReference.get(statKey);

    const row = document.createElement("div");
    row.className = "allocator-row";
    row.innerHTML = `
      <div>
        <strong>${formatKey(statKey)}</strong>
        <div class="muted">${statInfo?.meaning || ""}</div>
      </div>
      <div class="allocator-controls">
        <button type="button" class="stepper" data-stat="${statKey}" data-direction="down" ${canDecrease ? "" : "disabled"}>-</button>
        <strong class="stat-value">${value}</strong>
        <button type="button" class="stepper" data-stat="${statKey}" data-direction="up" ${canIncrease ? "" : "disabled"}>+</button>
      </div>
    `;
    statAllocator.appendChild(row);
  });

  Array.from(statAllocator.getElementsByTagName("button")).forEach((button) => {
    button.addEventListener("click", () => {
      const statKey = button.getAttribute("data-stat");
      const direction = button.getAttribute("data-direction");
      adjustCreationStat(statKey, direction === "up" ? 1 : -1);
    });
  });
}

function renderCreationSummary() {
  const selected = getSelectedClassDefinition();
  const rules = getCreationRules();
  const remaining = getCreationPointsRemaining();
  const profileComplete = Boolean(state.dashboard?.profile?.characterProfileComplete);

  creationSummary.innerHTML = `
    <article class="summary-card">
      <span class="slot-label">Class</span>
      <strong>${selected ? selected.name : "Choose a class"}</strong>
      <div class="muted">${selected?.combatImpactNow || selected?.passiveText || "No class selected yet."}</div>
    </article>
    <article class="summary-card">
      <span class="slot-label">Point Budget</span>
      <strong>${remaining} remaining</strong>
      <div class="muted">${rules.assignablePoints} total points above the base stat line.</div>
    </article>
    <article class="summary-card">
      <span class="slot-label">Status</span>
      <strong>${profileComplete ? "Completed" : "Ready to finalize"}</strong>
      <div class="muted">Creation is validated on the relay before the profile is written.</div>
    </article>
  `;

  createCharacterButton.disabled = !canEditActiveProfile() || profileComplete || !state.selectedClassKey || !creationStatsAreValid() || state.creationPending;
}

function renderCreationPanel() {
  const onboardingRequired = Boolean(state.dashboard?.onboarding?.required);
  const profileComplete = Boolean(state.dashboard?.profile?.characterProfileComplete);
  const currentProfile = state.dashboard?.profile;
  const canEdit = canEditActiveProfile();

  creationStatus.textContent = !canEdit ? "Read Only" : onboardingRequired ? "Onboarding Required" : profileComplete ? "Character Locked In" : "Ready";
  creationCopy.textContent = !canEdit
    ? "Viewing another player's Guild Hall profile in read-only mode. Only the owner link can finalize or edit this character."
    : onboardingRequired
    ? "This viewer does not have a completed adventurer profile yet. Choose a class and assign opening stats to begin."
    : "Character creation is complete. The controls remain visible so you can review the original starting rules for new viewers.";
  onboardingBadge.textContent = !canEdit ? "READ ONLY" : onboardingRequired ? "FIRST TIME" : "PROFILE READY";
  heroNote.textContent = !canEdit
    ? `Viewing ${currentProfile?.displayName || currentProfile?.username || "Traveler"} in read-only mode. Use your own !shop link to edit your profile.`
    : onboardingRequired
    ? "Finish onboarding here before relying on the full stat-and-class identity in chat systems."
    : `Viewing ${currentProfile?.displayName || currentProfile?.username || "Traveler"}. Shop and equipment interactions remain chat-driven in this pass.`;

  renderCreationRules();
  renderClassOptions();
  renderStatAllocator();
  renderCreationSummary();

  creationFeedback.textContent = !canEdit
    ? "Only the signed owner link can create or edit this profile."
    : onboardingRequired
    ? "Finalize character to persist this viewer's starting class and opening stats."
    : "This character is already initialized. Load another viewer to create a new one.";
  creationFeedback.className = `feedback-box${!canEdit ? "" : onboardingRequired ? "" : " success"}`;
}

function renderBoss(boss) {
  if (!boss?.active) {
    bossBanner.textContent = "No active boss. The guild hall is quiet for now.";
    return;
  }

  bossBanner.textContent = `${boss.name} is active with ${boss.hp}/${boss.maxHp} HP.`;
}

function renderProfile(profile) {
  const displayName = profile?.displayName || profile?.username || "Traveler";
  profileName.textContent = displayName;
  goldValue.textContent = String(profile?.currency?.gold || 0);
  levelValue.textContent = String(profile?.progression?.level || 1);
  xpValue.textContent = String(profile?.progression?.totalXp || 0);
  damageValue.textContent = String(profile?.combat?.totalDamage || 0);

  const badges = [
    `Primary ${formatKey(profile?.classData?.activeClassPrimary || profile?.classData?.activeClass || "peasant")}`,
    profile?.classData?.activeClassSecondary ? `Secondary ${formatKey(profile.classData.activeClassSecondary)}` : "No secondary class",
    profile?.titleData?.activeTitle ? `Title ${profile.titleData.activeTitle}` : "No active title",
    profile?.characterProfileComplete ? "Character initialized" : "Needs onboarding"
  ];
  profileStrip.innerHTML = badges.map((entry) => `<span class="chip">${entry}</span>`).join("");

  if (isProfileLocked()) {
    profileStrip.innerHTML += `<span class="chip">Complete character creation to unlock the full Guild Hall</span>`;
    bossBanner.textContent = "Character creation is required before normal profile systems unlock.";
  }
}

function renderStats(profile, help) {
  statsList.innerHTML = "";
  statReferenceList.innerHTML = "";

  if (isProfileLocked()) {
    statsList.innerHTML = buildLockedCard("Stats Locked", "Assign your starting points and finalize your character to unlock the adventurer sheet.");
    statReferenceList.innerHTML = buildLockedCard("What Stats Do", "See the Help section for each stat's purpose while you finish onboarding.");
    return;
  }

  const stats = profile?.stats || {};
  (help?.stats || []).forEach((entry) => {
    const statCard = document.createElement("article");
    statCard.className = "stat-card";
    statCard.innerHTML = `
      <div class="stat-card-top">
        <span class="slot-label">${entry.label}</span>
        <strong>${stats[entry.key] || 0}</strong>
      </div>
      <div class="muted">${entry.meaning}</div>
    `;
    statsList.appendChild(statCard);

    const referenceCard = document.createElement("article");
    referenceCard.className = "reference-card";
    referenceCard.innerHTML = `
      <strong>${entry.label}</strong>
      <div class="muted">${(entry.affectsNow || []).join(" • ") || "No immediate hooks listed."}</div>
    `;
    statReferenceList.appendChild(referenceCard);
  });
}

function renderClasses(profile) {
  classSlots.innerHTML = "";
  classReferenceList.innerHTML = "";

  if (isProfileLocked()) {
    classSlots.innerHTML = buildLockedCard("Class Locked", "Choose one starting class in Character Creation to unlock your live class sheet.");
    classReferenceList.innerHTML = buildLockedCard("Starter Classes", "Warrior, Rogue, Mage, Cleric, and Ranger are available during onboarding.");
    return;
  }

  const primary = profile?.classData?.activeClassPrimary || profile?.classData?.activeClass || "peasant";
  const secondary = profile?.classData?.activeClassSecondary || "";
  [["Primary", primary], ["Secondary", secondary || "None"]].forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.innerHTML = `<span class="slot-label">${label} Class</span><strong>${formatKey(value)}</strong>`;
    classSlots.appendChild(card);
  });

  const activeKeys = new Set([primary, secondary].filter(Boolean));
  (state.dashboard?.help?.classes || []).forEach((entry) => {
    const card = document.createElement("article");
    card.className = `reference-card${activeKeys.has(entry.key) ? " active" : ""}`;
    card.innerHTML = `
      <strong>${entry.name}</strong>
      <div class="muted">${entry.role} • ${entry.coreStat}</div>
      <div class="muted">${entry.passiveText || entry.fantasy || ""}</div>
    `;
    classReferenceList.appendChild(card);
  });
}

function renderInventory(profile) {
  inventoryList.innerHTML = "";

  if (isProfileLocked()) {
    inventoryList.innerHTML = buildLockedCard("Inventory Locked", "Finalize character creation to receive your starter loadout and unlock inventory management.");
    return;
  }

  const items = Array.isArray(profile?.inventory) ? profile.inventory : [];

  if (!items.length) {
    inventoryList.innerHTML = "<article class='inventory-card'><strong>No owned items</strong><div class='inventory-meta'>Buy gear in chat for now, then refresh this page.</div></article>";
    return;
  }

  items.forEach((item) => {
    const equipped = profile?.equipment?.[item.category] === item.itemId ? "Equipped" : "Stored";
    const card = document.createElement("article");
    card.className = "inventory-card";
    card.innerHTML = `
      <strong>${item.name}</strong>
      <div class="inventory-meta">${formatKey(item.category)} • ${formatKey(item.rarity)} • ${equipped}</div>
      <div class="muted">${item.passiveText || formatBonuses(item.statBonuses)}</div>
    `;

    if (item.equipable && equipped !== "Equipped") {
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-button";
      button.textContent = "Equip";
      button.disabled = state.actionPending || !canEditActiveProfile();
      button.addEventListener("click", () => {
        submitGuildAction("/api/guild/equipment/equip", { itemKey: item.itemId }, "equipment");
      });
      actionRow.appendChild(button);
      card.appendChild(actionRow);
    }

    inventoryList.appendChild(card);
  });
}

function renderEquipment(profile) {
  equipmentSlots.innerHTML = "";
  if (isProfileLocked()) {
    equipmentSlots.innerHTML = buildLockedCard("Equipment Locked", "Starter gear is assigned when you finalize your character. Equipment management unlocks after onboarding.");
    equipmentScaffoldNote.textContent = "Finish character creation first.";
    equipmentScaffoldNote.className = "panel-note";
    return;
  }

  const equipmentItems = profile?.equipmentItems || {};
  Object.entries(profile?.equipment || { weapon: "", armor: "", accessory: "" }).forEach(([slot, itemId]) => {
    const equippedItem = equipmentItems?.[slot] || null;
    const card = document.createElement("article");
    card.className = "slot-card";
    card.innerHTML = `<span class="slot-label">${formatKey(slot)}</span><strong>${equippedItem?.name || (itemId ? formatKey(itemId) : "Empty")}</strong>`;

    if (itemId) {
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-button ghost";
      button.textContent = "Unequip";
      button.disabled = state.actionPending || !canEditActiveProfile();
      button.addEventListener("click", () => {
        submitGuildAction("/api/guild/equipment/unequip", { slot }, "equipment");
      });
      actionRow.appendChild(button);
      card.appendChild(actionRow);
    }

    equipmentSlots.appendChild(card);
  });
  equipmentScaffoldNote.textContent = getSectionFeedback("equipment", "Equip and unequip actions now write directly to the persistent player profile. Chat commands still work against the same equipment slots.");
  equipmentScaffoldNote.className = `panel-note${getSectionFeedbackIsError("equipment") ? " error-text" : ""}`;
}

function renderShop(shop) {
  shopColumns.innerHTML = "";
  if (isProfileLocked()) {
    shopColumns.innerHTML = buildLockedCard("Shop Locked", "The Guild Hall shop unlocks after character creation so pricing, class bonuses, and starter inventory all start from a valid profile.");
    shopNote.textContent = "Browse help and finish onboarding first. Shop actions unlock immediately after finalizing your character.";
    shopNote.className = "panel-note";
    return;
  }

  const groups = [
    ["Starting Classes", shop?.permanentUnlocks?.classes || []],
    ["Titles", shop?.permanentUnlocks?.titles || []],
    ["Legacy Weapons", shop?.permanentUnlocks?.weapons || []],
    ["Weapons", shop?.gear?.weapons || []],
    ["Armor", shop?.gear?.armor || []],
    ["Accessories", shop?.gear?.accessories || []],
    ["XP Boosts", shop?.temporarySessionBoosts?.xpBoosts || []],
    ["Summons", shop?.consumables?.summons || []],
    ["Effects", shop?.consumables?.effects || []],
    ["Sounds", shop?.consumables?.sounds || []]
  ];

  groups.forEach(([label, items]) => {
    const card = document.createElement("section");
    card.className = "shop-card";
    const itemsContainer = document.createElement("div");
    itemsContainer.className = "shop-items";

    items.slice(0, 10).forEach((item) => {
      const article = document.createElement("article");
      article.className = "shop-item";

      const actionLabel = item.actionState === "active"
        ? "Active"
        : item.actionState === "equipped"
          ? "Equipped"
          : item.actionState === "owned"
            ? "Owned"
            : `Buy ${item.finalCost || item.cost}g`;

      article.innerHTML = `
        <div class="shop-item-head">
          <strong>${item.name}</strong>
          <span>${item.finalCost || item.cost}g</span>
        </div>
        <div class="shop-meta">${formatKey(item.itemType)} • ${formatKey(item.category)}</div>
        <div class="muted">${item.passiveText || item.description || formatBonuses(item.statBonuses)}</div>
        <div class="shop-scaffold">${item.actionState === "buy" ? "Live purchase" : actionLabel}</div>
      `;

      const actionRow = document.createElement("div");
      actionRow.className = "action-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-button";
      button.textContent = actionLabel;
      button.disabled = state.actionPending || !canEditActiveProfile() || item.actionState !== "buy" || item.canAfford === false;
      button.addEventListener("click", () => {
        submitGuildAction("/api/guild/shop/buy", { itemKey: item.key || item.id }, "shop");
      });
      actionRow.appendChild(button);
      article.appendChild(actionRow);

      itemsContainer.appendChild(article);
    });

    if (!itemsContainer.childElementCount) {
      itemsContainer.innerHTML = "<div class='muted'>No items yet.</div>";
    }

    const title = document.createElement("h3");
    title.textContent = label;
    card.appendChild(title);
    card.appendChild(itemsContainer);
    shopColumns.appendChild(card);
  });

  shopNote.textContent = canEditActiveProfile()
    ? getSectionFeedback("shop", "Site purchases now use the same gold, unlock, inventory, and boss systems as chat commands.")
    : "Viewing another player's catalog state in read-only mode. Use your own signed Guild Hall link to buy or equip items.";
  shopNote.className = `panel-note${getSectionFeedbackIsError("shop") ? " error-text" : ""}`;
}

function renderHelp(help) {
  helpList.innerHTML = "";
  commandList.innerHTML = "";

  (help?.systems || []).forEach((entry) => {
    const card = document.createElement("article");
    card.className = "reference-card";
    card.innerHTML = `<strong>${entry.title}</strong><div class="muted">${entry.body}</div>`;
    helpList.appendChild(card);
  });

  (help?.commands || []).forEach((command) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = command;
    commandList.appendChild(chip);
  });
}

function renderLeaderboard(leaderboard) {
  leaderboardList.innerHTML = "";
  (leaderboard || []).forEach((entry) => {
    const item = document.createElement("li");
    item.className = "leaderboard-item";
    item.innerHTML = `<strong>${entry.username}</strong><div class="muted">${entry.gold} gold${entry.title ? ` • ${entry.title}` : ""}</div>`;
    leaderboardList.appendChild(item);
  });
}

function renderDashboard() {
  const data = state.dashboard || {};
  const profile = data.profile || {};

  readOnlyBadge.textContent = data.runtime?.readOnly ? "READ ONLY" : "LIVE";
  entryUrl.textContent = data.runtime?.entryUrl || window.location.href;
  playerInput.value = data.runtime?.player || state.player || "";

  renderCreationPanel();
  renderProfile(profile);
  renderBoss(data.boss);
  renderStats(profile, data.help || {});
  renderClasses(profile);
  renderInventory(profile);
  renderEquipment(profile);
  renderShop(data.shop || {});
  renderHelp(data.help || {});
  renderLeaderboard(data.leaderboard || []);
}

function applyDashboard(data, options = {}) {
  state.dashboard = data;
  state.player = data?.runtime?.player || state.player;
  state.authMode = data?.runtime?.authMode || state.authMode;
  state.channelContext = data?.runtime?.channel || state.channelContext;
  state.requestHeaders = buildRequestHeaders();
  state.authToken = state.authToken || getAuthTokenFromQuery();
  if (options.resetCreation) {
    resetCreationState();
  }
  renderDashboard();
}

function adjustCreationStat(statKey, delta) {
  const rules = getCreationRules();
  const currentValue = Number(state.creationStats[statKey] || rules.baseStat);
  const nextValue = currentValue + delta;

  if (nextValue < rules.minimumStat || nextValue > rules.maximumStartingStat) {
    return;
  }

  if (delta > 0 && getCreationPointsRemaining() <= 0) {
    return;
  }

  state.creationStats[statKey] = nextValue;
  renderCreationPanel();
}

async function loadDashboard(player) {
  state.loadingDashboard = true;
  try {
    await ensureRuntimeSession(player);
    state.authToken = state.authToken || getAuthTokenFromQuery();
    const params = new URLSearchParams();
    const effectivePlayer = player || state.player;
    if (effectivePlayer) {
      params.set("player", effectivePlayer);
    }
    if (state.authToken) {
      params.set("auth", state.authToken);
    }
    const query = params.toString();
    const response = await fetch(buildApiUrl(`/api/guild/dashboard${query ? `?${query}` : ""}`), {
      cache: "no-store",
      headers: state.requestHeaders
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    state.player = effectivePlayer;
    applyDashboard(await response.json(), { resetCreation: true });
  } finally {
    state.loadingDashboard = false;
  }
}

async function submitGuildAction(endpoint, payload, section) {
  if (state.actionPending) {
    return;
  }

  if (isProfileLocked()) {
    setSectionFeedback(section, "Finish character creation before using this Guild Hall action.", true);
    renderDashboard();
    return;
  }

  if (!canEditActiveProfile()) {
    setSectionFeedback(section, "You can only edit your own Guild Hall profile.", true);
    renderDashboard();
    return;
  }

  if (!state.player) {
    setSectionFeedback(section, "Load a viewer name before using site actions.", true);
    renderDashboard();
    return;
  }

  state.actionPending = true;
  setSectionFeedback(section, "Submitting action...", false);
  renderDashboard();

  try {
    const response = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...state.requestHeaders
      },
      body: JSON.stringify({
        player: state.player,
        authToken: state.authToken,
        ...payload
      })
    });

    const data = await response.json();
    if (data.dashboard) {
      applyDashboard(data.dashboard);
    }

    setSectionFeedback(section, data.message || "Action completed.", !response.ok || data.ok === false);
  } catch (error) {
    setSectionFeedback(section, error.message || "Action failed.", true);
  } finally {
    state.actionPending = false;
    renderDashboard();
  }
}

async function createCharacter() {
  if (state.creationPending) {
    return;
  }

  if (!state.player) {
    creationFeedback.textContent = "Load a viewer name before finalizing a character.";
    creationFeedback.className = "feedback-box error";
    return;
  }

  if (!canEditActiveProfile()) {
    creationFeedback.textContent = "You can only edit your own Guild Hall profile.";
    creationFeedback.className = "feedback-box error";
    return;
  }

  state.creationPending = true;
  createCharacterButton.disabled = true;
  creationFeedback.textContent = "Finalizing character...";
  creationFeedback.className = "feedback-box";

  try {
    const response = await fetch(buildApiUrl("/api/guild/character/create"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...state.requestHeaders
      },
      body: JSON.stringify({
        player: state.player,
        authToken: state.authToken,
        classKey: state.selectedClassKey,
        stats: state.creationStats
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      const errors = Array.isArray(payload.errors) ? payload.errors.join(" ") : `Request failed: ${response.status}`;
      throw new Error(errors);
    }

    creationFeedback.textContent = "Character created. Reloading the Guild Hall state...";
    creationFeedback.className = "feedback-box success";
    await loadDashboard(state.player);
    creationFeedback.textContent = "Character created and persisted.";
    creationFeedback.className = "feedback-box success";
  } catch (error) {
    creationFeedback.textContent = error.message || "Unable to create character.";
    creationFeedback.className = "feedback-box error";
  } finally {
    state.creationPending = false;
    renderCreationPanel();
  }
}

playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const player = String(playerInput.value || "").trim().toLowerCase();
  setPlayerInQuery(player);
  loadDashboard(player).catch((error) => {
    bossBanner.textContent = `Unable to load dashboard: ${error.message}`;
  });
});

createCharacterButton.addEventListener("click", () => {
  createCharacter().catch((error) => {
    creationFeedback.textContent = error.message || "Unable to create character.";
    creationFeedback.className = "feedback-box error";
  });
});

loadDashboard(getPlayerFromQuery()).catch((error) => {
  bossBanner.textContent = `Unable to load dashboard: ${error.message}`;
});

window.addEventListener("beforeunload", () => {
  stopRealtimeSync();
});