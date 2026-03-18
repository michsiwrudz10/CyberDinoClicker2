import { DEFAULT_STAR_PRODUCTS } from "./game-content.mjs";
import { buildReferralCode, createInitialQuestState } from "./game-mechanics.mjs";

export const REFERRAL_MEAT_SHARE = 0.15;

export const SUCCESSFUL_REFERRAL_REWARD = Object.freeze({
  meat: 5000
});

export const INVITE_MILESTONES = Object.freeze([
  { id: "invite-1", target: 1, reward: { meat: 5000 } },
  { id: "invite-5", target: 5, reward: { ferns: 5 } },
  { id: "invite-10", target: 10, reward: { freeSpins: 10 } }
]);

export const INITIAL_REFERRAL_STATS = Object.freeze({
  successfulInvites: 0,
  pendingInvites: 0,
  claimedMilestones: []
});

export function createInitialInventory() {
  return {
    velociraptor: 1
  };
}

export function createInitialScalarState() {
  return {
    meat: 100,
    clickPower: 1,
    clickUpgrades: 0,
    ferns: 0,
    totalPurchases: 0,
    fortunePoints: 1,
    freeSpins: 0,
    spinIndex: 0,
    gems: 0,
    ticketPrice: 25,
    loyalVisitors: 0
  };
}

export function normalizeClaimedMilestones(value) {
  const allowed = new Set(INVITE_MILESTONES.map((milestone) => milestone.id));
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry)).filter((entry) => allowed.has(entry)))];
}

export function findInviteMilestone(questId) {
  return INVITE_MILESTONES.find((milestone) => milestone.id === questId) || null;
}

export function createInitialPlayerState() {
  return {
    ...createInitialScalarState(),
    owned: createInitialInventory(),
    quests: createInitialQuestState(),
    referralStats: { ...INITIAL_REFERRAL_STATS, claimedMilestones: [] },
    userReferralCode: buildReferralCode()
  };
}

export function cloneReward(reward = {}) {
  return {
    ...(reward.meat ? { meat: Number(reward.meat) } : {}),
    ...(reward.gems ? { gems: Number(reward.gems) } : {}),
    ...(reward.ferns ? { ferns: Number(reward.ferns) } : {}),
    ...(reward.freeSpins ? { freeSpins: Number(reward.freeSpins) } : {}),
    ...(reward.fortunePoints ? { fortunePoints: Number(reward.fortunePoints) } : {})
  };
}

export function getDefaultStarProducts() {
  return DEFAULT_STAR_PRODUCTS.map((product) => ({ ...product }));
}
