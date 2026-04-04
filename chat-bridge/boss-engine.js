const { MONSTERS } = require("./shop-config");

const THRESHOLDS = [0.75, 0.5, 0.25];

class BossEngine {
  constructor(options) {
    this.onBroadcast = options.onBroadcast;
    this.onAnnounce = options.onAnnounce;
    this.onDefeat = options.onDefeat;
    this.getActiveCount = options.getActiveCount;
    this.getCombatReadiness = options.getCombatReadiness || (() => ({
      activeCount: Math.max(1, Number(this.getActiveCount ? this.getActiveCount() : 1)),
      armedCount: 0,
      unarmedCount: 0
    }));
    this.spawnIntervalMs = Number(options.spawnIntervalMs || 10 * 60 * 1000);
    this.retreatMs = Number(options.retreatMs || 5 * 60 * 1000);

    this.activeBoss = null;
    this.spawnTimer = null;
    this.retreatTimer = null;
    this.nextSpawnAt = 0;
    this.spawning = false;
  }

  start() {
    this.scheduleSpawn(this.spawnIntervalMs);
  }

  stop() {
    if (this.spawnTimer) clearTimeout(this.spawnTimer);
    if (this.retreatTimer) clearTimeout(this.retreatTimer);
    this.spawnTimer = null;
    this.retreatTimer = null;
  }

  getState() {
    if (!this.activeBoss) {
      return {
        active: false,
        nextSpawnAt: this.nextSpawnAt
      };
    }

    return {
      active: true,
      bossKey: this.activeBoss.key,
      bossName: this.activeBoss.name,
      maxHp: this.activeBoss.maxHp,
      hp: this.activeBoss.hp,
      tier: this.activeBoss.tier,
      visual: this.activeBoss.visual,
      summonedBy: this.activeBoss.summonedBy,
      recentFighters: this.getRecentFighters(this.activeBoss),
      nextSpawnAt: 0
    };
  }

  scheduleSpawn(delayMs) {
    if (this.spawnTimer) clearTimeout(this.spawnTimer);

    const delay = Math.max(1000, Number(delayMs || this.spawnIntervalMs));
    this.nextSpawnAt = Date.now() + delay;

    this.onBroadcast({
      type: "boss_timer",
      nextSpawnAt: this.nextSpawnAt
    });

    this.spawnTimer = setTimeout(() => {
      this.spawnTimer = null;
      if (this.activeBoss || this.spawning) {
        this.scheduleSpawn(this.spawnIntervalMs);
        return;
      }
      this.spawnRandomBoss("system");
    }, delay);
  }

  spawnRandomBoss(sourceUser) {
    if (this.activeBoss || this.spawning) {
      return { ok: false, reason: "already-active" };
    }

    const readiness = this.getReadiness();
    const pool = this.getEligibleMonsters(readiness);
    if (!pool.length) {
      return { ok: false, reason: "no-eligible-boss" };
    }

    const picked = pool[Math.floor(Math.random() * pool.length)];
    return this.spawnBossByKey(picked.key, sourceUser);
  }

  spawnBossByKey(monsterKey, sourceUser) {
    if (this.activeBoss || this.spawning) {
      return { ok: false, reason: "already-active" };
    }

    const monster = MONSTERS[monsterKey];
    if (!monster) {
      return { ok: false, reason: "unknown-monster" };
    }

    const readiness = this.getReadiness();
    const minArmedCount = Math.max(0, Number(monster.minArmedCount || 0));
    if (readiness.armedCount < minArmedCount) {
      return { ok: false, reason: "not-ready", requiredArmed: minArmedCount };
    }

    const scaledHp = this.calculateScaledHp(monster, readiness);
    this.spawning = true;

    this.activeBoss = {
      key: monster.key,
      name: monster.name,
      tier: Number(monster.tier || 1),
      visual: monster.visual || null,
      maxHp: scaledHp,
      hp: scaledHp,
      summonedBy: sourceUser,
      thresholdTriggered: new Set(),
      damageByUser: new Map(),
      recentAttackers: new Map(),
      createdAt: Date.now(),
      lastActionAt: Date.now()
    };

    if (this.spawnTimer) {
      clearTimeout(this.spawnTimer);
      this.spawnTimer = null;
    }

    this.nextSpawnAt = 0;
    this.onBroadcast({
      type: "boss_spawn",
      boss: {
        key: this.activeBoss.key,
        name: this.activeBoss.name,
        tier: this.activeBoss.tier,
        visual: this.activeBoss.visual,
        maxHp: this.activeBoss.maxHp,
        hp: this.activeBoss.hp,
        summonedBy: sourceUser
      }
    });

    this.onAnnounce(`${this.activeBoss.name} has appeared. Use !attack, !spell, and class commands to fight.`);
    this.armRetreatTimer();
    this.spawning = false;

    return { ok: true, boss: this.activeBoss };
  }

  armRetreatTimer() {
    if (this.retreatTimer) clearTimeout(this.retreatTimer);

    this.retreatTimer = setTimeout(() => {
      if (!this.activeBoss) return;
      this.onBroadcast({
        type: "boss_retreat",
        bossName: this.activeBoss.name
      });
      this.onAnnounce(`${this.activeBoss.name} retreated into the dark.`);
      this.activeBoss = null;
      this.scheduleSpawn(this.spawnIntervalMs);
    }, this.retreatMs);
  }

  applyDamage(username, command, damageTotal, actorMeta = null) {
    if (!this.activeBoss) {
      return { ok: false, reason: "no-boss" };
    }

    const damage = Math.max(0, Number(damageTotal || 0));
    if (!damage) {
      return { ok: false, reason: "no-damage" };
    }

    const boss = this.activeBoss;
    boss.lastActionAt = Date.now();
    this.armRetreatTimer();

    const currentUserDamage = Number(boss.damageByUser.get(username) || 0) + damage;
    boss.damageByUser.set(username, currentUserDamage);
    boss.recentAttackers.set(String(username || "traveler").toLowerCase(), {
      username,
      className: actorMeta?.className || "peasant",
      weapon: actorMeta?.weapon || "",
      title: actorMeta?.title || "",
      command,
      damage,
      totalDamage: currentUserDamage,
      at: Date.now()
    });

    boss.hp = Math.max(0, boss.hp - damage);

    this.onBroadcast({
      type: "boss_damage",
      bossKey: boss.key,
      bossName: boss.name,
      hp: boss.hp,
      maxHp: boss.maxHp,
      by: username,
      command,
      damage,
      actor: actorMeta || null,
      recentFighters: this.getRecentFighters(boss)
    });

    this.processThresholds(boss);

    if (boss.hp <= 0) {
      const topDealer = [...boss.damageByUser.entries()].sort((a, b) => b[1] - a[1])[0] || null;
      const fighters = [...boss.damageByUser.entries()]
        .filter((entry) => entry[1] > 0)
        .map(([name, dealt]) => ({ name, dealt }));

      this.onBroadcast({
        type: "boss_defeat",
        bossKey: boss.key,
        bossName: boss.name,
        topDealer: topDealer ? topDealer[0] : "",
        fighters
      });

      if (this.onDefeat) {
        this.onDefeat({
          bossName: boss.name,
          fighters,
          topDealer: topDealer ? topDealer[0] : ""
        });
      }

      this.onAnnounce(`${boss.name} has fallen. Rewards have been distributed.`);
      this.activeBoss = null;
      this.scheduleSpawn(this.spawnIntervalMs);
      return { ok: true, defeated: true };
    }

    return {
      ok: true,
      defeated: false,
      hp: boss.hp,
      maxHp: boss.maxHp
    };
  }

  processThresholds(boss) {
    const hpRatio = boss.hp / boss.maxHp;

    for (const threshold of THRESHOLDS) {
      const key = String(threshold);
      if (hpRatio <= threshold && !boss.thresholdTriggered.has(key)) {
        boss.thresholdTriggered.add(key);
        this.onBroadcast({
          type: "boss_threshold",
          bossName: boss.name,
          threshold
        });
        this.onAnnounce(`${boss.name} enters a rage at ${Math.round(threshold * 100)}% HP.`);
      }
    }
  }

  getReadiness() {
    const readiness = this.getCombatReadiness ? this.getCombatReadiness() : null;
    const activeCount = Math.max(1, Number(readiness?.activeCount || this.getActiveCount()));
    const armedCount = Math.max(0, Number(readiness?.armedCount || 0));
    return {
      activeCount,
      armedCount,
      unarmedCount: Math.max(0, activeCount - armedCount)
    };
  }

  getEligibleMonsters(readiness) {
    const armedCount = Math.max(0, Number(readiness?.armedCount || 0));
    return Object.values(MONSTERS).filter((monster) => armedCount >= Math.max(0, Number(monster.minArmedCount || 0)));
  }

  calculateScaledHp(monster, readiness) {
    const activeCount = Math.max(1, Number(readiness?.activeCount || 1));
    const armedCount = Math.max(0, Number(readiness?.armedCount || 0));
    const unarmedCount = Math.max(0, activeCount - armedCount);

    // Armed players contribute higher scaling than unarmed players.
    const participationScale = armedCount * 40 + unarmedCount * 16;
    return Math.max(90, Math.round(Number(monster.baseHp || 0) + participationScale));
  }

  getRecentFighters(boss) {
    if (!boss?.recentAttackers) {
      return [];
    }

    return [...boss.recentAttackers.values()]
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
      .slice(0, 6)
      .map((entry) => ({
        username: entry.username,
        className: entry.className,
        weapon: entry.weapon,
        title: entry.title,
        command: entry.command,
        damage: entry.damage,
        totalDamage: entry.totalDamage
      }));
  }
}

module.exports = {
  BossEngine
};
