const QUEST_TEMPLATES = [
  {
    id: "q_clicks",
    title: "Tap {target} times",
    type: "clicks",
    baseTarget: 200,
    baseReward: { meat: 500 },
    targetGrowth: 1.5,
    rewardGrowth: 1.4
  },
  {
    id: "q_meat",
    title: "Get {target} meat",
    type: "meat",
    baseTarget: 50000,
    baseReward: { meat: 2500 },
    targetGrowth: 1.6,
    rewardGrowth: 1.5
  },
  {
    id: "q_buy",
    title: "Buy {target} dinos",
    type: "buy",
    baseTarget: 1,
    baseReward: { ferns: 1 },
    targetGrowth: 2,
    rewardGrowth: 1.6
  }
];

const SOCIAL_QUESTS = [
  {
    id: "social_tiktok",
    titleTemplate: "Follow us on TikTok",
    title: "Follow us on TikTok",
    type: "social",
    level: 1,
    target: 1,
    progress: 0,
    reward: { ferns: 1 },
    link: "https://www.tiktok.com/@example"
  },
  {
    id: "social_youtube",
    titleTemplate: "Subscribe to our YouTube channel",
    title: "Subscribe to our YouTube channel",
    type: "social",
    level: 1,
    target: 1,
    progress: 0,
    reward: { meat: 1000 },
    link: "https://www.youtube.com/channel/UCexample"
  },
  {
    id: "social_x",
    titleTemplate: "Follow us on X",
    title: "Follow us on X",
    type: "social",
    level: 1,
    target: 1,
    progress: 0,
    reward: { fortunePoints: 1 },
    link: "https://x.com/example"
  }
];

function computeQuestFromTemplate(template, level = 1) {
  const lvl = Math.max(1, Math.floor(level));
  const target = Math.ceil(template.baseTarget * Math.pow(template.targetGrowth, lvl - 1));
  const reward = {};

  for (const key of Object.keys(template.baseReward)) {
    const base = template.baseReward[key];
    const scaled = Math.floor(base * Math.pow(template.rewardGrowth, lvl - 1));
    reward[key] = Math.max(1, scaled);
  }

  return {
    id: template.id,
    titleTemplate: template.title,
    title: template.title.replace("{target}", target),
    type: template.type,
    level: lvl,
    target,
    progress: 0,
    reward
  };
}

function buildReferralCode(profileId = "") {
  const cleaned = String(profileId).replace(/[^a-z0-9]/gi, "").toUpperCase();
  const tail = cleaned.slice(-6).padStart(6, "X");
  return `DINO${tail}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCountMap(value) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, count]) => [key, Math.max(0, Math.floor(toNumber(count, 0)))])
  );
}

export function createDefaultGameState(profileId = "guest") {
  return {
    meat: 100,
    owned: { velociraptor: 1 },
    clickPower: 1,
    clickUpgrades: 0,
    ferns: 0,
    totalPurchases: 0,
    quests: QUEST_TEMPLATES.map((template) => computeQuestFromTemplate(template, 1)).concat(SOCIAL_QUESTS),
    fortunePoints: 1,
    freeSpins: 0,
    referralStats: { successfulInvites: 0, pendingInvites: 0 },
    userReferralCode: buildReferralCode(profileId)
  };
}

export function normalizeGameState(input, profileId = "guest") {
  const defaults = createDefaultGameState(profileId);
  if (!isRecord(input)) return defaults;

  return {
    ...defaults,
    ...input,
    meat: Math.max(0, toNumber(input.meat, defaults.meat)),
    clickPower: Math.max(1, Math.floor(toNumber(input.clickPower, defaults.clickPower))),
    clickUpgrades: Math.max(0, Math.floor(toNumber(input.clickUpgrades, defaults.clickUpgrades))),
    ferns: Math.max(0, toNumber(input.ferns, defaults.ferns)),
    totalPurchases: Math.max(0, Math.floor(toNumber(input.totalPurchases, defaults.totalPurchases))),
    fortunePoints: Math.max(0, Math.floor(toNumber(input.fortunePoints, defaults.fortunePoints))),
    freeSpins: Math.max(0, Math.floor(toNumber(input.freeSpins, defaults.freeSpins))),
    owned: {
      ...defaults.owned,
      ...toCountMap(input.owned)
    },
    quests: Array.isArray(input.quests) && input.quests.length > 0 ? input.quests : defaults.quests,
    referralStats: {
      successfulInvites: Math.max(
        0,
        Math.floor(toNumber(input.referralStats?.successfulInvites, defaults.referralStats.successfulInvites))
      ),
      pendingInvites: Math.max(
        0,
        Math.floor(toNumber(input.referralStats?.pendingInvites, defaults.referralStats.pendingInvites))
      )
    },
    userReferralCode:
      typeof input.userReferralCode === "string" && input.userReferralCode.trim()
        ? input.userReferralCode.trim()
        : defaults.userReferralCode
  };
}
