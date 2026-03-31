function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function parseDiceNotation(notation) {
  const text = String(notation || "").trim().toLowerCase();
  const match = text.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) {
    const asNum = Number(text);
    if (Number.isFinite(asNum)) {
      return { count: 0, sides: 0, mod: asNum };
    }

    return null;
  }

  return {
    count: Number(match[1]),
    sides: Number(match[2]),
    mod: Number(match[3] || 0)
  };
}

function rollDice(notation) {
  const parsed = parseDiceNotation(notation);
  if (!parsed) {
    return { notation: String(notation || "0"), rolls: [], total: 0 };
  }

  const rolls = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(rollDie(parsed.sides));
  }

  const rollSum = rolls.reduce((sum, value) => sum + value, 0);
  const total = Math.max(0, rollSum + parsed.mod);

  return {
    notation: String(notation || "0"),
    rolls,
    mod: parsed.mod,
    total
  };
}

module.exports = {
  rollDice
};
