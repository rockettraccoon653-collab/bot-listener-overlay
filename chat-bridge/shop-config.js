function defineShopItems(items, metadata) {
  return Object.fromEntries(Object.entries(items).map(([key, item]) => [key, {
    ...metadata,
    ...item
  }]));
}

const CLASSES = defineShopItems({
  peasant: {
    key: "peasant",
    name: "Peasant",
    cost: 0,
    attackDice: "1d6",
    spellDice: "1d4",
    uniqueCommand: "",
    uniqueDice: ""
  },
  warrior: {
    key: "warrior",
    name: "Warrior",
    cost: 125,
    attackDice: "1d8+3",
    spellDice: "1d4",
    uniqueCommand: "!overpower",
    uniqueDice: "2d6+5"
  },
  fighter: {
    key: "fighter",
    name: "Fighter",
    cost: 150,
    attackDice: "1d8+4",
    spellDice: "1d4",
    uniqueCommand: "!cleave",
    uniqueDice: "2d6+6"
  },
  rogue: {
    key: "rogue",
    name: "Rogue",
    cost: 200,
    attackDice: "1d6+6",
    spellDice: "1d4",
    uniqueCommand: "!backstab",
    uniqueDice: "2d6+10"
  },
  bard: {
    key: "bard",
    name: "Bard",
    cost: 175,
    attackDice: "1d6+2",
    spellDice: "1d6+2",
    uniqueCommand: "!inspire",
    uniqueDice: "1d4+3"
  },
  ranger: {
    key: "ranger",
    name: "Ranger",
    cost: 250,
    attackDice: "1d10+3",
    spellDice: "1d6",
    uniqueCommand: "!volley",
    uniqueDice: "2d4+8"
  },
  barbarian: {
    key: "barbarian",
    name: "Barbarian",
    cost: 200,
    attackDice: "2d6+5",
    spellDice: "1d4",
    uniqueCommand: "!rage",
    uniqueDice: "3d8+10"
  },
  druid: {
    key: "druid",
    name: "Druid",
    cost: 225,
    attackDice: "1d8+3",
    spellDice: "2d4+4",
    uniqueCommand: "!thorns",
    uniqueDice: "2d6+4"
  },
  paladin: {
    key: "paladin",
    name: "Paladin",
    cost: 350,
    attackDice: "1d8+5",
    spellDice: "1d6+3",
    uniqueCommand: "!holy",
    uniqueDice: "2d8"
  },
  mage: {
    key: "mage",
    name: "Mage",
    cost: 300,
    attackDice: "1d4+2",
    spellDice: "2d6+5",
    uniqueCommand: "!fireball",
    uniqueDice: "3d6"
  },
  cleric: {
    key: "cleric",
    name: "Cleric",
    cost: 225,
    attackDice: "1d6+2",
    spellDice: "2d4+4",
    uniqueCommand: "!prayer",
    uniqueDice: "2d6+3"
  },
  warlock: {
    key: "warlock",
    name: "Warlock",
    cost: 400,
    attackDice: "1d6+3",
    spellDice: "2d8+5",
    uniqueCommand: "!hex",
    uniqueDice: "2d6+7"
  }
}, {
  shopGroup: "permanentUnlocks",
  purchaseScope: "persistent",
  duplicatePolicy: "owned-requip",
  unlockCollection: "classes",
  itemType: "class"
});

const WEAPONS = defineShopItems({
  "iron-sword": { key: "iron-sword", name: "Iron Sword", cost: 50, attackDice: "1d6+2" },
  "blood-sword": { key: "blood-sword", name: "Blood Sword", cost: 250, attackDice: "1d4+20" },
  "storm-staff": { key: "storm-staff", name: "Storm Staff", cost: 180, attackDice: "2d6+3" },
  "shadow-dagger": { key: "shadow-dagger", name: "Shadow Dagger", cost: 200, attackDice: "2d4+5" },
  "holy-mace": { key: "holy-mace", name: "Holy Mace", cost: 220, attackDice: "1d8+8" },
  greatsword: { key: "greatsword", name: "Greatsword", cost: 300, attackDice: "2d8+4" },
  "frost-wand": { key: "frost-wand", name: "Frost Wand", cost: 275, attackDice: "1d10+6" },
  "elven-bow": { key: "elven-bow", name: "Elven Bow", cost: 200, attackDice: "3d4+2" }
}, {
  shopGroup: "permanentUnlocks",
  purchaseScope: "persistent",
  duplicatePolicy: "owned-requip",
  unlockCollection: "weapons",
  itemType: "weapon"
});

const GEAR_WEAPONS = defineShopItems({
  "basic-sword": {
    id: "basic-sword",
    key: "basic-sword",
    name: "Basic Sword",
    category: "weapon",
    rarity: "common",
    cost: 70,
    statBonuses: { physicalFlat: 1 },
    effects: {},
    permanent: true,
    equipable: true
  },
  "rogue-dagger": {
    id: "rogue-dagger",
    key: "rogue-dagger",
    name: "Rogue Dagger",
    category: "weapon",
    rarity: "uncommon",
    cost: 130,
    statBonuses: { physicalFlat: 1, critChance: 0.02 },
    effects: {},
    permanent: true,
    equipable: true
  },
  "mage-focus": {
    id: "mage-focus",
    key: "mage-focus",
    name: "Mage Focus",
    category: "weapon",
    rarity: "uncommon",
    cost: 140,
    statBonuses: { spellFlat: 1 },
    effects: {},
    permanent: true,
    equipable: true
  }
}, {
  shopGroup: "gear",
  purchaseScope: "persistent",
  duplicatePolicy: "owned-once",
  itemType: "gear",
  gearCategory: "weapon"
});

const ARMOR = defineShopItems({
  "leather-armor": {
    id: "leather-armor",
    key: "leather-armor",
    name: "Leather Armor",
    category: "armor",
    rarity: "common",
    cost: 90,
    statBonuses: { constitutionGuard: 1 },
    effects: { future: "light-defense" },
    permanent: true,
    equipable: true
  },
  "iron-armor": {
    id: "iron-armor",
    key: "iron-armor",
    name: "Iron Armor",
    category: "armor",
    rarity: "uncommon",
    cost: 160,
    statBonuses: { constitutionGuard: 2 },
    effects: { future: "heavy-defense" },
    permanent: true,
    equipable: true
  }
}, {
  shopGroup: "gear",
  purchaseScope: "persistent",
  duplicatePolicy: "owned-once",
  itemType: "gear",
  gearCategory: "armor"
});

const ACCESSORIES = defineShopItems({
  "lucky-charm": {
    id: "lucky-charm",
    key: "lucky-charm",
    name: "Lucky Charm",
    category: "accessory",
    rarity: "common",
    cost: 110,
    statBonuses: { critChance: 0.01 },
    effects: { future: "lucky-rolls" },
    permanent: true,
    equipable: true
  },
  "wisdom-pendant": {
    id: "wisdom-pendant",
    key: "wisdom-pendant",
    name: "Wisdom Pendant",
    category: "accessory",
    rarity: "uncommon",
    cost: 150,
    statBonuses: { xpMultiplier: 0.05 },
    effects: { future: "reward-scaling" },
    permanent: true,
    equipable: true
  }
}, {
  shopGroup: "gear",
  purchaseScope: "persistent",
  duplicatePolicy: "owned-once",
  itemType: "gear",
  gearCategory: "accessory"
});

const MONSTERS = defineShopItems({
  goblin: {
    key: "goblin",
    name: "Goblin King",
    cost: 50,
    baseHp: 170,
    minArmedCount: 0,
    tier: 1,
    visual: { glyph: "GK", accent: "#8bcf62" }
  },
  troll: {
    key: "troll",
    name: "Stone Troll",
    cost: 100,
    baseHp: 250,
    minArmedCount: 1,
    tier: 2,
    visual: { glyph: "ST", accent: "#94b8a5" }
  },
  dragon: {
    key: "dragon",
    name: "Elder Dragon",
    cost: 200,
    baseHp: 340,
    minArmedCount: 3,
    tier: 3,
    visual: { glyph: "ED", accent: "#f2906f" }
  }
}, {
  shopGroup: "consumables",
  purchaseScope: "session",
  duplicatePolicy: "allow",
  itemType: "summon"
});

const EFFECTS = defineShopItems({
  "ember-veil": { key: "ember-veil", name: "Ember Veil", cost: 35, type: "effect" },
  stormcall: { key: "stormcall", name: "Stormcall", cost: 45, type: "effect" },
  "rune-circle": { key: "rune-circle", name: "Rune Circle", cost: 40, type: "effect" },
  smoke: { key: "smoke", name: "Smoked Hollow", cost: 30, type: "effect" }
}, {
  shopGroup: "consumables",
  purchaseScope: "session",
  duplicatePolicy: "allow",
  itemType: "effect"
});

const SOUNDS = defineShopItems({
  bell: { key: "bell", name: "Tavern Bell", cost: 20, type: "sound" },
  drums: { key: "drums", name: "War Drums", cost: 25, type: "sound" },
  chime: { key: "chime", name: "Arcane Chime", cost: 22, type: "sound" }
}, {
  shopGroup: "consumables",
  purchaseScope: "session",
  duplicatePolicy: "allow",
  itemType: "sound"
});

const TITLES = defineShopItems({
  "goblin-slayer": {
    key: "goblin-slayer",
    name: "Goblin Slayer",
    cost: 120,
    type: "title",
    titleType: "mechanical",
    passiveText: "+3% boss gold rewards.",
    description: "A scrappy hunter known for bringing back monster trophies."
  },
  "tavern-hero": {
    key: "tavern-hero",
    name: "Tavern Hero",
    cost: 100,
    type: "title",
    titleType: "cosmetic",
    passiveText: "Cosmetic only for now.",
    description: "A local favorite whose stories travel faster than the ale."
  },
  "shadow-walker": {
    key: "shadow-walker",
    name: "Shadow Walker",
    cost: 150,
    type: "title",
    titleType: "mechanical",
    passiveText: "+2% crit chance.",
    description: "A quiet stalker who knows when to strike from the dark."
  },
  "arcane-dabbler": {
    key: "arcane-dabbler",
    name: "Arcane Dabbler",
    cost: 140,
    type: "title",
    titleType: "mechanical",
    passiveText: "+1 spell damage.",
    description: "Not a master, but clever enough to turn sparks into trouble."
  },
  "gold-hoarder": {
    key: "gold-hoarder",
    name: "Gold Hoarder",
    cost: 170,
    type: "title",
    titleType: "mechanical",
    passiveText: "+4% shop discount.",
    description: "A relentless saver who always finds one more coin to keep."
  },
  archmage: {
    key: "archmage",
    name: "Archmage",
    cost: 300,
    type: "title",
    titleType: "mechanical",
    passiveText: "+1 spell damage.",
    description: "An old honor reserved for casters with proven command of the arcane."
  },
  shadowblade: {
    key: "shadowblade",
    name: "Shadowblade",
    cost: 350,
    type: "title",
    titleType: "mechanical",
    passiveText: "+4% crit chance.",
    description: "An assassin's honor, worn by duelists who end fights cleanly."
  },
  paladin: {
    key: "paladin",
    name: "Paladin",
    cost: 325,
    type: "title",
    titleType: "mechanical",
    passiveText: "+5% boss gold rewards.",
    description: "A radiant title for champions who bring prosperity home."
  },
  "dragon-rider": {
    key: "dragon-rider",
    name: "Dragon Rider",
    cost: 750,
    type: "title",
    titleType: "cosmetic",
    passiveText: "Cosmetic only for now.",
    description: "A legendary boast that needs no stat line to command attention."
  }
}, {
  shopGroup: "permanentUnlocks",
  purchaseScope: "persistent",
  duplicatePolicy: "owned-reactivate",
  unlockCollection: "titles",
  itemType: "title"
});

const XP_BOOSTS = defineShopItems({
  "xp-boost": { key: "xp-boost", name: "Guild XP Surge", cost: 75, multiplier: 2, durationMs: 10 * 60 * 1000, type: "xp" }
}, {
  shopGroup: "temporarySessionBoosts",
  purchaseScope: "session",
  duplicatePolicy: "allow",
  itemType: "xp"
});

const PROGRESSION_PERKS = defineShopItems({}, {
  shopGroup: "progressionPerks",
  purchaseScope: "persistent",
  duplicatePolicy: "owned-once",
  unlockCollection: "perks",
  itemType: "perk"
});

const SHOP_CATALOG = {
  permanentUnlocks: {
    classes: CLASSES,
    weapons: WEAPONS,
    titles: TITLES
  },
  gear: {
    weapons: GEAR_WEAPONS,
    armor: ARMOR,
    accessories: ACCESSORIES
  },
  temporarySessionBoosts: {
    xpBoosts: XP_BOOSTS
  },
  consumables: {
    summons: MONSTERS,
    effects: EFFECTS,
    sounds: SOUNDS
  },
  progressionPerks: PROGRESSION_PERKS
};

const SHOP_ITEMS = {
  ...CLASSES,
  ...WEAPONS,
  ...GEAR_WEAPONS,
  ...ARMOR,
  ...ACCESSORIES,
  ...MONSTERS,
  ...EFFECTS,
  ...SOUNDS,
  ...TITLES,
  ...XP_BOOSTS,
  ...PROGRESSION_PERKS
};

function normalizeKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function findShopItem(input) {
  const key = normalizeKey(input);
  return SHOP_ITEMS[key] || null;
}

module.exports = {
  SHOP_CATALOG,
  SHOP_ITEMS,
  CLASSES,
  WEAPONS,
  GEAR_WEAPONS,
  ARMOR,
  ACCESSORIES,
  MONSTERS,
  EFFECTS,
  SOUNDS,
  TITLES,
  XP_BOOSTS,
  PROGRESSION_PERKS,
  findShopItem,
  normalizeKey
};
