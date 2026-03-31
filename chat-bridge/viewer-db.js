const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "viewers.json");

const DEFAULT_VIEWER = {
  gold: 0,
  title: "",
  className: "peasant",
  weapon: "",
  totalDamage: 0,
  lastChatAt: 0,
  updatedAt: 0
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ viewers: {} }, null, 2), "utf8");
  }
}

function safeRead() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { viewers: {} };
    }

    if (!parsed.viewers || typeof parsed.viewers !== "object") {
      parsed.viewers = {};
    }

    return parsed;
  } catch (error) {
    return { viewers: {} };
  }
}

function safeWrite(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function keyFor(username) {
  return String(username || "").trim().toLowerCase();
}

function getViewer(username) {
  const key = keyFor(username);
  if (!key) return null;

  const db = safeRead();
  const existing = db.viewers[key] || {};
  return {
    username: key,
    ...DEFAULT_VIEWER,
    ...existing
  };
}

function upsertViewer(username, mutator) {
  const key = keyFor(username);
  if (!key) return null;

  const db = safeRead();
  const current = {
    username: key,
    ...DEFAULT_VIEWER,
    ...(db.viewers[key] || {})
  };

  const next = mutator({ ...current }) || current;
  next.updatedAt = Date.now();

  db.viewers[key] = {
    gold: Number(next.gold || 0),
    title: String(next.title || ""),
    className: String(next.className || "peasant"),
    weapon: String(next.weapon || ""),
    totalDamage: Number(next.totalDamage || 0),
    lastChatAt: Number(next.lastChatAt || 0),
    updatedAt: Number(next.updatedAt || Date.now())
  };

  safeWrite(db);

  return {
    username: key,
    ...db.viewers[key]
  };
}

function addGold(username, amount) {
  const delta = Math.max(0, Number(amount || 0));
  return upsertViewer(username, (viewer) => {
    viewer.gold += delta;
    return viewer;
  });
}

function spendGold(username, amount) {
  const cost = Math.max(0, Number(amount || 0));
  return upsertViewer(username, (viewer) => {
    if (viewer.gold < cost) {
      return viewer;
    }

    viewer.gold -= cost;
    return viewer;
  });
}

function setTitle(username, title) {
  return upsertViewer(username, (viewer) => {
    viewer.title = String(title || "").trim();
    return viewer;
  });
}

function setClass(username, className) {
  return upsertViewer(username, (viewer) => {
    viewer.className = String(className || "peasant").trim().toLowerCase();
    return viewer;
  });
}

function setWeapon(username, weapon) {
  return upsertViewer(username, (viewer) => {
    viewer.weapon = String(weapon || "").trim().toLowerCase();
    return viewer;
  });
}

function addDamage(username, damage) {
  const safeDamage = Math.max(0, Number(damage || 0));
  return upsertViewer(username, (viewer) => {
    viewer.totalDamage += safeDamage;
    return viewer;
  });
}

function markChatActivity(username) {
  return upsertViewer(username, (viewer) => {
    viewer.lastChatAt = Date.now();
    return viewer;
  });
}

function canAfford(username, amount) {
  const viewer = getViewer(username);
  if (!viewer) return false;
  return Number(viewer.gold || 0) >= Number(amount || 0);
}

function getTopGold(limit = 5) {
  const db = safeRead();
  return Object.entries(db.viewers)
    .map(([username, viewer]) => ({ username, gold: Number(viewer.gold || 0) }))
    .sort((a, b) => b.gold - a.gold)
    .slice(0, Math.max(1, Number(limit || 5)));
}

function countRecentlyActive(msWindow = 180000) {
  const db = safeRead();
  const now = Date.now();
  const threshold = now - Math.max(1000, Number(msWindow || 180000));
  let count = 0;

  for (const viewer of Object.values(db.viewers)) {
    if (Number(viewer.lastChatAt || 0) >= threshold) {
      count += 1;
    }
  }

  return count;
}

function getCombatReadiness(msWindow = 180000) {
  const db = safeRead();
  const now = Date.now();
  const threshold = now - Math.max(1000, Number(msWindow || 180000));

  let activeCount = 0;
  let armedCount = 0;

  for (const viewer of Object.values(db.viewers)) {
    if (Number(viewer.lastChatAt || 0) < threshold) {
      continue;
    }

    activeCount += 1;
    if (String(viewer.weapon || "").trim()) {
      armedCount += 1;
    }
  }

  return {
    activeCount,
    armedCount,
    unarmedCount: Math.max(0, activeCount - armedCount)
  };
}

module.exports = {
  getViewer,
  addGold,
  spendGold,
  setTitle,
  setClass,
  setWeapon,
  addDamage,
  markChatActivity,
  canAfford,
  getTopGold,
  countRecentlyActive,
  getCombatReadiness
};
