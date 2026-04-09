const playerForm = document.getElementById("player-form");
const playerInput = document.getElementById("player-input");
const readOnlyBadge = document.getElementById("read-only-badge");
const entryUrl = document.getElementById("entry-url");
const profileName = document.getElementById("profile-name");
const goldValue = document.getElementById("gold-value");
const levelValue = document.getElementById("level-value");
const xpValue = document.getElementById("xp-value");
const damageValue = document.getElementById("damage-value");
const bossBanner = document.getElementById("boss-banner");
const statsList = document.getElementById("stats-list");
const classSlots = document.getElementById("class-slots");
const unlockedClasses = document.getElementById("unlocked-classes");
const titleSlot = document.getElementById("title-slot");
const unlockedTitles = document.getElementById("unlocked-titles");
const equipmentSlots = document.getElementById("equipment-slots");
const inventoryList = document.getElementById("inventory-list");
const shopColumns = document.getElementById("shop-columns");
const leaderboardList = document.getElementById("leaderboard-list");

function getPlayerFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("player") || "").trim();
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

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatBonuses(bonuses) {
  const entries = Object.entries(bonuses || {}).filter(([, value]) => Number(value || 0) !== 0);
  if (!entries.length) {
    return "No bonus";
  }

  return entries.map(([key, value]) => {
    if (String(key).toLowerCase().includes("chance") || String(key).toLowerCase().includes("multiplier") || String(key).toLowerCase().includes("discount")) {
      return `${key}: ${formatPercent(value)}`;
    }
    return `${key}: +${value}`;
  }).join(" • ");
}

function renderStats(stats) {
  statsList.innerHTML = "";
  Object.entries(stats || {}).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span>${key}</span><strong>${value}</strong>`;
    statsList.appendChild(row);
  });
}

function renderClassData(profile) {
  classSlots.innerHTML = "";
  unlockedClasses.innerHTML = "";

  const primary = profile?.classData?.activeClassPrimary || profile?.classData?.activeClass || "peasant";
  const secondary = profile?.classData?.activeClassSecondary || "";

  [["Primary Class", primary], ["Secondary Class", secondary || "None"]].forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.innerHTML = `<span class="slot-label">${label}</span><strong>${value}</strong>`;
    classSlots.appendChild(card);
  });

  const activeKeys = new Set([String(primary).toLowerCase(), String(secondary).toLowerCase()]);
  (profile?.classData?.unlockedClasses || []).forEach((classKey) => {
    const chip = document.createElement("span");
    chip.className = `chip${activeKeys.has(String(classKey).toLowerCase()) ? " active" : ""}`;
    chip.textContent = classKey;
    unlockedClasses.appendChild(chip);
  });
}

function renderTitleData(profile) {
  titleSlot.innerHTML = "";
  unlockedTitles.innerHTML = "";

  const activeTitle = profile?.titleData?.activeTitle || "None";
  const activeCard = document.createElement("article");
  activeCard.className = "slot-card";
  activeCard.innerHTML = `<span class="slot-label">Active Title</span><strong>${activeTitle}</strong>`;
  titleSlot.appendChild(activeCard);

  const activeKey = String(activeTitle).trim().toLowerCase().replace(/\s+/g, "-");
  (profile?.titleData?.unlockedTitles || []).forEach((titleKey) => {
    const chip = document.createElement("span");
    chip.className = `chip${activeKey === String(titleKey).toLowerCase() ? " active" : ""}`;
    chip.textContent = titleKey;
    unlockedTitles.appendChild(chip);
  });
}

function renderInventory(profile) {
  equipmentSlots.innerHTML = "";
  inventoryList.innerHTML = "";

  Object.entries(profile?.equipment || {}).forEach(([slot, itemId]) => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.innerHTML = `<span class="slot-label">${slot}</span><strong>${itemId || "None"}</strong>`;
    equipmentSlots.appendChild(card);
  });

  const items = Array.isArray(profile?.inventory) ? profile.inventory : [];
  if (!items.length) {
    const empty = document.createElement("article");
    empty.className = "inventory-card";
    empty.innerHTML = "<strong>No owned items</strong><span class='inventory-meta'>Buy gear in chat for now, then refresh this page.</span>";
    inventoryList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "inventory-card";
    const equipped = profile?.equipment?.[item.category] === item.itemId ? "Equipped" : "Stored";
    card.innerHTML = `<strong>${item.name}</strong><div class="inventory-meta">${item.category} • ${item.rarity} • ${equipped}</div><div class="muted">${formatBonuses(item.statBonuses)}</div>`;
    inventoryList.appendChild(card);
  });
}

function renderShop(shop) {
  shopColumns.innerHTML = "";

  const groups = [
    ["Classes", shop?.permanentUnlocks?.classes || []],
    ["Titles", shop?.permanentUnlocks?.titles || []],
    ["Gear Weapons", shop?.gear?.weapons || []],
    ["Armor", shop?.gear?.armor || []],
    ["Accessories", shop?.gear?.accessories || []],
    ["Consumables", shop?.consumables?.summons || []]
  ];

  groups.forEach(([label, items]) => {
    const card = document.createElement("section");
    card.className = "shop-card";
    const itemMarkup = items.slice(0, 8).map((item) => `<article class="shop-item"><div class="shop-item-head"><strong>${item.name}</strong><span>${item.cost}g</span></div><div class="shop-meta">${item.itemType} • ${item.category}</div><div class="muted">${item.passiveText || item.description || formatBonuses(item.statBonuses)}</div></article>`).join("");
    card.innerHTML = `<h3>${label}</h3><div class="shop-items">${itemMarkup || "<div class='muted'>No items yet.</div>"}</div>`;
    shopColumns.appendChild(card);
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

function renderBoss(boss) {
  if (!boss?.active) {
    bossBanner.textContent = "No active boss. The guild hall is quiet for now.";
    return;
  }

  bossBanner.textContent = `${boss.name} is active with ${boss.hp}/${boss.maxHp} HP.`;
}

function renderDashboard(data) {
  const profile = data.profile || {};
  const displayName = profile.displayName || profile.username || "Traveler";

  readOnlyBadge.textContent = data.runtime?.readOnly ? "READ ONLY" : "LIVE";
  entryUrl.textContent = data.runtime?.entryUrl || window.location.href;
  profileName.textContent = displayName;
  goldValue.textContent = String(profile.currency?.gold || 0);
  levelValue.textContent = String(profile.progression?.level || 1);
  xpValue.textContent = String(profile.progression?.totalXp || 0);
  damageValue.textContent = String(profile.combat?.totalDamage || 0);
  playerInput.value = data.runtime?.player || profile.username || "";

  renderBoss(data.boss);
  renderStats(profile.stats || {});
  renderClassData(profile);
  renderTitleData(profile);
  renderInventory(profile);
  renderShop(data.shop || {});
  renderLeaderboard(data.leaderboard || []);
}

async function loadDashboard(player) {
  const query = player ? `?player=${encodeURIComponent(player)}` : "";
  const response = await fetch(`/api/guild/dashboard${query}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = await response.json();
  renderDashboard(data);
}

playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const player = String(playerInput.value || "").trim().toLowerCase();
  setPlayerInQuery(player);
  loadDashboard(player).catch((error) => {
    bossBanner.textContent = `Unable to load dashboard: ${error.message}`;
  });
});

loadDashboard(getPlayerFromQuery()).catch((error) => {
  bossBanner.textContent = `Unable to load dashboard: ${error.message}`;
});