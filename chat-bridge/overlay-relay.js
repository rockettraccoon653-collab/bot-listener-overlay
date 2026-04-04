function toOverlayRelayEvents(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (payload.type === "boss_spawn") {
    return [{
      type: "boss_update",
      event: "spawn",
      boss: {
        key: payload.boss?.key || "",
        name: payload.boss?.name || "Unknown Boss",
        tier: Number(payload.boss?.tier || 1),
        visual: payload.boss?.visual || null,
        hp: Number(payload.boss?.hp || 0),
        maxHp: Number(payload.boss?.maxHp || 0),
        summonedBy: payload.boss?.summonedBy || "",
        recentFighters: []
      }
    }];
  }

  if (payload.type === "boss_damage") {
    return [{
      type: "boss_update",
      event: "damage",
      boss: {
        key: payload.bossKey || "",
        name: payload.bossName || "Unknown Boss",
        hp: Number(payload.hp || 0),
        maxHp: Number(payload.maxHp || 0),
        recentFighters: Array.isArray(payload.recentFighters) ? payload.recentFighters : []
      },
      lastAttack: {
        by: payload.by || "",
        command: payload.command || "",
        damage: Number(payload.damage || 0),
        actor: payload.actor || null
      }
    }];
  }

  if (payload.type === "boss_threshold") {
    return [{
      type: "boss_update",
      event: "threshold",
      boss: {
        name: payload.bossName || "Unknown Boss"
      },
      threshold: Number(payload.threshold || 0)
    }];
  }

  if (payload.type === "boss_defeat") {
    return [{
      type: "boss_update",
      event: "defeat",
      boss: {
        key: payload.bossKey || "",
        name: payload.bossName || "Boss"
      },
      topDealer: payload.topDealer || "",
      fighters: Array.isArray(payload.fighters) ? payload.fighters : []
    }];
  }

  if (payload.type === "boss_retreat") {
    return [{
      type: "boss_update",
      event: "retreat",
      boss: {
        name: payload.bossName || "Boss"
      }
    }];
  }

  if (payload.type === "boss_attack_result") {
    return [{
      type: "attack",
      by: payload.by || "",
      command: payload.command || "",
      notation: payload.notation || "",
      damage: Number(payload.damage || 0),
      hpText: payload.hpText || ""
    }];
  }

  if (payload.type === "shop_purchase") {
    return [{
      type: "shop",
      by: payload.by || "",
      itemType: payload.itemType || "",
      itemName: payload.itemName || ""
    }];
  }

  return [payload];
}

module.exports = {
  toOverlayRelayEvents
};