const CLASSES = {
  peasant: {
    key: "peasant",
    name: "Peasant",
    cost: 0,
    attackDice: "1d6",
    spellDice: "1d4",
    uniqueCommand: "",
    uniqueDice: ""
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
  warlock: {
    key: "warlock",
    name: "Warlock",
    cost: 400,
    attackDice: "1d6+3",
    spellDice: "2d8+5",
    uniqueCommand: "!hex",
    uniqueDice: "2d6+7"
  }
};

const WEAPONS = {
  "iron-sword": { key: "iron-sword", name: "Iron Sword", cost: 50, attackDice: "1d6+2" },
  "blood-sword": { key: "blood-sword", name: "Blood Sword", cost: 250, attackDice: "1d4+20" },
  "storm-staff": { key: "storm-staff", name: "Storm Staff", cost: 180, attackDice: "2d6+3" },
  "shadow-dagger": { key: "shadow-dagger", name: "Shadow Dagger", cost: 200, attackDice: "2d4+5" },
  "holy-mace": { key: "holy-mace", name: "Holy Mace", cost: 220, attackDice: "1d8+8" },
  greatsword: { key: "greatsword", name: "Greatsword", cost: 300, attackDice: "2d8+4" },
  "frost-wand": { key: "frost-wand", name: "Frost Wand", cost: 275, attackDice: "1d10+6" },
  "elven-bow": { key: "elven-bow", name: "Elven Bow", cost: 200, attackDice: "3d4+2" }
};

const MONSTERS = {
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
};

const EFFECTS = {
  "ember-veil": { key: "ember-veil", name: "Ember Veil", cost: 35, type: "effect" },
  stormcall: { key: "stormcall", name: "Stormcall", cost: 45, type: "effect" },
  "rune-circle": { key: "rune-circle", name: "Rune Circle", cost: 40, type: "effect" },
  smoke: { key: "smoke", name: "Smoked Hollow", cost: 30, type: "effect" }
};

const SOUNDS = {
  bell: { key: "bell", name: "Tavern Bell", cost: 20, type: "sound" },
  drums: { key: "drums", name: "War Drums", cost: 25, type: "sound" },
  chime: { key: "chime", name: "Arcane Chime", cost: 22, type: "sound" }
};

const TITLES = {
  archmage: { key: "archmage", name: "Archmage", cost: 300, type: "title" },
  shadowblade: { key: "shadowblade", name: "Shadowblade", cost: 350, type: "title" },
  paladin: { key: "paladin", name: "Paladin", cost: 325, type: "title" },
  "dragon-rider": { key: "dragon-rider", name: "Dragon Rider", cost: 750, type: "title" }
};

const XP_BOOSTS = {
  "xp-boost": { key: "xp-boost", name: "Guild XP Surge", cost: 75, multiplier: 2, durationMs: 10 * 60 * 1000, type: "xp" }
};

function normalizeKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function findShopItem(input) {
  const key = normalizeKey(input);

  return (
    CLASSES[key] ||
    WEAPONS[key] ||
    MONSTERS[key] ||
    EFFECTS[key] ||
    SOUNDS[key] ||
    TITLES[key] ||
    XP_BOOSTS[key] ||
    null
  );
}

module.exports = {
  CLASSES,
  WEAPONS,
  MONSTERS,
  EFFECTS,
  SOUNDS,
  TITLES,
  XP_BOOSTS,
  findShopItem,
  normalizeKey
};
