const PROGRESSION_RULES = {
  levelBaseXp: 100,
  levelStepXp: 35,
  attackBaseXpByCommand: {
    "!attack": 4,
    "!spell": 5,
    "!smite": 6
  },
  uniqueAttackBaseXp: 7,
  attackDamageDivisor: 4,
  attackDefeatBonusXp: 5,
  bossParticipationBaseXp: 10,
  bossParticipationDamageDivisor: 8,
  bossDefeatBonusXp: 12,
  topDealerBonusXp: 8
};

function normalizeTotalXp(totalXp) {
  return Math.max(0, Math.floor(Number(totalXp || 0)));
}

function getXpRequiredForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  return PROGRESSION_RULES.levelBaseXp + (safeLevel - 1) * PROGRESSION_RULES.levelStepXp;
}

function calculateProgression(totalXp) {
  const safeTotalXp = normalizeTotalXp(totalXp);
  let level = 1;
  let xpRemaining = safeTotalXp;
  let xpForNextLevel = getXpRequiredForLevel(level);

  while (xpRemaining >= xpForNextLevel) {
    xpRemaining -= xpForNextLevel;
    level += 1;
    xpForNextLevel = getXpRequiredForLevel(level);
  }

  return {
    totalXp: safeTotalXp,
    level,
    xpIntoLevel: xpRemaining,
    xpToNextLevel: xpForNextLevel
  };
}

function getCombatXpAward({ command, isUnique = false, damage = 0, defeated = false }) {
  const safeDamage = Math.max(0, Number(damage || 0));
  const baseXp = isUnique
    ? PROGRESSION_RULES.uniqueAttackBaseXp
    : Number(PROGRESSION_RULES.attackBaseXpByCommand[String(command || "").toLowerCase()] || PROGRESSION_RULES.attackBaseXpByCommand["!attack"]);

  let xpAward = baseXp + Math.floor(safeDamage / PROGRESSION_RULES.attackDamageDivisor);
  if (defeated) {
    xpAward += PROGRESSION_RULES.attackDefeatBonusXp;
  }

  return Math.max(1, xpAward);
}

function getBossParticipationXp({ damageDealt = 0, isTopDealer = false }) {
  const safeDamage = Math.max(0, Number(damageDealt || 0));
  let xpAward = PROGRESSION_RULES.bossParticipationBaseXp;
  xpAward += Math.floor(safeDamage / PROGRESSION_RULES.bossParticipationDamageDivisor);
  xpAward += PROGRESSION_RULES.bossDefeatBonusXp;

  if (isTopDealer) {
    xpAward += PROGRESSION_RULES.topDealerBonusXp;
  }

  return Math.max(1, xpAward);
}

module.exports = {
  PROGRESSION_RULES,
  calculateProgression,
  getXpRequiredForLevel,
  getCombatXpAward,
  getBossParticipationXp
};