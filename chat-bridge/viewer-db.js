const fs = require("fs");
const path = require("path");
const { calculateProgression } = require("./player-progression");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "viewers.json");
const PROFILE_VERSION = 2;

const DEFAULT_PLAYER_STATS = Object.freeze({
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10
});

function keyFor(username) {
  return String(username || "").trim().toLowerCase();
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(target, key) {
  return Boolean(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function readPath(source, pathParts) {
  let current = source;

  for (const part of pathParts) {
    if (!current || typeof current !== "object" || !hasOwn(current, part)) {
      return { found: false, value: undefined };
    }
    current = current[part];
  }

  return { found: true, value: current };
}

function readFirstDefined(source, paths, fallback) {
  for (const pathParts of paths) {
    const result = readPath(source, pathParts);
    if (result.found) {
      return result.value;
    }
  }

  return fallback;
}

function normalizeNumber(value, fallback = 0) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return fallback;
  }
  return nextValue;
}

function normalizeCount(value, fallback = 0) {
  return Math.max(0, Math.floor(normalizeNumber(value, fallback)));
}

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    if (value === null || value === undefined) {
      return fallback;
    }
    return String(value);
  }
  return value;
}

function normalizeKey(value, fallback = "") {
  return normalizeString(value, fallback).trim().toLowerCase();
}

function normalizeUnlockCollection(values, fallback = []) {
  const combined = [...fallback, ...(Array.isArray(values) ? values : [])]
    .map((entry) => normalizeKey(entry))
    .filter(Boolean);

  return [...new Set(combined)];
}

function normalizeFlagMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized = {};
  for (const [flagKey, flagValue] of Object.entries(value)) {
    const key = normalizeKey(flagKey);
    if (!key) {
      continue;
    }
    normalized[key] = Boolean(flagValue);
  }

  return normalized;
}

function normalizeInventory(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((entry) => normalizeInventoryEntry(entry))
    .filter(Boolean);
}

function normalizeInventoryEntry(entry) {
  if (typeof entry === "string") {
    const itemId = normalizeKey(entry);
    if (!itemId) {
      return null;
    }

    return {
      itemId,
      name: entry.trim(),
      category: "misc",
      rarity: "common",
      quantity: 1,
      permanent: true,
      equipable: false,
      statBonuses: {},
      effects: {},
      acquiredAt: 0
    };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const itemId = normalizeKey(entry.itemId || entry.id || entry.key || entry.name || "");
  if (!itemId) {
    return null;
  }

  const rawBonuses = entry.statBonuses && typeof entry.statBonuses === "object" ? entry.statBonuses : {};
  const rawEffects = entry.effects && typeof entry.effects === "object" ? entry.effects : {};

  return {
    itemId,
    name: normalizeString(entry.name, itemId),
    category: normalizeKey(entry.category, "misc") || "misc",
    rarity: normalizeKey(entry.rarity, "common") || "common",
    quantity: Math.max(1, normalizeCount(entry.quantity, 1)),
    permanent: entry.permanent !== false,
    equipable: Boolean(entry.equipable),
    statBonuses: { ...rawBonuses },
    effects: { ...rawEffects },
    acquiredAt: normalizeCount(entry.acquiredAt, 0)
  };
}

function createDefaultStoredViewer(username) {
  const key = keyFor(username);
  return {
    profileVersion: PROFILE_VERSION,
    identity: {
      username: key,
      displayName: key
    },
    currency: {
      gold: 0
    },
    progression: {
      totalXp: 0,
      level: 1
    },
    stats: { ...DEFAULT_PLAYER_STATS },
    classData: {
      activeClass: "peasant",
      activeClassPrimary: "peasant",
      activeClassSecondary: "",
      unlockedClasses: ["peasant"]
    },
    titleData: {
      activeTitle: "",
      unlockedTitles: []
    },
    inventory: [],
    equipment: {
      weapon: "",
      armor: "",
      accessory: ""
    },
    permanentUnlocks: {
      weapons: [],
      perks: [],
      flags: {}
    },
    combat: {
      totalDamage: 0
    },
    meta: {
      lastChatAt: 0,
      updatedAt: 0
    }
  };
}

function getLegacyTitleKey(record) {
  const rawTitle = normalizeString(readFirstDefined(record, [["title"], ["titleData", "activeTitle"]], ""), "");
  return rawTitle
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function normalizeStats(record) {
  const rawStats = readFirstDefined(record, [["stats"]], {});
  const stats = rawStats && typeof rawStats === "object" ? rawStats : {};

  return {
    strength: normalizeCount(stats.strength, DEFAULT_PLAYER_STATS.strength),
    dexterity: normalizeCount(stats.dexterity, DEFAULT_PLAYER_STATS.dexterity),
    constitution: normalizeCount(stats.constitution, DEFAULT_PLAYER_STATS.constitution),
    intelligence: normalizeCount(stats.intelligence, DEFAULT_PLAYER_STATS.intelligence),
    wisdom: normalizeCount(stats.wisdom, DEFAULT_PLAYER_STATS.wisdom),
    charisma: normalizeCount(stats.charisma, DEFAULT_PLAYER_STATS.charisma)
  };
}

function toStoredViewerRecord(record, username) {
  const key = keyFor(username || readFirstDefined(record, [["identity", "username"], ["username"]], ""));
  const defaults = createDefaultStoredViewer(key);
  const progression = calculateProgression(readFirstDefined(record, [["totalXp"], ["progression", "totalXp"]], 0));
  const activeClassPrimary = normalizeKey(readFirstDefined(record, [["className"], ["classData", "activeClassPrimary"], ["classData", "activeClass"]], defaults.classData.activeClassPrimary), defaults.classData.activeClassPrimary) || defaults.classData.activeClassPrimary;
  let activeClassSecondary = normalizeKey(readFirstDefined(record, [["classData", "activeClassSecondary"]], defaults.classData.activeClassSecondary), defaults.classData.activeClassSecondary);
  if (activeClassSecondary === activeClassPrimary) {
    activeClassSecondary = "";
  }
  const activeTitle = normalizeString(readFirstDefined(record, [["title"], ["titleData", "activeTitle"]], defaults.titleData.activeTitle), defaults.titleData.activeTitle).trim();
  const equippedWeapon = normalizeKey(readFirstDefined(record, [["weapon"], ["equipment", "weapon"]], defaults.equipment.weapon), defaults.equipment.weapon);
  const equippedArmor = normalizeKey(readFirstDefined(record, [["armor"], ["equipment", "armor"]], defaults.equipment.armor), defaults.equipment.armor);
  const equippedAccessory = normalizeKey(readFirstDefined(record, [["accessory"], ["equipment", "accessory"]], defaults.equipment.accessory), defaults.equipment.accessory);

  return {
    profileVersion: PROFILE_VERSION,
    identity: {
      username: key,
      displayName: normalizeString(readFirstDefined(record, [["displayName"], ["identity", "displayName"]], key), key).trim() || key
    },
    currency: {
      gold: normalizeCount(readFirstDefined(record, [["gold"], ["currency", "gold"]], defaults.currency.gold), defaults.currency.gold)
    },
    progression: {
      totalXp: progression.totalXp,
      level: progression.level
    },
    stats: normalizeStats(record),
    classData: {
      activeClass: activeClassPrimary,
      activeClassPrimary,
      activeClassSecondary,
      unlockedClasses: normalizeUnlockCollection(
        readFirstDefined(record, [["classData", "unlockedClasses"], ["ownedUnlocks", "classes"]], []),
        [activeClassPrimary || defaults.classData.activeClassPrimary]
      )
    },
    titleData: {
      activeTitle,
      unlockedTitles: normalizeUnlockCollection(
        readFirstDefined(record, [["titleData", "unlockedTitles"], ["ownedUnlocks", "titles"]], []),
        getLegacyTitleKey(record) ? [getLegacyTitleKey(record)] : []
      )
    },
    inventory: normalizeInventory(readFirstDefined(record, [["inventory"]], defaults.inventory)),
    equipment: {
      weapon: equippedWeapon,
      armor: equippedArmor,
      accessory: equippedAccessory
    },
    permanentUnlocks: {
      weapons: normalizeUnlockCollection(
        readFirstDefined(record, [["permanentUnlocks", "weapons"], ["ownedUnlocks", "weapons"]], []),
        equippedWeapon ? [equippedWeapon] : []
      ),
      perks: normalizeUnlockCollection(readFirstDefined(record, [["permanentUnlocks", "perks"], ["ownedUnlocks", "perks"]], []), []),
      flags: normalizeFlagMap(readFirstDefined(record, [["permanentUnlocks", "flags"], ["ownedUnlocks", "flags"]], {}))
    },
    combat: {
      totalDamage: normalizeCount(readFirstDefined(record, [["totalDamage"], ["combat", "totalDamage"]], defaults.combat.totalDamage), defaults.combat.totalDamage)
    },
    meta: {
      lastChatAt: normalizeCount(readFirstDefined(record, [["lastChatAt"], ["meta", "lastChatAt"]], defaults.meta.lastChatAt), defaults.meta.lastChatAt),
      updatedAt: normalizeCount(readFirstDefined(record, [["updatedAt"], ["meta", "updatedAt"]], Date.now()), Date.now())
    }
  };
}

function getOwnedUnlocksFromStored(storedRecord) {
  const stored = storedRecord || createDefaultStoredViewer("");
  return {
    classes: normalizeUnlockCollection(stored.classData?.unlockedClasses, [stored.classData?.activeClass || "peasant"]),
    weapons: normalizeUnlockCollection(stored.permanentUnlocks?.weapons, stored.equipment?.weapon ? [stored.equipment.weapon] : []),
    titles: normalizeUnlockCollection(stored.titleData?.unlockedTitles, []),
    perks: normalizeUnlockCollection(stored.permanentUnlocks?.perks, []),
    flags: normalizeFlagMap(stored.permanentUnlocks?.flags)
  };
}

function materializeViewerRecord(storedRecord) {
  const stored = cloneValue(storedRecord);
  const ownedUnlocks = getOwnedUnlocksFromStored(stored);

  return {
    profileVersion: stored.profileVersion,
    username: stored.identity.username,
    displayName: stored.identity.displayName,
    identity: stored.identity,
    currency: stored.currency,
    progression: stored.progression,
    stats: stored.stats,
    classData: stored.classData,
    titleData: stored.titleData,
    inventory: stored.inventory,
    equipment: stored.equipment,
    permanentUnlocks: stored.permanentUnlocks,
    combat: stored.combat,
    meta: stored.meta,
    gold: stored.currency.gold,
    totalXp: stored.progression.totalXp,
    level: stored.progression.level,
    className: stored.classData.activeClassPrimary || stored.classData.activeClass,
    activeClassPrimary: stored.classData.activeClassPrimary || stored.classData.activeClass,
    activeClassSecondary: stored.classData.activeClassSecondary || "",
    title: stored.titleData.activeTitle,
    weapon: stored.equipment.weapon,
    armor: stored.equipment.armor,
    accessory: stored.equipment.accessory,
    ownedUnlocks,
    totalDamage: stored.combat.totalDamage,
    lastChatAt: stored.meta.lastChatAt,
    updatedAt: stored.meta.updatedAt
  };
}

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

function getViewer(username) {
  const key = keyFor(username);
  if (!key) return null;

  const db = safeRead();
  return materializeViewerRecord(toStoredViewerRecord(db.viewers[key] || {}, key));
}

function upsertViewer(username, mutator) {
  const key = keyFor(username);
  if (!key) return null;

  const db = safeRead();
  const current = materializeViewerRecord(toStoredViewerRecord(db.viewers[key] || {}, key));
  const next = mutator(cloneValue(current)) || current;

  if (!next.meta || typeof next.meta !== "object") {
    next.meta = {};
  }
  next.updatedAt = Date.now();
  next.meta.updatedAt = next.updatedAt;

  db.viewers[key] = toStoredViewerRecord(next, key);
  safeWrite(db);

  return materializeViewerRecord(db.viewers[key]);
}

function addGold(username, amount) {
  const delta = Math.max(0, Number(amount || 0));
  return upsertViewer(username, (viewer) => {
    viewer.gold += delta;
    viewer.currency.gold = viewer.gold;
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
    viewer.currency.gold = viewer.gold;
    return viewer;
  });
}

function setTitle(username, title) {
  return upsertViewer(username, (viewer) => {
    viewer.title = normalizeString(title, "").trim();
    viewer.titleData.activeTitle = viewer.title;
    return viewer;
  });
}

function setClass(username, className) {
  return upsertViewer(username, (viewer) => {
    viewer.className = normalizeKey(className, "peasant") || "peasant";
    viewer.classData.activeClass = viewer.className;
    viewer.classData.activeClassPrimary = viewer.className;
    if (normalizeKey(viewer.classData.activeClassSecondary) === viewer.className) {
      viewer.classData.activeClassSecondary = "";
    }
    return viewer;
  });
}

function setSecondaryClass(username, className) {
  return upsertViewer(username, (viewer) => {
    const normalizedClass = normalizeKey(className, "");
    if (!normalizedClass || normalizedClass === normalizeKey(viewer.classData.activeClassPrimary || viewer.className || "peasant")) {
      viewer.classData.activeClassSecondary = "";
      return viewer;
    }

    viewer.classData.activeClassSecondary = normalizedClass;
    return viewer;
  });
}

function clearSecondaryClass(username) {
  return upsertViewer(username, (viewer) => {
    viewer.classData.activeClassSecondary = "";
    return viewer;
  });
}

function setWeapon(username, weapon) {
  return upsertViewer(username, (viewer) => {
    viewer.weapon = normalizeKey(weapon, "");
    viewer.equipment.weapon = viewer.weapon;
    return viewer;
  });
}

function setEquipmentSlot(username, slot, itemId) {
  const safeSlot = normalizeKey(slot);
  const safeItemId = normalizeKey(itemId);
  if (!["weapon", "armor", "accessory"].includes(safeSlot)) {
    return getViewer(username);
  }

  return upsertViewer(username, (viewer) => {
    const inventoryItem = normalizeInventory(viewer.inventory).find((entry) => entry.itemId === safeItemId && entry.category === safeSlot);
    if (!inventoryItem) {
      return viewer;
    }

    viewer.equipment[safeSlot] = safeItemId;
    if (safeSlot === "weapon") {
      viewer.weapon = safeItemId;
    }
    if (safeSlot === "armor") {
      viewer.armor = safeItemId;
    }
    if (safeSlot === "accessory") {
      viewer.accessory = safeItemId;
    }
    return viewer;
  });
}

function clearEquipmentSlot(username, slot) {
  const safeSlot = normalizeKey(slot);
  if (!["weapon", "armor", "accessory"].includes(safeSlot)) {
    return getViewer(username);
  }

  return upsertViewer(username, (viewer) => {
    viewer.equipment[safeSlot] = "";
    if (safeSlot === "weapon") {
      viewer.weapon = "";
    }
    if (safeSlot === "armor") {
      viewer.armor = "";
    }
    if (safeSlot === "accessory") {
      viewer.accessory = "";
    }
    return viewer;
  });
}

function addDamage(username, damage) {
  const safeDamage = Math.max(0, Number(damage || 0));
  return upsertViewer(username, (viewer) => {
    viewer.totalDamage += safeDamage;
    viewer.combat.totalDamage = viewer.totalDamage;
    return viewer;
  });
}

function addXp(username, amount) {
  const xpAward = Math.max(0, Math.floor(Number(amount || 0)));
  if (!xpAward) {
    const existing = getViewer(username);
    return existing ? {
      ...existing,
      xpAwarded: 0,
      previousLevel: existing.level,
      leveledUp: false,
      levelsGained: 0
    } : null;
  }

  const previous = getViewer(username);
  const updated = upsertViewer(username, (viewer) => {
    viewer.totalXp = Number(viewer.totalXp || 0) + xpAward;
    viewer.progression.totalXp = viewer.totalXp;
    return viewer;
  });

  return {
    ...updated,
    xpAwarded: xpAward,
    previousLevel: previous ? previous.level : 1,
    leveledUp: Boolean(updated && previous && updated.level > previous.level),
    levelsGained: Math.max(0, Number((updated && updated.level) || 1) - Number((previous && previous.level) || 1))
  };
}

function getUnlockCollections(viewer) {
  if (!viewer) {
    return {
      classes: [],
      weapons: [],
      titles: [],
      perks: [],
      flags: {}
    };
  }

  return {
    classes: normalizeUnlockCollection(viewer.classData?.unlockedClasses, [viewer.className || "peasant"]),
    weapons: normalizeUnlockCollection(viewer.permanentUnlocks?.weapons, viewer.weapon ? [viewer.weapon] : []),
    titles: normalizeUnlockCollection(viewer.titleData?.unlockedTitles, []),
    perks: normalizeUnlockCollection(viewer.permanentUnlocks?.perks, []),
    flags: normalizeFlagMap(viewer.permanentUnlocks?.flags)
  };
}

function getInventoryItem(viewer, itemId) {
  const safeItemId = normalizeKey(itemId);
  if (!viewer || !safeItemId) {
    return null;
  }

  return normalizeInventory(viewer.inventory).find((entry) => entry.itemId === safeItemId) || null;
}

function hasInventoryItem(username, itemId) {
  const viewer = getViewer(username);
  return Boolean(getInventoryItem(viewer, itemId));
}

function addInventoryItem(username, item, options = {}) {
  const normalizedItem = normalizeInventoryEntry({
    itemId: item?.id || item?.itemId || item?.key,
    name: item?.name,
    category: item?.category || item?.gearCategory || "misc",
    rarity: item?.rarity || "common",
    quantity: Math.max(1, normalizeCount(options.quantity, 1)),
    permanent: item?.permanent !== false,
    equipable: Boolean(item?.equipable),
    statBonuses: item?.statBonuses || {},
    effects: item?.effects || {},
    acquiredAt: Date.now()
  });

  if (!normalizedItem) {
    return getViewer(username);
  }

  const allowDuplicates = Boolean(options.allowDuplicates);
  return upsertViewer(username, (viewer) => {
    const inventory = normalizeInventory(viewer.inventory);
    const existingIndex = inventory.findIndex((entry) => entry.itemId === normalizedItem.itemId);

    if (existingIndex >= 0) {
      if (allowDuplicates) {
        inventory[existingIndex].quantity += normalizedItem.quantity;
      }
      viewer.inventory = inventory;
      return viewer;
    }

    inventory.push(normalizedItem);
    viewer.inventory = inventory;
    return viewer;
  });
}

function hasUnlock(username, collection, key) {
  const viewer = getViewer(username);
  if (!viewer) return false;

  const normalizedCollection = normalizeString(collection, "").trim();
  const normalizedKey = normalizeKey(key);
  const unlocks = getUnlockCollections(viewer);

  if (normalizedCollection === "flags") {
    return Boolean(unlocks.flags[normalizedKey]);
  }

  return Array.isArray(unlocks[normalizedCollection])
    ? unlocks[normalizedCollection].includes(normalizedKey)
    : false;
}

function grantUnlock(username, collection, key) {
  const normalizedCollection = normalizeString(collection, "").trim();
  const normalizedKey = normalizeKey(key);
  if (!normalizedCollection || !normalizedKey) {
    return getViewer(username);
  }

  return upsertViewer(username, (viewer) => {
    const unlocks = getUnlockCollections(viewer);

    if (normalizedCollection === "classes") {
      viewer.classData.unlockedClasses = normalizeUnlockCollection(unlocks.classes, [normalizedKey]);
      return viewer;
    }

    if (normalizedCollection === "titles") {
      viewer.titleData.unlockedTitles = normalizeUnlockCollection(unlocks.titles, [normalizedKey]);
      return viewer;
    }

    if (normalizedCollection === "weapons") {
      viewer.permanentUnlocks.weapons = normalizeUnlockCollection(unlocks.weapons, [normalizedKey]);
      return viewer;
    }

    if (normalizedCollection === "perks") {
      viewer.permanentUnlocks.perks = normalizeUnlockCollection(unlocks.perks, [normalizedKey]);
      return viewer;
    }

    if (normalizedCollection === "flags") {
      viewer.permanentUnlocks.flags = {
        ...unlocks.flags,
        [normalizedKey]: true
      };
    }

    return viewer;
  });
}

function markChatActivity(username) {
  return upsertViewer(username, (viewer) => {
    viewer.lastChatAt = Date.now();
    viewer.meta.lastChatAt = viewer.lastChatAt;
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
    .map(([username, viewer]) => {
      const normalized = materializeViewerRecord(toStoredViewerRecord(viewer, username));
      return {
        username,
        gold: Number(normalized.gold || 0)
      };
    })
    .sort((a, b) => b.gold - a.gold)
    .slice(0, Math.max(1, Number(limit || 5)));
}

function countRecentlyActive(msWindow = 180000) {
  const db = safeRead();
  const now = Date.now();
  const threshold = now - Math.max(1000, Number(msWindow || 180000));
  let count = 0;

  for (const [username, viewer] of Object.entries(db.viewers)) {
    const normalized = materializeViewerRecord(toStoredViewerRecord(viewer, username));
    if (Number(normalized.lastChatAt || 0) >= threshold) {
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

  for (const [username, viewer] of Object.entries(db.viewers)) {
    const normalized = materializeViewerRecord(toStoredViewerRecord(viewer, username));
    if (Number(normalized.lastChatAt || 0) < threshold) {
      continue;
    }

    activeCount += 1;
    if (String(normalized.weapon || "").trim()) {
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
  PROFILE_VERSION,
  DEFAULT_PLAYER_STATS,
  getViewer,
  addGold,
  spendGold,
  setTitle,
  setClass,
  setSecondaryClass,
  clearSecondaryClass,
  setWeapon,
  setEquipmentSlot,
  clearEquipmentSlot,
  addDamage,
  addXp,
  hasInventoryItem,
  addInventoryItem,
  hasUnlock,
  grantUnlock,
  markChatActivity,
  canAfford,
  getTopGold,
  countRecentlyActive,
  getCombatReadiness
};
