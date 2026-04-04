const overlayConfig = {
  xpPerEvent: {
    follow: 10,
    sub: 25,
    giftedSub: 35,
    raid: 50,
    cheer: 15,
    donation: 40
  },

  eventText: {
    follow: {
      title: "A New Traveler Enters the Tavern",
      message: "{user} has answered the call."
    },
    sub: {
      title: "A Patron Joins the Guild",
      message: "{user} has pledged their support."
    },
    giftedSub: {
      title: "A Benefactor Equips the Party",
      message: "{user} has gifted strength to the guild."
    },
    raid: {
      title: "Reinforcements Have Arrived",
      message: "{user} leads a raid into the hall."
    },
    cheer: {
      title: "Gold Hits the Table",
      message: "{user} has scattered bits across the tavern."
    },
    donation: {
      title: "Treasure Has Been Offered",
      message: "{user} has funded the quest."
    }
  },

  /*
    Chat participation leveling controls.
    Tune these values to adjust pacing, anti-spam strictness, and XP gains.
  */
  chatParticipation: {
    enabled: true,

    // Transport mode: auto, local, or twitch.
    transportMode: "auto",

    // Local OBS chat socket relay from chat-bridge (ws://127.0.0.1:8787 by default).
    localWsEnabled: true,
    localWsUrl: "ws://127.0.0.1:8787",

    // Optional hosted-mode validation for Twitch Extension auth.
    expectedChannelId: "",
    authTimeoutMs: 12000,

    // Mark the transport as stale if no payload arrives in this window.
    staleAfterMs: 45000,

    // Count one valid message per user at most once per cooldown window.
    messageCooldownMs: 120000,

    // Award base XP every N valid messages from a user.
    messagesPerReward: 1,
    xpPerReward: 6,

    // Anti-spam gates.
    minMessageLength: 6,
    minWordCount: 2,
    minUniqueChars: 4,
    maxRepeatedCharRatio: 0.55,

    // One-time milestone bonuses per user at these valid message counts.
    milestoneBonuses: {
      25: 18,
      50: 38,
      100: 85
    },

    // Themed milestone notification pool.
    milestoneNotifications: [
      "A Familiar Voice Rises in the Tavern",
      "Guild Presence Strengthens",
      "The Hall Grows Louder"
    ]
  },

  /*
    Questline system shown in the top-left overlay panel.
    - target: amount required for completion
    - rewardXP: XP granted on completion
    - track keys:
      chat.valid            => valid anti-spam-approved chat messages
      event.follow/sub/...  => specific event types from triggerEvent
      event.any             => any event from triggerEvent
  */
  questline: {
    enabled: true,
    loopQuests: true,
    quests: [
      {
        id: "tavern-voices",
        title: "Voices of the Tavern",
        objective: "Gather 8 valid chat calls.",
        target: 8,
        rewardXP: 16,
        track: {
          "chat.valid": 1
        }
      },
      {
        id: "guild-attention",
        title: "Eyes on the Guild",
        objective: "Call in 3 follows or subs.",
        target: 3,
        rewardXP: 24,
        track: {
          "event.follow": 1,
          "event.sub": 1
        }
      },
      {
        id: "hall-eruption",
        title: "Hall Eruption",
        objective: "Trigger 5 major guild events.",
        target: 5,
        rewardXP: 32,
        track: {
          "event.follow": 1,
          "event.sub": 1,
          "event.raid": 1,
          "event.cheer": 1
        }
      }
    ]
  },

  /*
    Scene-aware overlay behavior.
    - Just Chatting: show full UI
    - Game Screen: hide Current Quest + Questline by default
    - !quest [seconds] command can temporarily show questline in game scene
  */
  sceneControl: {
    enabled: true,
    justChattingSceneName: "Just Chatting",
    gameSceneName: "Game Screen",
    questlineRevealCommand: "!quest",
    questlineRevealDurationMs: 30000,
    minRevealDurationMs: 10000,
    maxRevealDurationMs: 180000,
    gameEventsPanelOpacity: 0.38,
    gameEventsRevealDurationMs: 8000
  }
};