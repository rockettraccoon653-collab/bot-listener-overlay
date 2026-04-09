function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

const STAT_RULES = Object.freeze({
  strength: {
    label: "Strength",
    meaning: "Physical power and weapon pressure.",
    affectsNow: ["physical damage bonus"]
  },
  dexterity: {
    label: "Dexterity",
    meaning: "Precision, speed, and critical pressure.",
    affectsNow: ["crit chance"]
  },
  constitution: {
    label: "Constitution",
    meaning: "Durability, defense, and survivability.",
    affectsNow: [],
    futureHooks: ["incoming damage mitigation", "boss retaliation defense"]
  },
  intelligence: {
    label: "Intelligence",
    meaning: "Arcane output and technical scaling.",
    affectsNow: ["spell damage bonus"]
  },
  wisdom: {
    label: "Wisdom",
    meaning: "Battle sense, guidance, and utility gain.",
    affectsNow: ["combat XP bonus", "boss reward XP bonus"]
  },
  charisma: {
    label: "Charisma",
    meaning: "Influence, bargaining, and reward leverage.",
    affectsNow: ["shop discount", "boss gold bonus"]
  }
});

const EQUIPMENT_SLOT_RULES = Object.freeze({
  weapon: {
    label: "Weapon",
    affectsNow: ["damage bonus"],
    futureHooks: ["weapon tags", "status effects"]
  },
  armor: {
    label: "Armor",
    affectsNow: [],
    futureHooks: ["defense", "mitigation", "survivability thresholds"]
  },
  accessory: {
    label: "Accessory",
    affectsNow: [],
    futureHooks: ["utility modifiers", "cooldown tweaks", "special triggers"]
  }
});

const CLASS_RULES = Object.freeze({
  peasant: {
    key: "peasant",
    name: "Peasant",
    role: "Novice",
    fantasy: "A fresh recruit with no specialized training yet.",
    coreStat: "constitution",
    passiveLabel: "No Specialty",
    passiveText: "No class bonus yet.",
    combatImpactNow: "No extra class scaling.",
    rewardImpactNow: "No extra reward bonus.",
    shopImpactNow: "No extra discount.",
    uniqueMode: "physical",
    bonuses: {}
  },
  warrior: {
    key: "warrior",
    name: "Warrior",
    role: "Frontline bruiser",
    fantasy: "A reliable melee combatant who wins by steady pressure.",
    coreStat: "strength",
    passiveLabel: "Heavy Swing",
    passiveText: "+2 physical damage on attacks and physical class skills.",
    combatImpactNow: "+2 physical damage.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "physical",
    bonuses: { physicalFlat: 2 }
  },
  fighter: {
    key: "fighter",
    name: "Fighter",
    role: "Weapon specialist",
    fantasy: "A disciplined veteran who hits harder with direct weapon attacks.",
    coreStat: "strength",
    passiveLabel: "Combat Drills",
    passiveText: "+2 physical damage on attacks and physical class skills.",
    combatImpactNow: "+2 physical damage.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "physical",
    bonuses: { physicalFlat: 2 }
  },
  rogue: {
    key: "rogue",
    name: "Rogue",
    role: "Burst striker",
    fantasy: "A fast opportunist who spikes damage through precision.",
    coreStat: "dexterity",
    passiveLabel: "Keen Edge",
    passiveText: "+8% crit chance on combat actions.",
    combatImpactNow: "+8% crit chance.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "physical",
    bonuses: { critChance: 0.08 }
  },
  mage: {
    key: "mage",
    name: "Mage",
    role: "Arcane caster",
    fantasy: "A ranged spellcaster who converts intellect into raw damage.",
    coreStat: "intelligence",
    passiveLabel: "Arcane Focus",
    passiveText: "+3 spell damage.",
    combatImpactNow: "+3 spell damage.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "spell",
    bonuses: { spellFlat: 3 }
  },
  cleric: {
    key: "cleric",
    name: "Cleric",
    role: "Support caster",
    fantasy: "A steady holy guide who converts wisdom into growth.",
    coreStat: "wisdom",
    passiveLabel: "Guiding Prayer",
    passiveText: "+10% combat and boss XP rewards.",
    combatImpactNow: "+10% XP gain.",
    rewardImpactNow: "+10% XP gain from boss rewards.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "spell",
    bonuses: { xpMultiplier: 0.1, spellFlat: 1 }
  },
  ranger: {
    key: "ranger",
    name: "Ranger",
    role: "Precision hunter",
    fantasy: "A ranged skirmisher who combines accuracy with weapon pressure.",
    coreStat: "dexterity",
    passiveLabel: "Marked Shot",
    passiveText: "+1 weapon damage and +4% crit chance.",
    combatImpactNow: "+1 physical damage and +4% crit chance.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "physical",
    bonuses: { physicalFlat: 1, critChance: 0.04 }
  },
  bard: {
    key: "bard",
    name: "Bard",
    role: "Utility support",
    fantasy: "A clever talker who smooths costs and boosts the party economy.",
    coreStat: "charisma",
    passiveLabel: "Silver Tongue",
    passiveText: "+5% shop discount.",
    combatImpactNow: "No direct combat bonus.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "+5% shop discount.",
    uniqueMode: "spell",
    bonuses: { shopDiscount: 0.05 }
  },
  barbarian: {
    key: "barbarian",
    name: "Barbarian",
    role: "Ferocious bruiser",
    fantasy: "A reckless brawler who turns raw strength into burst damage.",
    coreStat: "strength",
    passiveLabel: "Savage Blows",
    passiveText: "+3 physical damage.",
    combatImpactNow: "+3 physical damage.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "physical",
    bonuses: { physicalFlat: 3 }
  },
  druid: {
    key: "druid",
    name: "Druid",
    role: "Nature caster",
    fantasy: "A flexible mystic with steady spell pressure and wise growth.",
    coreStat: "wisdom",
    passiveLabel: "Natural Insight",
    passiveText: "+2 spell damage and +5% XP gain.",
    combatImpactNow: "+2 spell damage.",
    rewardImpactNow: "+5% XP gain.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "spell",
    bonuses: { spellFlat: 2, xpMultiplier: 0.05 }
  },
  paladin: {
    key: "paladin",
    name: "Paladin",
    role: "Holy vanguard",
    fantasy: "A radiant champion who turns conviction into better rewards.",
    coreStat: "constitution",
    passiveLabel: "Sacred Duty",
    passiveText: "+1 physical damage and +5% boss gold rewards.",
    combatImpactNow: "+1 physical damage.",
    rewardImpactNow: "+5% boss gold rewards.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "physical",
    bonuses: { physicalFlat: 1, goldMultiplier: 0.05, smiteFlat: 2 }
  },
  warlock: {
    key: "warlock",
    name: "Warlock",
    role: "Dark caster",
    fantasy: "A risky spell duelist who pushes volatile magic harder.",
    coreStat: "intelligence",
    passiveLabel: "Hexcraft",
    passiveText: "+3 spell damage and +3% crit chance.",
    combatImpactNow: "+3 spell damage and +3% crit chance.",
    rewardImpactNow: "No direct reward bonus.",
    shopImpactNow: "No shop modifier.",
    uniqueMode: "spell",
    bonuses: { spellFlat: 3, critChance: 0.03 }
  }
});

const TITLE_RULES = Object.freeze({
  "goblin-slayer": {
    key: "goblin-slayer",
    name: "Goblin Slayer",
    type: "mechanical",
    passiveText: "+3% boss gold rewards.",
    bonuses: { goldMultiplier: 0.03 }
  },
  "tavern-hero": {
    key: "tavern-hero",
    name: "Tavern Hero",
    type: "cosmetic",
    passiveText: "Cosmetic only for now.",
    bonuses: {}
  },
  "shadow-walker": {
    key: "shadow-walker",
    name: "Shadow Walker",
    type: "mechanical",
    passiveText: "+2% crit chance.",
    bonuses: { critChance: 0.02 }
  },
  "arcane-dabbler": {
    key: "arcane-dabbler",
    name: "Arcane Dabbler",
    type: "mechanical",
    passiveText: "+1 spell damage.",
    bonuses: { spellFlat: 1 }
  },
  "gold-hoarder": {
    key: "gold-hoarder",
    name: "Gold Hoarder",
    type: "mechanical",
    passiveText: "+4% shop discount.",
    bonuses: { shopDiscount: 0.04 }
  },
  archmage: {
    key: "archmage",
    name: "Archmage",
    type: "mechanical",
    passiveText: "+1 spell damage.",
    bonuses: { spellFlat: 1 }
  },
  shadowblade: {
    key: "shadowblade",
    name: "Shadowblade",
    type: "mechanical",
    passiveText: "+4% crit chance.",
    bonuses: { critChance: 0.04 }
  },
  paladin: {
    key: "paladin",
    name: "Paladin",
    type: "mechanical",
    passiveText: "+5% boss gold rewards.",
    bonuses: { goldMultiplier: 0.05 }
  },
  "dragon-rider": {
    key: "dragon-rider",
    name: "Dragon Rider",
    type: "cosmetic",
    passiveText: "Cosmetic only for now.",
    bonuses: {}
  }
});

const WEAPON_RULES = Object.freeze({
  "basic-sword": { physicalFlat: 1 },
  "iron-sword": { physicalFlat: 1 },
  "blood-sword": { physicalFlat: 3 },
  "rogue-dagger": { physicalFlat: 1, critChance: 0.02 },
  "storm-staff": { spellFlat: 2 },
  "mage-focus": { spellFlat: 1 },
  "shadow-dagger": { physicalFlat: 1, critChance: 0.03 },
  "holy-mace": { physicalFlat: 1, smiteFlat: 2 },
  greatsword: { physicalFlat: 3 },
  "frost-wand": { spellFlat: 2 },
  "elven-bow": { physicalFlat: 2, critChance: 0.02 }
});

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getViewerStats(viewer) {
  const stats = viewer?.stats || {};
  return {
    strength: Number(stats.strength || 10),
    dexterity: Number(stats.dexterity || 10),
    constitution: Number(stats.constitution || 10),
    intelligence: Number(stats.intelligence || 10),
    wisdom: Number(stats.wisdom || 10),
    charisma: Number(stats.charisma || 10)
  };
}

function getStatBonuses(viewer) {
  const stats = getViewerStats(viewer);
  return {
    strengthPhysicalFlat: Math.max(0, Math.floor((stats.strength - 10) / 4)),
    dexterityCritChance: clampNumber(Math.max(0, stats.dexterity - 10) * 0.01, 0, 0.12),
    constitutionGuard: Math.max(0, Math.floor((stats.constitution - 10) / 4)),
    intelligenceSpellFlat: Math.max(0, Math.floor((stats.intelligence - 10) / 4)),
    wisdomXpMultiplier: clampNumber(Math.max(0, Math.floor((stats.wisdom - 10) / 2)) * 0.02, 0, 0.14),
    charismaShopDiscount: clampNumber(Math.max(0, Math.floor((stats.charisma - 10) / 2)) * 0.01, 0, 0.12),
    charismaGoldMultiplier: clampNumber(Math.max(0, Math.floor((stats.charisma - 10) / 2)) * 0.015, 0, 0.18)
  };
}

function getClassRule(classKey) {
  return CLASS_RULES[normalizeKey(classKey)] || CLASS_RULES.peasant;
}

function getActiveClasses(viewer, classKey = "") {
  const explicitPrimary = normalizeKey(classKey);
  const storedPrimary = normalizeKey(
    explicitPrimary
      || viewer?.activeClassPrimary
      || viewer?.classData?.activeClassPrimary
      || viewer?.classData?.activeClass
      || viewer?.className
      || "peasant"
  ) || "peasant";
  const storedSecondary = normalizeKey(
    viewer?.activeClassSecondary
      || viewer?.classData?.activeClassSecondary
      || ""
  );

  return {
    primary: storedPrimary,
    secondary: storedSecondary && storedSecondary !== storedPrimary ? storedSecondary : ""
  };
}

function scaleBonuses(bonuses = {}, scale = 1) {
  return {
    physicalFlat: Number(bonuses.physicalFlat || 0) * scale,
    spellFlat: Number(bonuses.spellFlat || 0) * scale,
    smiteFlat: Number(bonuses.smiteFlat || 0) * scale,
    critChance: Number(bonuses.critChance || 0) * scale,
    xpMultiplier: Number(bonuses.xpMultiplier || 0) * scale,
    goldMultiplier: Number(bonuses.goldMultiplier || 0) * scale,
    shopDiscount: Number(bonuses.shopDiscount || 0) * scale
  };
}

function getCombinedClassBonuses(viewer, classKey = "") {
  const activeClasses = getActiveClasses(viewer, classKey);
  const primaryRule = getClassRule(activeClasses.primary);
  const secondaryRule = activeClasses.secondary ? getClassRule(activeClasses.secondary) : CLASS_RULES.peasant;
  const primaryBonuses = scaleBonuses(primaryRule.bonuses, 1);
  const secondaryBonuses = scaleBonuses(secondaryRule.bonuses, activeClasses.secondary ? 0.5 : 0);

  return {
    activeClasses,
    primaryRule,
    secondaryRule: activeClasses.secondary ? secondaryRule : null,
    bonuses: {
      physicalFlat: primaryBonuses.physicalFlat + secondaryBonuses.physicalFlat,
      spellFlat: primaryBonuses.spellFlat + secondaryBonuses.spellFlat,
      smiteFlat: primaryBonuses.smiteFlat + secondaryBonuses.smiteFlat,
      critChance: primaryBonuses.critChance + secondaryBonuses.critChance,
      xpMultiplier: primaryBonuses.xpMultiplier + secondaryBonuses.xpMultiplier,
      goldMultiplier: primaryBonuses.goldMultiplier + secondaryBonuses.goldMultiplier,
      shopDiscount: primaryBonuses.shopDiscount + secondaryBonuses.shopDiscount
    }
  };
}

function getTitleRule(activeTitle) {
  const key = normalizeKey(activeTitle);
  return TITLE_RULES[key] || null;
}

function getWeaponRule(weaponKey) {
  return WEAPON_RULES[normalizeKey(weaponKey)] || {};
}

function getEquippedInventoryItem(viewer, slot) {
  const safeSlot = normalizeKey(slot);
  const equippedKey = normalizeKey(viewer?.equipment?.[safeSlot] || viewer?.[safeSlot] || "");
  if (!equippedKey) {
    return null;
  }

  const inventory = Array.isArray(viewer?.inventory) ? viewer.inventory : [];
  return inventory.find((entry) => normalizeKey(entry?.itemId || entry?.id || entry?.key) === equippedKey && normalizeKey(entry?.category) === safeSlot) || null;
}

function getEquippedItemBonuses(viewer) {
  const weaponItem = getEquippedInventoryItem(viewer, "weapon");
  const armorItem = getEquippedInventoryItem(viewer, "armor");
  const accessoryItem = getEquippedInventoryItem(viewer, "accessory");

  const merged = {
    physicalFlat: 0,
    spellFlat: 0,
    smiteFlat: 0,
    critChance: 0,
    xpMultiplier: 0,
    goldMultiplier: 0,
    shopDiscount: 0,
    constitutionGuard: 0
  };

  const sources = [
    getWeaponRule(viewer?.weapon),
    weaponItem?.statBonuses || {},
    armorItem?.statBonuses || {},
    accessoryItem?.statBonuses || {}
  ];

  for (const source of sources) {
    merged.physicalFlat += Number(source.physicalFlat || 0);
    merged.spellFlat += Number(source.spellFlat || 0);
    merged.smiteFlat += Number(source.smiteFlat || 0);
    merged.critChance += Number(source.critChance || 0);
    merged.xpMultiplier += Number(source.xpMultiplier || 0);
    merged.goldMultiplier += Number(source.goldMultiplier || 0);
    merged.shopDiscount += Number(source.shopDiscount || 0);
    merged.constitutionGuard += Number(source.constitutionGuard || 0);
  }

  return merged;
}

function getAttackMode({ command, classRule, isUnique = false }) {
  if (String(command || "").toLowerCase() === "!spell") {
    return "spell";
  }

  if (String(command || "").toLowerCase() === "!smite") {
    return "smite";
  }

  if (isUnique) {
    return classRule.uniqueMode || "physical";
  }

  return "physical";
}

function resolveCombatModifiers({ viewer, command, isUnique = false, classKey = "", weaponKey = "", activeTitle = "", baseDamage = 0 }) {
  const classBonuses = getCombinedClassBonuses(viewer, classKey);
  const classRule = classBonuses.primaryRule;
  const titleRule = getTitleRule(activeTitle || viewer?.title);
  const statBonuses = getStatBonuses(viewer);
  const equippedItemBonuses = getEquippedItemBonuses({
    ...viewer,
    weapon: weaponKey || viewer?.weapon || ""
  });
  const mode = getAttackMode({ command, classRule, isUnique });

  let flatBonus = 0;
  if (mode === "spell") {
    flatBonus += statBonuses.intelligenceSpellFlat;
    flatBonus += Number(classBonuses.bonuses.spellFlat || 0);
    flatBonus += Number(titleRule?.bonuses?.spellFlat || 0);
    flatBonus += Number(equippedItemBonuses.spellFlat || 0);
  } else {
    flatBonus += statBonuses.strengthPhysicalFlat;
    flatBonus += Number(classBonuses.bonuses.physicalFlat || 0);
    flatBonus += Number(titleRule?.bonuses?.physicalFlat || 0);
    flatBonus += Number(equippedItemBonuses.physicalFlat || 0);
    if (mode === "smite") {
      flatBonus += Number(classBonuses.bonuses.smiteFlat || 0);
      flatBonus += Number(titleRule?.bonuses?.smiteFlat || 0);
      flatBonus += Number(equippedItemBonuses.smiteFlat || 0);
    }
  }

  const critChance = clampNumber(
    statBonuses.dexterityCritChance
      + Number(classBonuses.bonuses.critChance || 0)
      + Number(titleRule?.bonuses?.critChance || 0)
      + Number(equippedItemBonuses.critChance || 0),
    0,
    0.35
  );

  const critMultiplier = 1.5;
  const wasCrit = Math.random() < critChance;
  const scaledBaseDamage = Math.max(1, Number(baseDamage || 0) + flatBonus);
  const finalDamage = Math.max(1, Math.floor(scaledBaseDamage * (wasCrit ? critMultiplier : 1)));

  return {
    mode,
    classRule,
    secondaryClassRule: classBonuses.secondaryRule,
    activeClasses: classBonuses.activeClasses,
    titleRule,
    statBonuses,
    equippedItemBonuses,
    flatBonus,
    critChance,
    critMultiplier,
    wasCrit,
    baseDamage: Number(baseDamage || 0),
    finalDamage
  };
}

function applyXpRewardRules({ viewer, baseXp = 0, classKey = "", activeTitle = "" }) {
  const classBonuses = getCombinedClassBonuses(viewer, classKey);
  const titleRule = getTitleRule(activeTitle || viewer?.title);
  const statBonuses = getStatBonuses(viewer);
  const equippedItemBonuses = getEquippedItemBonuses(viewer);

  const multiplier = 1
    + statBonuses.wisdomXpMultiplier
    + Number(classBonuses.bonuses.xpMultiplier || 0)
    + Number(titleRule?.bonuses?.xpMultiplier || 0)
    + Number(equippedItemBonuses.xpMultiplier || 0);

  return Math.max(1, Math.floor(Number(baseXp || 0) * multiplier));
}

function applyGoldRewardRules({ viewer, baseGold = 0, classKey = "", activeTitle = "" }) {
  const classBonuses = getCombinedClassBonuses(viewer, classKey);
  const titleRule = getTitleRule(activeTitle || viewer?.title);
  const statBonuses = getStatBonuses(viewer);
  const equippedItemBonuses = getEquippedItemBonuses(viewer);

  const multiplier = 1
    + statBonuses.charismaGoldMultiplier
    + Number(classBonuses.bonuses.goldMultiplier || 0)
    + Number(titleRule?.bonuses?.goldMultiplier || 0)
    + Number(equippedItemBonuses.goldMultiplier || 0);

  return Math.max(1, Math.floor(Number(baseGold || 0) * multiplier));
}

function getEffectiveShopCost({ viewer, item, baseCost }) {
  const cost = Math.max(0, Number(baseCost ?? item?.cost ?? 0));
  const classBonuses = getCombinedClassBonuses(viewer);
  const titleRule = getTitleRule(viewer?.title);
  const statBonuses = getStatBonuses(viewer);
  const equippedItemBonuses = getEquippedItemBonuses(viewer);
  const discountRate = clampNumber(
    statBonuses.charismaShopDiscount
      + Number(classBonuses.bonuses.shopDiscount || 0)
      + Number(titleRule?.bonuses?.shopDiscount || 0)
      + Number(equippedItemBonuses.shopDiscount || 0),
    0,
    0.25
  );

  return {
    baseCost: cost,
    discountRate,
    finalCost: Math.max(0, Math.floor(cost * (1 - discountRate)))
  };
}

function describePlayerRole(viewer) {
  const classBonuses = getCombinedClassBonuses(viewer);
  const classRule = classBonuses.primaryRule;
  const titleRule = getTitleRule(viewer?.title);
  return {
    className: classRule.name,
    secondaryClassName: classBonuses.secondaryRule?.name || "",
    role: classRule.role,
    coreStat: classRule.coreStat,
    passiveText: classRule.passiveText,
    titleText: titleRule ? titleRule.passiveText : "No active title bonus."
  };
}

module.exports = {
  STAT_RULES,
  CLASS_RULES,
  TITLE_RULES,
  EQUIPMENT_SLOT_RULES,
  getClassRule,
  getActiveClasses,
  getTitleRule,
  getStatBonuses,
  resolveCombatModifiers,
  applyXpRewardRules,
  applyGoldRewardRules,
  getEffectiveShopCost,
  describePlayerRole
};