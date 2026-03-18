import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AD_BOOST_DURATION_SECONDS,
  AD_BOOST_MULTIPLIER,
  AD_FORTUNE_BONUS_WINDOW_SECONDS,
  AD_FORTUNE_MEAT_BONUS_PRODUCT_ID,
  AD_FORTUNE_MEAT_MULTIPLIER,
  AD_GEMS_BOOST_PRODUCT_ID,
  AD_LOYAL_VISITORS_BOOST_PRODUCT_ID,
  AD_MEAT_BOOST_PRODUCT_ID,
  AD_SPIN_PRODUCT_ID,
  DEFAULT_STORE_PRODUCTS,
  DINO_DEFS,
  DINO_GENE_DEFS,
  DINO_GENOTYPE_DEFS,
  ELITE_PASS_PRODUCT_ID,
  HATCHERY_UNLOCK_COST_GEMS,
  LABORATORY_UNLOCK_COST_GEMS,
  MAGIC_BIRD_COOLDOWN_SECONDS,
  MARKET_ROUTE_DEFS,
  STARTER_OFFER_PRODUCT_ID,
  STAR_MEAT_HOURS_MINIMUM
} from "../../shared/game-content.mjs";
import {
  advanceLoyalVisitors,
  buildHybridId,
  buildHybridName,
  buildDinoCollection,
  buildReferralCode,
  buildSeasonPassState,
  computeProductionBreakdown,
  computeZooEconomyStats,
  computeProductionPerSecond,
  computeQuestFromTemplate,
  createInitialQuestState,
  getClickUpgradePrice,
  getDinoById,
  getDinoGeneById,
  getDinoGenotypeById,
  getDinoTraitProfile,
  getDinoPrice,
  getEggIncubationDurationSeconds,
  getEggIncubationMeta,
  getLabEggPrice,
  getPromotionById,
  getPromotionPrice,
  getQuestTemplateById,
  getTraitPriceForDino,
  getSpinReward,
  getTicketAttractivenessMultiplier,
  getUniqueDinoPrice,
  getBreedingCost,
  normalizeLabProjects,
  normalizeModifiedDinos,
  normalizeDinoGenes,
  isUniqueDinoId
} from "../../shared/game-mechanics.mjs";
import {
  INITIAL_REFERRAL_STATS,
  REFERRAL_MEAT_SHARE,
  SUCCESSFUL_REFERRAL_REWARD,
  cloneReward,
  createInitialInventory,
  createInitialScalarState,
  findInviteMilestone,
  normalizeClaimedMilestones
} from "../../shared/game-state.mjs";

const DEFAULT_LIMIT = 50;
const CONTINUOUS_CLICK_BREAK_SECONDS = 10;
const CONTINUOUS_CLICK_FLAG_SECONDS = 35 * 60;
const MAX_PASSIVE_SECONDS = 3 * 60 * 60;
const QUEST_MEAT_REWARD_SECONDS = 5 * 60;

function parseTimestampMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function createInitialAntiCheatState() {
  return {
    clickChainStartedAt: null,
    lastClickAt: null,
    suspiciousClickFlaggedAt: null,
    suspiciousClickChainSeconds: 0
  };
}

function normalizeAntiCheatState(state = {}) {
  return {
    clickChainStartedAt: state.clickChainStartedAt || null,
    lastClickAt: state.lastClickAt || null,
    suspiciousClickFlaggedAt: state.suspiciousClickFlaggedAt || null,
    suspiciousClickChainSeconds: clampInteger(state.suspiciousClickChainSeconds, 0)
  };
}

function normalizeTimedBoost(value = {}, fallbackMultiplier = 1) {
  return {
    multiplier: Math.max(1, toFiniteNumber(value?.multiplier, fallbackMultiplier)),
    activeUntil: value?.activeUntil || null
  };
}

function normalizeAdBoosts(value = {}) {
  const raw = typeof value === "string" ? parseJson(value, {}) : value;
  return {
    meat: normalizeTimedBoost(raw?.meat, 1),
    gems: normalizeTimedBoost(raw?.gems, 1),
    loyalVisitors: normalizeTimedBoost(raw?.loyalVisitors, 1)
  };
}

function serializeAdBoosts(value = {}) {
  return JSON.stringify(normalizeAdBoosts(value));
}

function normalizePendingAdBonus(value = {}) {
  const raw = typeof value === "string" ? parseJson(value, {}) : value;
  return {
    productId: String(raw?.productId || ""),
    rewardId: String(raw?.rewardId || ""),
    baseMeat: Math.max(0, toFiniteNumber(raw?.baseMeat, 0)),
    multiplier: Math.max(1, toFiniteNumber(raw?.multiplier, 1)),
    expiresAt: raw?.expiresAt || null,
    sourceSpinIndex: clampInteger(raw?.sourceSpinIndex, 0)
  };
}

function serializePendingAdBonus(value = {}) {
  return JSON.stringify(normalizePendingAdBonus(value));
}

function isTimestampActive(value, stamp = nowIso()) {
  const targetMs = parseTimestampMs(value);
  const stampMs = parseTimestampMs(stamp) || Date.now();
  return Boolean(targetMs && targetMs > stampMs);
}

function clearExpiredAdState(state, stamp = nowIso()) {
  state.adBoosts = normalizeAdBoosts(state.adBoosts);
  state.pendingAdBonus = normalizePendingAdBonus(state.pendingAdBonus);

  for (const key of ["meat", "gems", "loyalVisitors"]) {
    if (!isTimestampActive(state.adBoosts[key]?.activeUntil, stamp)) {
      state.adBoosts[key] = {
        multiplier: 1,
        activeUntil: null
      };
    }
  }

  if (!isTimestampActive(state.pendingAdBonus?.expiresAt, stamp)) {
    state.pendingAdBonus = normalizePendingAdBonus({});
  }
}

function getActiveAdBoostSummary(adBoosts = {}, stamp = nowIso()) {
  const normalized = normalizeAdBoosts(adBoosts);
  return {
    meatMultiplier: isTimestampActive(normalized.meat.activeUntil, stamp) ? normalized.meat.multiplier : 1,
    gemsMultiplier: isTimestampActive(normalized.gems.activeUntil, stamp) ? normalized.gems.multiplier : 1,
    loyalVisitorsMultiplier: isTimestampActive(normalized.loyalVisitors.activeUntil, stamp) ? normalized.loyalVisitors.multiplier : 1,
    meatActiveUntil: isTimestampActive(normalized.meat.activeUntil, stamp) ? normalized.meat.activeUntil : null,
    gemsActiveUntil: isTimestampActive(normalized.gems.activeUntil, stamp) ? normalized.gems.activeUntil : null,
    loyalVisitorsActiveUntil: isTimestampActive(normalized.loyalVisitors.activeUntil, stamp) ? normalized.loyalVisitors.activeUntil : null
  };
}

function extendAdBoost(currentBoost, multiplier, durationSeconds, stamp = nowIso()) {
  const currentUntilMs = parseTimestampMs(currentBoost?.activeUntil) || 0;
  const stampMs = parseTimestampMs(stamp) || Date.now();
  const nextBaseMs = Math.max(currentUntilMs, stampMs);
  return {
    multiplier: Math.max(1, toFiniteNumber(multiplier, 1)),
    activeUntil: new Date(nextBaseMs + (Math.max(1, clampInteger(durationSeconds, 1)) * 1000)).toISOString()
  };
}

function applyGemBoostToZooEconomy(zooEconomy, gemsMultiplier = 1) {
  const multiplier = Math.max(1, toFiniteNumber(gemsMultiplier, 1));
  return {
    ...zooEconomy,
    gemIncomePerSec: zooEconomy.gemIncomePerSec * multiplier,
    dailyGemRevenue: zooEconomy.dailyGemRevenue * multiplier,
    revenueProgressPercent: Math.max(
      0,
      Math.min(100, Math.round((Math.log10((zooEconomy.dailyGemRevenue * multiplier) + 10) / 8) * 100))
    )
  };
}

function buildPendingFortuneAdBonus(baseMeat = 0, spinIndex = 0, stamp = nowIso()) {
  const stampMs = parseTimestampMs(stamp) || Date.now();
  return {
    productId: AD_FORTUNE_MEAT_BONUS_PRODUCT_ID,
    rewardId: "meat_60",
    baseMeat: Math.max(0, Math.floor(toFiniteNumber(baseMeat, 0))),
    multiplier: AD_FORTUNE_MEAT_MULTIPLIER,
    expiresAt: new Date(stampMs + (AD_FORTUNE_BONUS_WINDOW_SECONDS * 1000)).toISOString(),
    sourceSpinIndex: clampInteger(spinIndex, 0)
  };
}

function getMagicBirdState(lastClaimedAt, stamp = nowIso()) {
  const nowMs = parseTimestampMs(stamp) || Date.now();
  const lastClaimedMs = parseTimestampMs(lastClaimedAt);
  const nextAvailableMs = lastClaimedMs ? (lastClaimedMs + (MAGIC_BIRD_COOLDOWN_SECONDS * 1000)) : nowMs;
  const remainingSeconds = Math.max(0, Math.ceil((nextAvailableMs - nowMs) / 1000));

  return {
    ready: remainingSeconds <= 0,
    cooldownSeconds: MAGIC_BIRD_COOLDOWN_SECONDS,
    remainingSeconds,
    lastClaimedAt: lastClaimedAt || null,
    nextAvailableAt: new Date(nextAvailableMs).toISOString()
  };
}

function buildMagicBirdOffer({ productionPerSec = 0, gemIncomePerSec = 0 } = {}) {
  const offers = [
    {
      id: "bird_meat_comet",
      title: "Comet Meat Burst",
      description: "The sky bird found a glowing comet crumb and dropped a chunky meat burst into your zoo.",
      reward: {
        meat: Math.max(1800, Math.floor(Math.max(1, productionPerSec) * 60 * 20))
      }
    },
    {
      id: "bird_spin_charm",
      title: "Lucky Feather Spins",
      description: "A sparkling feather swirls around your island and turns into a handful of bonus spins.",
      reward: {
        freeSpins: Math.max(4, Math.min(12, 5 + Math.floor(Math.log10(Math.max(10, productionPerSec + 10)))))
      }
    },
    {
      id: "bird_gem_mist",
      title: "Crystal Gem Mist",
      description: "The bird shakes off shimmering dust that crystallizes into gems for your ticket booth.",
      reward: {
        gems: Math.max(30, Math.floor(Math.max(1, gemIncomePerSec) * 60 * 15))
      }
    },
    {
      id: "bird_fern_blossom",
      title: "Fern Blossom Drop",
      description: "A magic blossom bursts open mid-air and leaves a few rare ferns behind for your zoo.",
      reward: {
        ferns: Math.max(1, Math.min(4, 1 + Math.floor(Math.log10(Math.max(10, productionPerSec + 10)) / 2)))
      }
    }
  ];

  return offers[Math.floor(Math.random() * offers.length)] || offers[0];
}

function sampleAdultProduction(dino, allowVariance = false) {
  const base = Math.max(0, Number(dino?.meatPerSec || 0) || 0);
  if (!base || !allowVariance) return base;
  return Math.max(1, Math.round(base * (0.88 + (Math.random() * 0.24))));
}

function normalizeDinoInstance(entry = {}, dino = null, fallbackStamp = nowIso()) {
  const stamp = entry.acquiredAt || fallbackStamp;
  const fallbackSex = ((parseTimestampMs(stamp) || String(stamp).length) % 2 === 0) ? "female" : "male";
  return {
    acquiredAt: stamp,
    updatedAt: entry.updatedAt || fallbackStamp,
    adultProduction: Math.max(0, Number(entry.adultProduction ?? dino?.meatPerSec ?? 0) || 0),
    sex: String(entry.sex || "").toLowerCase() === "female" ? "female" : (String(entry.sex || "").toLowerCase() === "male" ? "male" : fallbackSex)
  };
}

function buildDefaultDinoInstances(dino = null, quantity = 0, fallbackStamp = nowIso(), allowVariance = false) {
  return Array.from({ length: Math.max(0, clampInteger(quantity, 0)) }, () => normalizeDinoInstance({
    acquiredAt: fallbackStamp,
    updatedAt: fallbackStamp,
    adultProduction: sampleAdultProduction(dino, allowVariance)
  }, dino, fallbackStamp));
}

function normalizeDinoProgressEntry(entry = {}, dino = null, quantity = 0, fallbackStamp = nowIso()) {
  let instances = Array.isArray(entry.instances)
    ? entry.instances.map((instance) => normalizeDinoInstance(instance, dino, fallbackStamp))
    : [];

  if (instances.length < quantity) {
    instances = instances.concat(buildDefaultDinoInstances(dino, quantity - instances.length, entry.firstAcquiredAt || fallbackStamp, false));
  }

  if (instances.length > quantity) {
    instances = instances.slice(0, quantity);
  }

  return {
    firstAcquiredAt: entry.firstAcquiredAt || fallbackStamp,
    lastAcquiredAt: entry.lastAcquiredAt || entry.firstAcquiredAt || fallbackStamp,
    updatedAt: entry.updatedAt || fallbackStamp,
    instances
  };
}

function createPurchasedDinoInstance(dino, stamp = nowIso(), sex = "male") {
  return normalizeDinoInstance({
    acquiredAt: stamp,
    updatedAt: stamp,
    adultProduction: sampleAdultProduction(dino, true),
    sex
  }, dino, stamp);
}

function createInitialDinoProgress(inventory = {}, stamp = nowIso()) {
  const progress = {};

  for (const [itemId, quantity] of Object.entries(inventory || {})) {
    const dino = getDinoById(itemId);
    const normalizedQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
    if (!dino || normalizedQuantity <= 0) continue;
    progress[itemId] = normalizeDinoProgressEntry({}, dino, normalizedQuantity, stamp);
  }

  return progress;
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toInteger(value, fallback = 0) {
  return Math.trunc(toFiniteNumber(value, fallback));
}

function clampInteger(value, minimum = 0) {
  return Math.max(minimum, Math.trunc(toFiniteNumber(value, minimum)));
}

function normalizeTicketPrice(value, fallback = 25) {
  return Math.max(5, Math.min(100, Math.round(toFiniteNumber(value, fallback))));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatZooDateKey(value = nowIso()) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeZooHistory(value) {
  const rawEntries = typeof value === "string" ? parseJson(value, []) : value;
  const byDate = new Map();

  for (const entry of ensureArray(rawEntries)) {
    const dateKey = String(entry?.dateKey || "").trim();
    if (!dateKey) continue;
    byDate.set(dateKey, {
      dateKey,
      totalAttractiveness: Math.max(0, toFiniteNumber(entry.totalAttractiveness, 0)),
      dailyGemRevenue: Math.max(0, toFiniteNumber(entry.dailyGemRevenue, 0)),
      loyalVisitors: Math.max(0, toFiniteNumber(entry.loyalVisitors, 0)),
      gemIncomePerSec: Math.max(0, toFiniteNumber(entry.gemIncomePerSec, 0)),
      totalVisitorsPerSecond: Math.max(0, toFiniteNumber(entry.totalVisitorsPerSecond, 0)),
      walkInDemandPercent: Math.max(0, Math.min(100, clampInteger(entry.walkInDemandPercent, 0))),
      ticketPrice: normalizeTicketPrice(entry.ticketPrice, 25),
      productionPerSec: Math.max(0, toFiniteNumber(entry.productionPerSec, 0))
    });
  }

  return [...byDate.values()]
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    .slice(-14);
}

function serializeZooHistory(value) {
  return JSON.stringify(normalizeZooHistory(value));
}

function buildZooHistoryEntry(stamp, totalAttractiveness, zooEconomy, productionPerSec, ticketPrice) {
  return {
    dateKey: formatZooDateKey(stamp),
    totalAttractiveness: Math.max(0, toFiniteNumber(totalAttractiveness, 0)),
    dailyGemRevenue: Math.max(0, toFiniteNumber(zooEconomy?.dailyGemRevenue, 0)),
    loyalVisitors: Math.max(0, toFiniteNumber(zooEconomy?.loyalVisitors, 0)),
    gemIncomePerSec: Math.max(0, toFiniteNumber(zooEconomy?.gemIncomePerSec, 0)),
    totalVisitorsPerSecond: Math.max(0, toFiniteNumber(zooEconomy?.totalVisitorsPerSecond, 0)),
    walkInDemandPercent: Math.max(0, Math.min(100, Math.round(((Number(zooEconomy?.ticketDemandFactor || 0) / 1.2) * 100) || 0))),
    ticketPrice: normalizeTicketPrice(ticketPrice, 25),
    productionPerSec: Math.max(0, toFiniteNumber(productionPerSec, 0))
  };
}

function recordZooHistory(history, stamp, totalAttractiveness, zooEconomy, productionPerSec, ticketPrice) {
  const normalized = normalizeZooHistory(history);
  const nextEntry = buildZooHistoryEntry(stamp, totalAttractiveness, zooEconomy, productionPerSec, ticketPrice);
  const filtered = normalized.filter((entry) => entry.dateKey !== nextEntry.dateKey);
  filtered.push(nextEntry);
  const seeded = backfillZooHistory(filtered, nextEntry, stamp);
  return seeded.sort((left, right) => left.dateKey.localeCompare(right.dateKey)).slice(-14);
}

function buildSeededZooHistoryEntry(baseEntry, daysAgo, stamp, multipliers = {}) {
  const date = new Date(stamp);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const dateKey = formatZooDateKey(date.toISOString());
  return {
    dateKey,
    totalAttractiveness: Math.max(1, Math.round(baseEntry.totalAttractiveness * (multipliers.totalAttractiveness || 1))),
    dailyGemRevenue: Math.max(1, Number((baseEntry.dailyGemRevenue * (multipliers.dailyGemRevenue || 1)).toFixed(2))),
    loyalVisitors: Math.max(0, Number((baseEntry.loyalVisitors * (multipliers.loyalVisitors || 1)).toFixed(2))),
    gemIncomePerSec: Math.max(0.01, Number((baseEntry.gemIncomePerSec * (multipliers.gemIncomePerSec || 1)).toFixed(3))),
    totalVisitorsPerSecond: Math.max(0.01, Number((baseEntry.totalVisitorsPerSecond * (multipliers.totalVisitorsPerSecond || 1)).toFixed(3))),
    walkInDemandPercent: Math.max(12, Math.min(100, Math.round(baseEntry.walkInDemandPercent * (multipliers.walkInDemandPercent || 1)))),
    ticketPrice: normalizeTicketPrice(baseEntry.ticketPrice + (multipliers.ticketPriceShift || 0), baseEntry.ticketPrice),
    productionPerSec: Math.max(1, Number((baseEntry.productionPerSec * (multipliers.productionPerSec || 1)).toFixed(2)))
  };
}

function backfillZooHistory(history, latestEntry, stamp) {
  const normalized = normalizeZooHistory(history);
  if (!latestEntry) return normalized;

  const targets = [
    {
      daysAgo: 7,
      multipliers: {
        totalAttractiveness: 0.42,
        dailyGemRevenue: 0.36,
        loyalVisitors: 0.28,
        gemIncomePerSec: 0.36,
        totalVisitorsPerSecond: 0.4,
        walkInDemandPercent: 0.88,
        ticketPriceShift: -3,
        productionPerSec: 0.44
      }
    },
    {
      daysAgo: 1,
      multipliers: {
        totalAttractiveness: 0.78,
        dailyGemRevenue: 0.72,
        loyalVisitors: 0.68,
        gemIncomePerSec: 0.72,
        totalVisitorsPerSecond: 0.76,
        walkInDemandPercent: 0.96,
        ticketPriceShift: -1,
        productionPerSec: 0.82
      }
    }
  ];

  const existingKeys = new Set(normalized.map((entry) => entry.dateKey));
  const seeded = [...normalized];

  for (const target of targets) {
    const synthetic = buildSeededZooHistoryEntry(latestEntry, target.daysAgo, stamp, target.multipliers);
    if (existingKeys.has(synthetic.dateKey)) continue;
    seeded.push(synthetic);
    existingKeys.add(synthetic.dateKey);
  }

  return seeded;
}

function buildZooHistorySeries(history, stamp = nowIso()) {
  const normalized = normalizeZooHistory(history);
  const targets = [
    { id: "seven_days_ago", label: "7 days ago", daysAgo: 7 },
    { id: "yesterday", label: "Yesterday", daysAgo: 1 },
    { id: "today", label: "Today", daysAgo: 0 }
  ];

  return targets.map((target) => {
    const baseDate = new Date(stamp);
    baseDate.setUTCDate(baseDate.getUTCDate() - target.daysAgo);
    const dateKey = formatZooDateKey(baseDate.toISOString());
    const entry = normalized.find((item) => item.dateKey === dateKey);
    return {
      id: target.id,
      label: target.label,
      dateKey,
      hasData: Boolean(entry),
      totalAttractiveness: entry?.totalAttractiveness || 0,
      dailyGemRevenue: entry?.dailyGemRevenue || 0,
      loyalVisitors: entry?.loyalVisitors || 0,
      gemIncomePerSec: entry?.gemIncomePerSec || 0,
      totalVisitorsPerSecond: entry?.totalVisitorsPerSecond || 0,
      walkInDemandPercent: entry?.walkInDemandPercent || 0,
      ticketPrice: entry?.ticketPrice || 25,
      productionPerSec: entry?.productionPerSec || 0
    };
  });
}

function normalizeAdminIds(ids) {
  return [...new Set(ensureArray(ids).map((value) => String(value).trim()).filter(Boolean))];
}

function parseDinoGeneState(value) {
  return normalizeDinoGenes(typeof value === "string" ? parseJson(value, {}) : value);
}

function serializeDinoGeneState(value) {
  return JSON.stringify(parseDinoGeneState(value));
}

function parseLabProjectState(value) {
  return normalizeLabProjects(typeof value === "string" ? parseJson(value, []) : value);
}

function serializeLabProjectState(value) {
  return JSON.stringify(parseLabProjectState(value).map((project) => ({
    id: project.id,
    speciesId: project.speciesId,
    displayName: project.displayName,
    sex: project.sex,
    createdAt: project.createdAt,
    source: project.source,
    geneIds: project.geneIds,
    genotypeIds: project.genotypeIds,
    iconId: project.iconId,
    motherSpeciesId: project.motherSpeciesId,
    fatherSpeciesId: project.fatherSpeciesId,
    hybrid: project.hybrid,
    shellTint: project.shellTint,
    kind: project.kind,
    incubationStartedAt: project.incubationStartedAt,
    incubationEndsAt: project.incubationEndsAt,
    incubationDurationSeconds: project.incubationDurationSeconds
  })));
}

function parseModifiedDinoState(value) {
  return normalizeModifiedDinos(typeof value === "string" ? parseJson(value, []) : value);
}

function serializeModifiedDinoState(value) {
  return JSON.stringify(parseModifiedDinoState(value));
}

function rewardToLedgerFields(reward = {}) {
  return {
    meat: toFiniteNumber(reward.meat, 0),
    gems: toFiniteNumber(reward.gems, 0),
    ferns: toInteger(reward.ferns, 0),
    freeSpins: toInteger(reward.freeSpins, 0),
    fortunePoints: toInteger(reward.fortunePoints, 0)
  };
}

function normalizeMarketResourceType(value) {
  return String(value || "").trim().toLowerCase() === "ferns" ? "ferns" : "meat";
}

function getMarketRouteById(routeId) {
  return MARKET_ROUTE_DEFS.find((route) => route.id === routeId) || null;
}

function calculateExchangeGemReward(route, resourceType, amount) {
  const normalizedAmount = Math.max(0, toFiniteNumber(amount, 0));
  const normalizedResource = normalizeMarketResourceType(resourceType);
  const rate = normalizedResource === "ferns"
    ? Math.max(0, toFiniteNumber(route?.fernGemRate, 0))
    : Math.max(0, toFiniteNumber(route?.meatGemRate, 0));

  return Math.max(0.01, Number((normalizedAmount * rate).toFixed(2)));
}

function buildExchangeOrderSnapshot(row, stamp = nowIso()) {
  const createdAtMs = parseTimestampMs(row?.created_at);
  const readyAtMs = parseTimestampMs(row?.ready_at);
  const claimedAtMs = parseTimestampMs(row?.claimed_at);
  const nowMs = parseTimestampMs(stamp) || Date.now();
  const claimed = Boolean(claimedAtMs);
  const ready = !claimed && Boolean(readyAtMs) && readyAtMs <= nowMs;
  const remainingSeconds = readyAtMs ? Math.max(0, Math.ceil((readyAtMs - nowMs) / 1000)) : 0;
  const totalSeconds = createdAtMs && readyAtMs ? Math.max(1, Math.round((readyAtMs - createdAtMs) / 1000)) : 1;
  const elapsedSeconds = claimed
    ? totalSeconds
    : Math.max(0, Math.min(totalSeconds, Math.round((nowMs - (createdAtMs || nowMs)) / 1000)));
  const progressPercent = totalSeconds > 0 ? Math.max(0, Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100))) : 100;

  return {
    orderId: String(row.order_id),
    routeId: String(row.route_id),
    resourceType: normalizeMarketResourceType(row.resource_type),
    amount: normalizeMarketResourceType(row.resource_type) === "ferns"
      ? clampInteger(row.resource_amount, 0)
      : Math.max(0, toFiniteNumber(row.resource_amount, 0)),
    gemReward: Math.max(0, toFiniteNumber(row.gem_reward, 0)),
    durationHours: Math.max(0, toFiniteNumber(row.duration_hours, 0)),
    imageKey: String(row.image_key || ""),
    title: String(row.route_name || ""),
    description: String(row.route_description || ""),
    createdAt: row.created_at || null,
    readyAt: row.ready_at || null,
    claimedAt: row.claimed_at || null,
    ready,
    claimed,
    remainingSeconds,
    progressPercent
  };
}

function normalizeLanguageCode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.split(/[-_]/)[0] || raw;
}

function titleizeUser(user) {
  return {
    telegramUserId: String(user.id),
    username: typeof user.username === "string" ? user.username : "",
    firstName: typeof user.first_name === "string" ? user.first_name : "",
    lastName: typeof user.last_name === "string" ? user.last_name : "",
    languageCode: normalizeLanguageCode(typeof user.language_code === "string" ? user.language_code : "")
  };
}

function serializeReward(reward = {}) {
  return JSON.stringify(cloneReward(reward));
}

function questSortOrder(questId) {
  const ids = ["q_clicks", "q_meat", "q_buy", "q_ferns", "q_spins", "q_upgrade", "q_ads", "social_tiktok", "social_youtube", "social_x"];
  const index = ids.indexOf(questId);
  return index >= 0 ? index : ids.length + 10;
}

export class SQLiteGameStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.adminIds = normalizeAdminIds(options.adminIds || []);

    mkdirSync(dirname(filePath), { recursive: true });

    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    this.initializeSchema();
    this.runMigrations();
    this.refreshLegacyReferralCodes();
    this.backfillDinoProgress();
    this.seedShopProducts();
    this.seedAdminUsers();
  }

  initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        telegram_user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL DEFAULT '',
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        language_code TEXT NOT NULL DEFAULT '',
        referral_code TEXT NOT NULL UNIQUE,
        referred_by_telegram_user_id TEXT,
        referred_by_code TEXT NOT NULL DEFAULT '',
        referred_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_state (
        telegram_user_id TEXT PRIMARY KEY,
        meat REAL NOT NULL,
        click_power INTEGER NOT NULL,
        click_upgrades INTEGER NOT NULL,
        ferns INTEGER NOT NULL,
        total_purchases INTEGER NOT NULL,
        fortune_points INTEGER NOT NULL,
        free_spins INTEGER NOT NULL,
        spin_index INTEGER NOT NULL,
        lifetime_clicks INTEGER NOT NULL DEFAULT 0,
        gems REAL NOT NULL DEFAULT 0,
        ticket_price INTEGER NOT NULL DEFAULT 25,
        loyal_visitors REAL NOT NULL DEFAULT 0,
        laboratory_unlocked INTEGER NOT NULL DEFAULT 0,
        laboratory_unlocked_at TEXT,
        hatchery_unlocked INTEGER NOT NULL DEFAULT 0,
        hatchery_unlocked_at TEXT,
        dino_genes_json TEXT NOT NULL DEFAULT '{}',
        lab_projects_json TEXT NOT NULL DEFAULT '[]',
        modified_dinos_json TEXT NOT NULL DEFAULT '[]',
        zoo_history_json TEXT NOT NULL DEFAULT '[]',
        ad_boosts_json TEXT NOT NULL DEFAULT '{}',
        pending_ad_bonus_json TEXT NOT NULL DEFAULT '{}',
        ad_views_count INTEGER NOT NULL DEFAULT 0,
        magic_bird_last_claimed_at TEXT,
        magic_bird_claim_count INTEGER NOT NULL DEFAULT 0,
        referral_successful_invites INTEGER NOT NULL,
        referral_pending_invites INTEGER NOT NULL,
        claimed_invite_milestones_json TEXT NOT NULL DEFAULT '[]',
        click_chain_started_at TEXT,
        last_click_at TEXT,
        suspicious_click_flagged_at TEXT,
        suspicious_click_chain_seconds INTEGER NOT NULL DEFAULT 0,
        last_passive_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS player_inventory (
        telegram_user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (telegram_user_id, item_id),
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS player_dino_progress (
        telegram_user_id TEXT NOT NULL,
        dino_id TEXT NOT NULL,
        first_acquired_at TEXT NOT NULL,
        last_acquired_at TEXT NOT NULL,
        instances_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (telegram_user_id, dino_id),
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS player_quests (
        telegram_user_id TEXT NOT NULL,
        quest_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title_template TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        level INTEGER NOT NULL,
        target REAL NOT NULL,
        progress REAL NOT NULL,
        reward_json TEXT NOT NULL,
        link TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (telegram_user_id, quest_id),
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS shop_products (
        product_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'stars',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        reward_type TEXT NOT NULL,
        reward_amount INTEGER NOT NULL,
        stars_price INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'XTR',
        price_label TEXT NOT NULL DEFAULT '',
        placement TEXT NOT NULL DEFAULT 'shop',
        highlight_text TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telegram_payments (
        payment_id TEXT PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        status TEXT NOT NULL,
        invoice_url TEXT NOT NULL DEFAULT '',
        invoice_slug TEXT NOT NULL DEFAULT '',
        external_charge_id TEXT UNIQUE,
        idempotency_key TEXT UNIQUE,
        reward_type TEXT NOT NULL,
        reward_amount INTEGER NOT NULL,
        stars_price INTEGER NOT NULL,
        raw_payload TEXT NOT NULL DEFAULT '',
        granted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES shop_products(product_id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_meat REAL NOT NULL DEFAULT 0,
        amount_gems REAL NOT NULL DEFAULT 0,
        amount_ferns INTEGER NOT NULL DEFAULT 0,
        amount_free_spins INTEGER NOT NULL DEFAULT 0,
        amount_fortune_points INTEGER NOT NULL DEFAULT 0,
        item_id TEXT NOT NULL DEFAULT '',
        item_count INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        telegram_user_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS admin_audit_log (
        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_telegram_user_id TEXT NOT NULL,
        target_telegram_user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (admin_telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE,
        FOREIGN KEY (target_telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS player_exchange_orders (
        order_id TEXT PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        route_id TEXT NOT NULL,
        route_name TEXT NOT NULL,
        route_description TEXT NOT NULL DEFAULT '',
        image_key TEXT NOT NULL DEFAULT '',
        resource_type TEXT NOT NULL,
        resource_amount REAL NOT NULL,
        gem_reward REAL NOT NULL,
        duration_hours REAL NOT NULL,
        created_at TEXT NOT NULL,
        ready_at TEXT NOT NULL,
        claimed_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_players_last_seen_at ON players(last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_player_dino_progress_updated ON player_dino_progress(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_payments_user_created ON telegram_payments(telegram_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(telegram_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_exchange_orders_user_created ON player_exchange_orders(telegram_user_id, created_at DESC);
    `);
  }

  runMigrations() {
    const playerColumns = new Set(
      this.db.prepare("PRAGMA table_info(players)").all().map((column) => String(column.name || ""))
    );

    if (!playerColumns.has("referred_by_telegram_user_id")) {
      this.db.exec("ALTER TABLE players ADD COLUMN referred_by_telegram_user_id TEXT");
    }

    if (!playerColumns.has("referred_by_code")) {
      this.db.exec("ALTER TABLE players ADD COLUMN referred_by_code TEXT NOT NULL DEFAULT ''");
    }

    if (!playerColumns.has("referred_at")) {
      this.db.exec("ALTER TABLE players ADD COLUMN referred_at TEXT");
    }

    const playerStateColumns = new Set(
      this.db.prepare("PRAGMA table_info(player_state)").all().map((column) => String(column.name || ""))
    );

    if (!playerStateColumns.has("claimed_invite_milestones_json")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN claimed_invite_milestones_json TEXT NOT NULL DEFAULT '[]'");
    }

    if (!playerStateColumns.has("click_chain_started_at")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN click_chain_started_at TEXT");
    }

    if (!playerStateColumns.has("last_click_at")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN last_click_at TEXT");
    }

    if (!playerStateColumns.has("suspicious_click_flagged_at")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN suspicious_click_flagged_at TEXT");
    }

    if (!playerStateColumns.has("suspicious_click_chain_seconds")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN suspicious_click_chain_seconds INTEGER NOT NULL DEFAULT 0");
    }

    if (!playerStateColumns.has("gems")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN gems REAL NOT NULL DEFAULT 0");
    }

    if (!playerStateColumns.has("lifetime_clicks")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN lifetime_clicks INTEGER NOT NULL DEFAULT 0");
    }

    if (!playerStateColumns.has("ticket_price")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN ticket_price INTEGER NOT NULL DEFAULT 25");
    }

    if (!playerStateColumns.has("loyal_visitors")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN loyal_visitors REAL NOT NULL DEFAULT 0");
    }

    const transactionColumns = new Set(
      this.db.prepare("PRAGMA table_info(transactions)").all().map((column) => String(column.name || ""))
    );

    if (!transactionColumns.has("amount_gems")) {
      this.db.exec("ALTER TABLE transactions ADD COLUMN amount_gems REAL NOT NULL DEFAULT 0");
    }

    if (!playerStateColumns.has("laboratory_unlocked")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN laboratory_unlocked INTEGER NOT NULL DEFAULT 0");
    }

    if (!playerStateColumns.has("laboratory_unlocked_at")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN laboratory_unlocked_at TEXT");
    }

    if (!playerStateColumns.has("hatchery_unlocked")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN hatchery_unlocked INTEGER NOT NULL DEFAULT 0");
    }

    if (!playerStateColumns.has("hatchery_unlocked_at")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN hatchery_unlocked_at TEXT");
    }

    if (!playerStateColumns.has("dino_genes_json")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN dino_genes_json TEXT NOT NULL DEFAULT '{}'");
    }

    if (!playerStateColumns.has("lab_projects_json")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN lab_projects_json TEXT NOT NULL DEFAULT '[]'");
    }

      if (!playerStateColumns.has("modified_dinos_json")) {
        this.db.exec("ALTER TABLE player_state ADD COLUMN modified_dinos_json TEXT NOT NULL DEFAULT '[]'");
      }

      if (!playerStateColumns.has("zoo_history_json")) {
        this.db.exec("ALTER TABLE player_state ADD COLUMN zoo_history_json TEXT NOT NULL DEFAULT '[]'");
      }

    if (!playerStateColumns.has("ad_boosts_json")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN ad_boosts_json TEXT NOT NULL DEFAULT '{}'");
    }

    if (!playerStateColumns.has("pending_ad_bonus_json")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN pending_ad_bonus_json TEXT NOT NULL DEFAULT '{}'");
    }

    if (!playerStateColumns.has("ad_views_count")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN ad_views_count INTEGER NOT NULL DEFAULT 0");
    }

    if (!playerStateColumns.has("magic_bird_last_claimed_at")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN magic_bird_last_claimed_at TEXT");
    }

    if (!playerStateColumns.has("magic_bird_claim_count")) {
      this.db.exec("ALTER TABLE player_state ADD COLUMN magic_bird_claim_count INTEGER NOT NULL DEFAULT 0");
    }

    const dinoProgressColumns = new Set(
      this.db.prepare("PRAGMA table_info(player_dino_progress)").all().map((column) => String(column.name || ""))
    );

    if (!dinoProgressColumns.has("instances_json")) {
      this.db.exec("ALTER TABLE player_dino_progress ADD COLUMN instances_json TEXT NOT NULL DEFAULT '[]'");
    }

    const shopProductColumns = new Set(
      this.db.prepare("PRAGMA table_info(shop_products)").all().map((column) => String(column.name || ""))
    );

    if (!shopProductColumns.has("price_label")) {
      this.db.exec("ALTER TABLE shop_products ADD COLUMN price_label TEXT NOT NULL DEFAULT ''");
    }

    if (!shopProductColumns.has("placement")) {
      this.db.exec("ALTER TABLE shop_products ADD COLUMN placement TEXT NOT NULL DEFAULT 'shop'");
    }

    if (!shopProductColumns.has("highlight_text")) {
      this.db.exec("ALTER TABLE shop_products ADD COLUMN highlight_text TEXT NOT NULL DEFAULT ''");
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_exchange_orders (
        order_id TEXT PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        route_id TEXT NOT NULL,
        route_name TEXT NOT NULL,
        route_description TEXT NOT NULL DEFAULT '',
        image_key TEXT NOT NULL DEFAULT '',
        resource_type TEXT NOT NULL,
        resource_amount REAL NOT NULL,
        gem_reward REAL NOT NULL,
        duration_hours REAL NOT NULL,
        created_at TEXT NOT NULL,
        ready_at TEXT NOT NULL,
        claimed_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (telegram_user_id) REFERENCES players(telegram_user_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_exchange_orders_user_created ON player_exchange_orders(telegram_user_id, created_at DESC);
    `);
  }

  backfillDinoProgress() {
    const players = new Map(
      this.db.prepare("SELECT telegram_user_id, created_at, updated_at FROM players").all().map((row) => [String(row.telegram_user_id), row])
    );
    const existingRows = new Map(
      this.db.prepare("SELECT telegram_user_id, dino_id, first_acquired_at, last_acquired_at, instances_json, updated_at FROM player_dino_progress").all().map((row) => [`${row.telegram_user_id}:${row.dino_id}`, row])
    );
    const rows = this.db.prepare("SELECT telegram_user_id, item_id, quantity FROM player_inventory WHERE quantity > 0").all();
    const statement = this.db.prepare(
      "INSERT INTO player_dino_progress (telegram_user_id, dino_id, first_acquired_at, last_acquired_at, instances_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(telegram_user_id, dino_id) DO UPDATE SET first_acquired_at = excluded.first_acquired_at, last_acquired_at = excluded.last_acquired_at, instances_json = excluded.instances_json, updated_at = excluded.updated_at"
    );

    for (const row of rows) {
      const dino = getDinoById(row.item_id);
      const quantity = clampInteger(row.quantity, 0);
      if (!dino || quantity <= 0) continue;
      const player = players.get(String(row.telegram_user_id));
      const stamp = player?.created_at || player?.updated_at || nowIso();
      const existing = existingRows.get(`${row.telegram_user_id}:${row.item_id}`);
      const entry = normalizeDinoProgressEntry({
        firstAcquiredAt: existing?.first_acquired_at,
        lastAcquiredAt: existing?.last_acquired_at,
        updatedAt: existing?.updated_at,
        instances: parseJson(existing?.instances_json, [])
      }, dino, quantity, stamp);
      statement.run(
        String(row.telegram_user_id),
        String(row.item_id),
        entry.firstAcquiredAt,
        entry.lastAcquiredAt,
        JSON.stringify(entry.instances),
        stamp
      );
    }
  }

  refreshLegacyReferralCodes() {
    const players = this.db.prepare("SELECT telegram_user_id, referral_code FROM players").all();
    const updateStatement = this.db.prepare("UPDATE players SET referral_code = ?, updated_at = ? WHERE telegram_user_id = ?");
    const stamp = nowIso();
    let changed = false;

    for (const row of players) {
      const currentCode = String(row.referral_code || "").trim().toUpperCase();
      if (/^\d{8,12}$/.test(currentCode)) continue;

      const nextCode = this.generateUniqueReferralCode(row.telegram_user_id);
      updateStatement.run(nextCode, stamp, String(row.telegram_user_id));
      changed = true;
    }

    if (!changed) return;

    this.db.prepare(`
      UPDATE players SET
        referred_by_code = COALESCE(
          (SELECT referral_code FROM players ref WHERE ref.telegram_user_id = players.referred_by_telegram_user_id),
          referred_by_code
        ),
        updated_at = ?
      WHERE referred_by_telegram_user_id IS NOT NULL
    `).run(stamp);
  }

  generateUniqueReferralCode(telegramUserId = "") {
    const normalizedUserId = String(telegramUserId || "");
    const selectStatement = this.db.prepare("SELECT telegram_user_id FROM players WHERE referral_code = ?");

    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = buildReferralCode();
      const existing = selectStatement.get(candidate);
      if (!existing || existing.telegram_user_id === normalizedUserId) {
        return candidate;
      }
    }

    const fallback = randomUUID().replace(/\D/g, "").padEnd(9, "7").slice(0, 9);
    const existing = selectStatement.get(fallback);
    if (!existing || existing.telegram_user_id === normalizedUserId) {
      return fallback;
    }

    return String(Date.now()).slice(-9);
  }

  seedShopProducts() {
    const statement = this.db.prepare(`
      INSERT INTO shop_products (
        product_id,
        kind,
        title,
        description,
        reward_type,
        reward_amount,
        stars_price,
        currency,
        price_label,
        placement,
        highlight_text,
        active,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET
        kind = excluded.kind,
        title = excluded.title,
        description = excluded.description,
        reward_type = excluded.reward_type,
        reward_amount = excluded.reward_amount,
        stars_price = excluded.stars_price,
        currency = excluded.currency,
        price_label = excluded.price_label,
        placement = excluded.placement,
        highlight_text = excluded.highlight_text,
        active = excluded.active,
        updated_at = excluded.updated_at
    `);

    for (const product of DEFAULT_STORE_PRODUCTS) {
      statement.run(
        product.id,
        product.kind || "stars",
        product.title,
        product.description,
        product.rewardType,
        product.rewardAmount,
        clampInteger(product.starsPrice, 0),
        product.currency || (product.kind === "fiat" ? "USD" : "XTR"),
        product.priceLabel || "",
        product.placement || "shop",
        product.highlightText || "",
        product.active ? 1 : 0,
        nowIso()
      );
    }
  }

  seedAdminUsers() {

    if (!this.adminIds.length) return;

    const insertStatement = this.db.prepare(
      "INSERT OR IGNORE INTO admin_users (telegram_user_id, created_at) VALUES (?, ?)"
    );

    for (const adminId of this.adminIds) {
      const player = this.db.prepare("SELECT telegram_user_id FROM players WHERE telegram_user_id = ?").get(adminId);
      if (!player) continue;
      insertStatement.run(adminId, nowIso());
    }
  }

  withTransaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");

    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  }

  getPlayerRow(telegramUserId) {
    return this.db.prepare("SELECT * FROM players WHERE telegram_user_id = ?").get(String(telegramUserId)) || null;
  }

  reserveReferralCode(telegramUserId) {
    return this.generateUniqueReferralCode(telegramUserId);
  }

  touchAdminUsers(telegramUserId) {
    if (!this.adminIds.includes(String(telegramUserId))) return;

    this.db.prepare(
      "INSERT OR IGNORE INTO admin_users (telegram_user_id, created_at) VALUES (?, ?)"
    ).run(String(telegramUserId), nowIso());
  }

  loadReferralCommissionMap(telegramUserId) {
    const rows = this.db.prepare(`
      SELECT metadata_json, amount_meat
      FROM transactions
      WHERE telegram_user_id = ? AND type = 'referral_commission'
    `).all(String(telegramUserId));
    const perPlayer = new Map();
    let totalCommissionMeat = 0;

    for (const row of rows) {
      const meat = toFiniteNumber(row.amount_meat, 0);
      if (meat <= 0) continue;

      totalCommissionMeat += meat;
      const metadata = parseJson(row.metadata_json, {});
      const referredPlayerId = String(metadata.referredPlayerId || "").trim();
      if (!referredPlayerId) continue;
      perPlayer.set(referredPlayerId, toFiniteNumber(perPlayer.get(referredPlayerId), 0) + meat);
    }

    return { totalCommissionMeat, perPlayer };
  }

  loadReferredPlayers(telegramUserId) {
    const rows = this.db.prepare(`
      SELECT telegram_user_id, username, first_name, last_name, referred_at, created_at
      FROM players
      WHERE referred_by_telegram_user_id = ?
      ORDER BY referred_at DESC, created_at DESC
    `).all(String(telegramUserId));
    const commission = this.loadReferralCommissionMap(telegramUserId);

    return {
      totalCommissionMeat: commission.totalCommissionMeat,
      invitedPlayers: rows.map((row) => ({
        telegramUserId: row.telegram_user_id,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        referredAt: row.referred_at,
        createdAt: row.created_at,
        commissionMeat: toFiniteNumber(commission.perPlayer.get(String(row.telegram_user_id)), 0)
      }))
    };
  }

  updateContinuousClickState(state, stamp = nowIso()) {
    const antiCheat = normalizeAntiCheatState(state?.antiCheat);
    const currentMs = parseTimestampMs(stamp);
    const lastClickMs = parseTimestampMs(antiCheat.lastClickAt);
    const chainStartedMs = parseTimestampMs(antiCheat.clickChainStartedAt);
    let clickChainStartedAt = antiCheat.clickChainStartedAt;

    if (!currentMs || !lastClickMs || !chainStartedMs || (currentMs - lastClickMs) > CONTINUOUS_CLICK_BREAK_SECONDS * 1000) {
      clickChainStartedAt = stamp;
    }

    const effectiveStartedMs = parseTimestampMs(clickChainStartedAt) ?? currentMs ?? Date.now();
    const chainSeconds = Math.max(0, Math.floor(((currentMs ?? Date.now()) - effectiveStartedMs) / 1000));
    const suspiciousClickFlaggedAt = antiCheat.suspiciousClickFlaggedAt || (chainSeconds >= CONTINUOUS_CLICK_FLAG_SECONDS ? stamp : null);

    state.antiCheat = normalizeAntiCheatState({
      clickChainStartedAt,
      lastClickAt: stamp,
      suspiciousClickFlaggedAt,
      suspiciousClickChainSeconds: chainSeconds
    });

    return state.antiCheat;
  }

  awardReferralCommission(referredTelegramUserId, generatedMeat, source = "gameplay", metadata = {}, stamp = nowIso()) {
    const normalizedGeneratedMeat = toFiniteNumber(generatedMeat, 0);
    if (normalizedGeneratedMeat <= 0) return 0;

    const referredPlayer = this.getPlayerRow(referredTelegramUserId);
    const referrerTelegramUserId = referredPlayer?.referred_by_telegram_user_id ? String(referredPlayer.referred_by_telegram_user_id) : "";
    if (!referrerTelegramUserId) return 0;

    const bonusMeat = Math.max(0, Math.floor(normalizedGeneratedMeat * REFERRAL_MEAT_SHARE));
    if (bonusMeat <= 0) return 0;

    const mutable = this.loadMutableState(referrerTelegramUserId);
    const appliedReward = this.applyReward(mutable, { meat: bonusMeat });
    this.saveMutableState(referrerTelegramUserId, mutable, stamp);
    this.logTransaction(referrerTelegramUserId, {
      type: "referral_commission",
      source: "referrals",
      meat: appliedReward.meat,
      metadata: {
        referredPlayerId: String(referredTelegramUserId),
        generatedMeat: normalizedGeneratedMeat,
        share: REFERRAL_MEAT_SHARE,
        source,
        ...metadata
      },
      idempotencyKey: `referral-commission:${referrerTelegramUserId}:${referredTelegramUserId}:${source}:${stamp}:${Math.floor(normalizedGeneratedMeat)}`
    });

    return appliedReward.meat;
  }

  applyReferralAttribution(telegramUserId, referralCode, stamp = nowIso()) {
    const normalizedCode = String(referralCode || "").trim().toUpperCase();
    if (!normalizedCode) return null;

    const player = this.getPlayerRow(telegramUserId);
    if (!player) return null;
    if (player.referred_by_telegram_user_id || player.referred_by_code) return null;

    const referrer = this.db.prepare(
      "SELECT telegram_user_id, referral_code FROM players WHERE referral_code = ?"
    ).get(normalizedCode);

    if (!referrer || referrer.telegram_user_id === String(telegramUserId)) {
      return null;
    }

    this.db.prepare(`
      UPDATE players SET
        referred_by_telegram_user_id = ?,
        referred_by_code = ?,
        referred_at = ?,
        updated_at = ?
      WHERE telegram_user_id = ?
    `).run(
      referrer.telegram_user_id,
      referrer.referral_code,
      stamp,
      stamp,
      String(telegramUserId)
    );

    const referralReward = rewardToLedgerFields(SUCCESSFUL_REFERRAL_REWARD);

    this.db.prepare(`
      UPDATE player_state SET
        referral_successful_invites = referral_successful_invites + 1,
        meat = meat + ?,
        ferns = ferns + ?,
        free_spins = free_spins + ?,
        fortune_points = fortune_points + ?,
        updated_at = ?
      WHERE telegram_user_id = ?
    `).run(
      referralReward.meat,
      referralReward.ferns,
      referralReward.freeSpins,
      referralReward.fortunePoints,
      stamp,
      referrer.telegram_user_id
    );

    this.logTransaction(referrer.telegram_user_id, {
      type: "referral_signup",
      source: "referrals",
      meat: referralReward.meat,
      ferns: referralReward.ferns,
      freeSpins: referralReward.freeSpins,
      fortunePoints: referralReward.fortunePoints,
      metadata: {
        referredPlayerId: String(telegramUserId),
        referralCode: referrer.referral_code,
        reward: SUCCESSFUL_REFERRAL_REWARD
      },
      idempotencyKey: `referral:${referrer.telegram_user_id}:${telegramUserId}`
    });

    return {
      referrerTelegramUserId: referrer.telegram_user_id,
      referralCode: referrer.referral_code
    };
  }

  ensurePlayer(telegramUser, incomingReferralCode = "") {
    const viewer = titleizeUser(telegramUser);

    this.withTransaction(() => {
      let player = this.getPlayerRow(viewer.telegramUserId);
      const timestamp = nowIso();
      const normalizedIncomingReferralCode = String(incomingReferralCode || "").trim().toUpperCase();
      const isNewPlayer = !player;

      if (isNewPlayer) {
        const referralCode = this.reserveReferralCode(viewer.telegramUserId);
        this.db.prepare(`
          INSERT INTO players (
            telegram_user_id,
            username,
            first_name,
            last_name,
            language_code,
            referral_code,
            referred_by_telegram_user_id,
            referred_by_code,
            referred_at,
            created_at,
            updated_at,
            last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          viewer.telegramUserId,
          viewer.username,
          viewer.firstName,
          viewer.lastName,
          viewer.languageCode,
          referralCode,
          null,
          "",
          null,
          timestamp,
          timestamp,
          timestamp
        );

        const state = createInitialScalarState();
        const antiCheat = createInitialAntiCheatState();
        this.db.prepare(`
          INSERT INTO player_state (
            telegram_user_id,
            meat,
            click_power,
            click_upgrades,
            ferns,
            total_purchases,
            fortune_points,
            free_spins,
            spin_index,
            lifetime_clicks,
            gems,
            ticket_price,
            loyal_visitors,
            laboratory_unlocked,
            laboratory_unlocked_at,
            hatchery_unlocked,
            hatchery_unlocked_at,
            dino_genes_json,
            lab_projects_json,
            modified_dinos_json,
            zoo_history_json,
            ad_boosts_json,
            pending_ad_bonus_json,
            ad_views_count,
            magic_bird_last_claimed_at,
            magic_bird_claim_count,
            referral_successful_invites,
            referral_pending_invites,
            claimed_invite_milestones_json,
            click_chain_started_at,
            last_click_at,
            suspicious_click_flagged_at,
            suspicious_click_chain_seconds,
            last_passive_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          viewer.telegramUserId,
          state.meat,
          state.clickPower,
          state.clickUpgrades,
          state.ferns,
          state.totalPurchases,
          state.fortunePoints,
          state.freeSpins,
          state.spinIndex,
          0,
          state.gems,
          state.ticketPrice,
          state.loyalVisitors,
          0,
          null,
          0,
          null,
          serializeDinoGeneState({}),
          serializeLabProjectState([]),
          serializeModifiedDinoState([]),
          serializeZooHistory([]),
          serializeAdBoosts({}),
          serializePendingAdBonus({}),
          0,
          null,
          0,
          INITIAL_REFERRAL_STATS.successfulInvites,
          INITIAL_REFERRAL_STATS.pendingInvites,
          JSON.stringify(INITIAL_REFERRAL_STATS.claimedMilestones || []),
          antiCheat.clickChainStartedAt,
          antiCheat.lastClickAt,
          antiCheat.suspiciousClickFlaggedAt,
          antiCheat.suspiciousClickChainSeconds,
          timestamp,
          timestamp,
          timestamp
        );
        const inventoryStatement = this.db.prepare(
          "INSERT INTO player_inventory (telegram_user_id, item_id, quantity, updated_at) VALUES (?, ?, ?, ?)"
        );

        const initialInventory = createInitialInventory();
        const initialDinoProgress = createInitialDinoProgress(initialInventory, timestamp);
        const initialProductionPerSec = computeProductionPerSecond(initialInventory, initialDinoProgress, timestamp);
        for (const [itemId, quantity] of Object.entries(initialInventory)) {
          inventoryStatement.run(viewer.telegramUserId, itemId, quantity, timestamp);
        }

        const dinoProgressStatement = this.db.prepare(`
          INSERT INTO player_dino_progress (
            telegram_user_id,
            dino_id,
            first_acquired_at,
            last_acquired_at,
            instances_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const [dinoId, entry] of Object.entries(initialDinoProgress)) {
          dinoProgressStatement.run(viewer.telegramUserId, dinoId, entry.firstAcquiredAt, entry.lastAcquiredAt, JSON.stringify(entry.instances), entry.updatedAt);
        }

        const questStatement = this.db.prepare(`
          INSERT INTO player_quests (
            telegram_user_id,
            quest_id,
            type,
            title_template,
            title,
            level,
            target,
            progress,
            reward_json,
            link,
            sort_order,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const rawQuest of createInitialQuestState()) {
          const quest = this.scaleQuestRewardToProduction(rawQuest, initialProductionPerSec);
          questStatement.run(
            viewer.telegramUserId,
            quest.id,
            quest.type,
            quest.titleTemplate || "",
            quest.title,
            clampInteger(quest.level, 1),
            toFiniteNumber(quest.target, 0),
            toFiniteNumber(quest.progress, 0),
            serializeReward(quest.reward),
            quest.link || "",
            questSortOrder(quest.id),
            timestamp
          );
        }

        if (normalizedIncomingReferralCode) {
          this.applyReferralAttribution(viewer.telegramUserId, normalizedIncomingReferralCode, timestamp);
        }
      } else {
        this.db.prepare(`
          UPDATE players SET
            username = ?,
            first_name = ?,
            last_name = ?,
            language_code = ?,
            updated_at = ?,
            last_seen_at = ?
          WHERE telegram_user_id = ?
        `).run(
          viewer.username,
          viewer.firstName,
          viewer.lastName,
          viewer.languageCode,
          timestamp,
          timestamp,
          viewer.telegramUserId
        );
      }

      this.touchAdminUsers(viewer.telegramUserId);
    });

    return this.getPlayerSnapshot(viewer.telegramUserId);
  }

  setPlayerLanguage(telegramUserId, languageCode) {
    const normalizedLanguageCode = normalizeLanguageCode(languageCode) || "en";

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);
      this.db.prepare(`
        UPDATE players SET
          language_code = ?,
          updated_at = ?,
          last_seen_at = ?
        WHERE telegram_user_id = ?
      `).run(normalizedLanguageCode, stamp, stamp, String(telegramUserId));
      this.saveMutableState(telegramUserId, mutable, stamp);
      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  getLanguageUsageStats() {
    return this.db.prepare(`
      SELECT
        CASE
          WHEN TRIM(language_code) = '' THEN 'unknown'
          ELSE LOWER(language_code)
        END AS language_code,
        COUNT(*) AS user_count
      FROM players
      GROUP BY 1
      ORDER BY user_count DESC, language_code ASC
    `).all().map((row) => ({
      languageCode: normalizeLanguageCode(row.language_code) || 'unknown',
      userCount: clampInteger(row.user_count, 0)
    }));
  }

  isAdminUser(telegramUserId) {
    const id = String(telegramUserId);
    if (this.adminIds.includes(id)) return true;
    return Boolean(this.db.prepare("SELECT telegram_user_id FROM admin_users WHERE telegram_user_id = ?").get(id));
  }

  listProducts() {
    return this.db.prepare(`
      SELECT product_id, kind, title, description, reward_type, reward_amount, stars_price, currency, price_label, placement, highlight_text, active
      FROM shop_products
      WHERE active = 1
      ORDER BY CASE WHEN placement = 'starter' THEN 0 ELSE 1 END ASC, stars_price ASC, product_id ASC
    `).all().map((row) => ({
      id: row.product_id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      rewardType: row.reward_type,
      rewardAmount: row.reward_amount,
      starsPrice: row.stars_price,
      priceAmount: row.stars_price,
      currency: row.currency,
      priceLabel: row.price_label,
      placement: row.placement,
      highlightText: row.highlight_text,
      active: Boolean(row.active)
    }));
  }

  getProductOfferState(telegramUserId, productId, products = this.listProducts()) {
    const product = products.find((entry) => entry.id === productId) || null;
    if (!product) {
      return {
        productId,
        eligible: false,
        alreadyPurchased: false,
        product: null
      };
    }

    const payment = this.db.prepare(
      "SELECT payment_id, granted_at, created_at FROM telegram_payments WHERE telegram_user_id = ? AND product_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(String(telegramUserId), productId);

    return {
      productId,
      eligible: !payment?.granted_at,
      alreadyPurchased: Boolean(payment?.granted_at),
      purchasedAt: payment?.granted_at || null,
      product
    };
  }

  getStarterOfferState(telegramUserId, products = this.listProducts()) {
    return this.getProductOfferState(telegramUserId, STARTER_OFFER_PRODUCT_ID, products);
  }

  getElitePassOfferState(telegramUserId, products = this.listProducts()) {
    return this.getProductOfferState(telegramUserId, ELITE_PASS_PRODUCT_ID, products);
  }

  getLifetimeMeatEarned(telegramUserId) {
    const row = this.db.prepare(
      "SELECT COALESCE(SUM(CASE WHEN amount_meat > 0 THEN amount_meat ELSE 0 END), 0) AS total FROM transactions WHERE telegram_user_id = ?"
    ).get(String(telegramUserId));

    return toFiniteNumber(row?.total, 0);
  }

  getSuccessfulPaymentsCount(telegramUserId) {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS total FROM telegram_payments WHERE telegram_user_id = ? AND granted_at IS NOT NULL"
    ).get(String(telegramUserId));

    return clampInteger(row?.total, 0);
  }

  loadMutableState(telegramUserId) {
    const id = String(telegramUserId);
    const player = this.getPlayerRow(id);
    const stateRow = this.db.prepare("SELECT * FROM player_state WHERE telegram_user_id = ?").get(id);

    if (!player || !stateRow) {
      throw new Error("Player not found.");
    }

    const inventoryRows = this.db.prepare(
      "SELECT item_id, quantity FROM player_inventory WHERE telegram_user_id = ? AND quantity > 0 ORDER BY item_id ASC"
    ).all(id);
    const questRows = this.db.prepare(
      "SELECT * FROM player_quests WHERE telegram_user_id = ? ORDER BY sort_order ASC, quest_id ASC"
    ).all(id);
    const dinoProgressRows = this.db.prepare(
      "SELECT * FROM player_dino_progress WHERE telegram_user_id = ? ORDER BY dino_id ASC"
    ).all(id);

    const inventory = Object.fromEntries(inventoryRows.map((row) => [row.item_id, clampInteger(row.quantity, 0)]));
    const dinoProgress = Object.fromEntries(
      dinoProgressRows.map((row) => {
        const dino = getDinoById(String(row.dino_id));
        const quantity = clampInteger(inventory[row.dino_id], 0);
        return [String(row.dino_id), normalizeDinoProgressEntry({
          firstAcquiredAt: row.first_acquired_at,
          lastAcquiredAt: row.last_acquired_at,
          updatedAt: row.updated_at,
          instances: parseJson(row.instances_json, [])
        }, dino, quantity, player.created_at || nowIso())];
      })
    );

    for (const [itemId, quantity] of Object.entries(inventory)) {
      const dino = getDinoById(itemId);
      if (!dino) continue;
      dinoProgress[itemId] = normalizeDinoProgressEntry(dinoProgress[itemId], dino, clampInteger(quantity, 0), player.created_at || nowIso());
    }

    const dinoGenes = parseDinoGeneState(stateRow.dino_genes_json);
    const labProjects = parseLabProjectState(stateRow.lab_projects_json);
    const modifiedDinos = parseModifiedDinoState(stateRow.modified_dinos_json);
    const zooHistory = normalizeZooHistory(stateRow.zoo_history_json);
    const adBoosts = normalizeAdBoosts(stateRow.ad_boosts_json);
    const pendingAdBonus = normalizePendingAdBonus(stateRow.pending_ad_bonus_json);
    const productionPerSec = computeProductionPerSecond(inventory, dinoProgress, nowIso(), dinoGenes, modifiedDinos);
    const defaultQuests = createInitialQuestState().map((quest) => {
      const scaledQuest = this.scaleQuestRewardToProduction(quest, productionPerSec);
      return {
        ...scaledQuest,
        sortOrder: questSortOrder(quest.id)
      };
    });
    const storedQuests = new Map(questRows.map((row) => [row.quest_id, {
      id: row.quest_id,
      type: row.type,
      titleTemplate: row.title_template || "",
      title: row.title,
      level: clampInteger(row.level, 1),
      target: toFiniteNumber(row.target, 0),
      progress: toFiniteNumber(row.progress, 0),
      reward: cloneReward(parseJson(row.reward_json, {})),
      link: row.link || "",
      sortOrder: clampInteger(row.sort_order, 0)
    }]));
    const quests = defaultQuests.map((quest) => {
      const existing = storedQuests.get(quest.id);
      if (!existing) return quest;

      return {
        ...quest,
        ...existing,
        sortOrder: questSortOrder(quest.id)
      };
    });

    for (const quest of storedQuests.values()) {
      if (quests.some((entry) => entry.id === quest.id)) continue;
      quests.push({
        ...quest,
        sortOrder: questSortOrder(quest.id)
      });
    }

    quests.sort((left, right) => (left.sortOrder - right.sortOrder) || left.id.localeCompare(right.id));

    return {
      player,
      state: {
        meat: toFiniteNumber(stateRow.meat, 0),
        clickPower: clampInteger(stateRow.click_power, 1),
        clickUpgrades: clampInteger(stateRow.click_upgrades, 0),
        ferns: clampInteger(stateRow.ferns, 0),
        totalPurchases: clampInteger(stateRow.total_purchases, 0),
        fortunePoints: clampInteger(stateRow.fortune_points, 0),
        freeSpins: clampInteger(stateRow.free_spins, 0),
        spinIndex: clampInteger(stateRow.spin_index, 0),
        lifetimeClicks: clampInteger(stateRow.lifetime_clicks, 0),
        gems: toFiniteNumber(stateRow.gems, 0),
        ticketPrice: normalizeTicketPrice(stateRow.ticket_price, 25),
        loyalVisitors: Math.max(0, toFiniteNumber(stateRow.loyal_visitors, 0)),
        laboratoryUnlocked: clampInteger(stateRow.laboratory_unlocked, 0) > 0,
        laboratoryUnlockedAt: stateRow.laboratory_unlocked_at || null,
        hatcheryUnlocked: clampInteger(stateRow.hatchery_unlocked, 0) > 0,
        hatcheryUnlockedAt: stateRow.hatchery_unlocked_at || null,
        dinoGenes,
        labProjects,
        modifiedDinos,
        zooHistory,
        adBoosts,
        pendingAdBonus,
        adViewsCount: clampInteger(stateRow.ad_views_count, 0),
        magicBirdLastClaimedAt: stateRow.magic_bird_last_claimed_at || null,
        magicBirdClaimCount: clampInteger(stateRow.magic_bird_claim_count, 0),
        referralStats: {
          successfulInvites: clampInteger(stateRow.referral_successful_invites, 0),
          pendingInvites: clampInteger(stateRow.referral_pending_invites, 0),
          claimedMilestones: normalizeClaimedMilestones(parseJson(stateRow.claimed_invite_milestones_json, []))
        },
        antiCheat: normalizeAntiCheatState({
          clickChainStartedAt: stateRow.click_chain_started_at,
          lastClickAt: stateRow.last_click_at,
          suspiciousClickFlaggedAt: stateRow.suspicious_click_flagged_at,
          suspiciousClickChainSeconds: stateRow.suspicious_click_chain_seconds
        }),
        lastPassiveAt: stateRow.last_passive_at,
        updatedAt: stateRow.updated_at
      },
      inventory,
      dinoProgress,
      quests
    };
  }
  applyPassiveProgress(mutable, stamp = nowIso()) {
    const normalizedGenes = parseDinoGeneState(mutable.state.dinoGenes);
    mutable.state.dinoGenes = normalizedGenes;
    clearExpiredAdState(mutable.state, stamp);
    const activeAdBoosts = getActiveAdBoostSummary(mutable.state.adBoosts, stamp);
    const baseProduction = computeProductionBreakdown(mutable.inventory, mutable.dinoProgress, stamp, normalizedGenes, mutable.state.modifiedDinos);
    const productionPerSec = baseProduction.meatPerSec * activeAdBoosts.meatMultiplier;
    const fernProductionPerSec = baseProduction.fernsPerSec;
    const collection = buildDinoCollection(mutable.inventory, mutable.dinoProgress, stamp, normalizedGenes, mutable.state.modifiedDinos);
    const currentLoyalVisitors = Math.max(0, toFiniteNumber(mutable.state.loyalVisitors, 0));
    const currentZooEconomy = applyGemBoostToZooEconomy(
      computeZooEconomyStats(collection.totalAttractiveness, mutable.state.ticketPrice, currentLoyalVisitors),
      activeAdBoosts.gemsMultiplier
    );
    const previousPassiveAt = mutable.state.lastPassiveAt;
    const lastPassiveAt = Date.parse(previousPassiveAt || stamp);
    const currentStamp = Date.parse(stamp);

    if (!Number.isFinite(lastPassiveAt) || !Number.isFinite(currentStamp)) {
      mutable.state.lastPassiveAt = stamp;
      return { gainedMeat: 0, gainedFerns: 0, gainedGems: 0, productionPerSec, fernProductionPerSec, gemIncomePerSec: currentZooEconomy.gemIncomePerSec, zooEconomy: currentZooEconomy, previousPassiveAt };
    }

    const elapsedSeconds = Math.min(MAX_PASSIVE_SECONDS, Math.max(0, Math.floor((currentStamp - lastPassiveAt) / 1000)));

    if (elapsedSeconds <= 0) {
      mutable.state.lastPassiveAt = stamp;
      return { gainedMeat: 0, gainedFerns: 0, gainedGems: 0, productionPerSec, fernProductionPerSec, gemIncomePerSec: currentZooEconomy.gemIncomePerSec, zooEconomy: currentZooEconomy, previousPassiveAt };
    }

    const loyaltyProgress = advanceLoyalVisitors(
      currentLoyalVisitors,
      collection.totalAttractiveness,
      mutable.state.ticketPrice,
      elapsedSeconds,
      activeAdBoosts.loyalVisitorsMultiplier
    );
    const averageLoyalVisitors = (currentLoyalVisitors + loyaltyProgress.loyalVisitors) / 2;
    const economyForPassiveWindow = applyGemBoostToZooEconomy(
      computeZooEconomyStats(collection.totalAttractiveness, mutable.state.ticketPrice, averageLoyalVisitors),
      activeAdBoosts.gemsMultiplier
    );
    const zooEconomy = applyGemBoostToZooEconomy(
      computeZooEconomyStats(collection.totalAttractiveness, mutable.state.ticketPrice, loyaltyProgress.loyalVisitors),
      activeAdBoosts.gemsMultiplier
    );
    mutable.state.loyalVisitors = loyaltyProgress.loyalVisitors;

    const gainedMeat = productionPerSec > 0 ? (productionPerSec * elapsedSeconds) : 0;
    const gainedFerns = fernProductionPerSec > 0 ? (fernProductionPerSec * elapsedSeconds) : 0;
    const gainedGems = economyForPassiveWindow.gemIncomePerSec > 0 ? (economyForPassiveWindow.gemIncomePerSec * elapsedSeconds) : 0;

    if (gainedMeat > 0) {
      mutable.state.meat += gainedMeat;
      this.incrementQuestProgress(mutable.quests, "meat", gainedMeat);
      this.awardReferralCommission(mutable.player.telegram_user_id, gainedMeat, "passive_income", {
        elapsedSeconds,
        productionPerSec
      }, stamp);
    }

    if (gainedFerns > 0) {
      mutable.state.ferns = Math.max(0, mutable.state.ferns + Math.floor(gainedFerns));
      this.incrementQuestProgress(mutable.quests, "ferns", Math.floor(gainedFerns));
    }

    if (gainedGems > 0) {
      mutable.state.gems = Math.max(0, toFiniteNumber(mutable.state.gems, 0) + gainedGems);
    }

    mutable.state.lastPassiveAt = stamp;

    return { gainedMeat, gainedFerns: Math.floor(gainedFerns), gainedGems, productionPerSec, fernProductionPerSec, gemIncomePerSec: zooEconomy.gemIncomePerSec, zooEconomy, previousPassiveAt, elapsedSeconds };
  }
  scaleQuestRewardToProduction(quest, productionPerSec) {
    if (!quest?.reward?.meat) return quest;

    const reward = cloneReward(quest.reward);
    reward.meat = Math.max(
      Math.floor(Number(reward.meat || 0)),
      Math.floor(Math.max(0, Number(productionPerSec) || 0) * QUEST_MEAT_REWARD_SECONDS)
    );

    return {
      ...quest,
      reward
    };
  }

  incrementQuestProgress(quests, type, amount) {
    if (!amount) return;

    for (const quest of quests) {
      if (quest.type !== type || quest.progress >= quest.target) continue;
      quest.progress = Math.min(quest.target, quest.progress + amount);
    }
  }

  replaceInventory(telegramUserId, inventory, stamp) {
    this.db.prepare("DELETE FROM player_inventory WHERE telegram_user_id = ?").run(String(telegramUserId));
    const statement = this.db.prepare(
      "INSERT INTO player_inventory (telegram_user_id, item_id, quantity, updated_at) VALUES (?, ?, ?, ?)"
    );

    for (const [itemId, quantity] of Object.entries(inventory)) {
      const normalizedQuantity = clampInteger(quantity, 0);
      if (normalizedQuantity <= 0) continue;
      statement.run(String(telegramUserId), itemId, normalizedQuantity, stamp);
    }
  }

  replaceDinoProgress(telegramUserId, dinoProgress, inventory, stamp) {
    this.db.prepare("DELETE FROM player_dino_progress WHERE telegram_user_id = ?").run(String(telegramUserId));
    const statement = this.db.prepare(`
      INSERT INTO player_dino_progress (
        telegram_user_id,
        dino_id,
        first_acquired_at,
        last_acquired_at,
        instances_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const [dinoId, quantity] of Object.entries(inventory || {})) {
      const dino = getDinoById(dinoId);
      const normalizedQuantity = clampInteger(quantity, 0);
      if (!dino || normalizedQuantity <= 0) continue;
      const entry = normalizeDinoProgressEntry(dinoProgress?.[dinoId], dino, normalizedQuantity, stamp);
      statement.run(String(telegramUserId), dinoId, entry.firstAcquiredAt, entry.lastAcquiredAt, JSON.stringify(entry.instances), stamp);
    }
  }

  replaceQuests(telegramUserId, quests, stamp) {
    this.db.prepare("DELETE FROM player_quests WHERE telegram_user_id = ?").run(String(telegramUserId));
    const statement = this.db.prepare(`
      INSERT INTO player_quests (
        telegram_user_id,
        quest_id,
        type,
        title_template,
        title,
        level,
        target,
        progress,
        reward_json,
        link,
        sort_order,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const quest of quests) {
      statement.run(
        String(telegramUserId),
        quest.id,
        quest.type,
        quest.titleTemplate || "",
        quest.title,
        clampInteger(quest.level, 1),
        toFiniteNumber(quest.target, 0),
        toFiniteNumber(quest.progress, 0),
        serializeReward(quest.reward),
        quest.link || "",
        clampInteger(quest.sortOrder ?? questSortOrder(quest.id), 0),
        stamp
      );
    }
  }

  saveMutableState(telegramUserId, mutable, stamp = nowIso()) {
    const antiCheat = normalizeAntiCheatState(mutable.state.antiCheat);
    const normalizedGenes = parseDinoGeneState(mutable.state.dinoGenes);
    const normalizedLabProjects = parseLabProjectState(mutable.state.labProjects);
    const normalizedModifiedDinos = parseModifiedDinoState(mutable.state.modifiedDinos);
    const normalizedAdBoosts = normalizeAdBoosts(mutable.state.adBoosts);
    const normalizedPendingAdBonus = normalizePendingAdBonus(mutable.state.pendingAdBonus);
    mutable.state.antiCheat = antiCheat;
    mutable.state.dinoGenes = normalizedGenes;
    mutable.state.labProjects = normalizedLabProjects;
    mutable.state.modifiedDinos = normalizedModifiedDinos;
    mutable.state.adBoosts = normalizedAdBoosts;
    mutable.state.pendingAdBonus = normalizedPendingAdBonus;
    mutable.dinoProgress = Object.fromEntries(
      Object.entries(mutable.dinoProgress || {}).map(([dinoId, entry]) => {
        const dino = getDinoById(dinoId);
        const quantity = clampInteger(mutable.inventory?.[dinoId], 0);
        return [dinoId, normalizeDinoProgressEntry(entry, dino, quantity, stamp)];
      })
    );
    const collection = buildDinoCollection(mutable.inventory, mutable.dinoProgress, stamp, normalizedGenes, normalizedModifiedDinos);
    const productionPerSec = computeProductionPerSecond(mutable.inventory, mutable.dinoProgress, stamp, normalizedGenes, normalizedModifiedDinos);
    const zooEconomy = computeZooEconomyStats(collection.totalAttractiveness, mutable.state.ticketPrice, mutable.state.loyalVisitors);
    const normalizedZooHistory = recordZooHistory(mutable.state.zooHistory, stamp, collection.totalAttractiveness, zooEconomy, productionPerSec, mutable.state.ticketPrice);
    mutable.state.zooHistory = normalizedZooHistory;

    this.db.prepare(`
      UPDATE player_state SET
        meat = ?,
        click_power = ?,
        click_upgrades = ?,
        ferns = ?,
        total_purchases = ?,
        fortune_points = ?,
        free_spins = ?,
        spin_index = ?,
        lifetime_clicks = ?,
        gems = ?,
        ticket_price = ?,
        loyal_visitors = ?,
        laboratory_unlocked = ?,
        laboratory_unlocked_at = ?,
        hatchery_unlocked = ?,
        hatchery_unlocked_at = ?,
        dino_genes_json = ?,
        lab_projects_json = ?,
        modified_dinos_json = ?,
        zoo_history_json = ?,
        ad_boosts_json = ?,
        pending_ad_bonus_json = ?,
        ad_views_count = ?,
        magic_bird_last_claimed_at = ?,
        magic_bird_claim_count = ?,
        referral_successful_invites = ?,
        referral_pending_invites = ?,
        claimed_invite_milestones_json = ?,
        click_chain_started_at = ?,
        last_click_at = ?,
        suspicious_click_flagged_at = ?,
        suspicious_click_chain_seconds = ?,
        last_passive_at = ?,
        updated_at = ?
      WHERE telegram_user_id = ?
    `).run(
      toFiniteNumber(mutable.state.meat, 0),
      clampInteger(mutable.state.clickPower, 1),
      clampInteger(mutable.state.clickUpgrades, 0),
      clampInteger(mutable.state.ferns, 0),
      clampInteger(mutable.state.totalPurchases, 0),
      clampInteger(mutable.state.fortunePoints, 0),
      clampInteger(mutable.state.freeSpins, 0),
      clampInteger(mutable.state.spinIndex, 0),
      clampInteger(mutable.state.lifetimeClicks, 0),
      toFiniteNumber(mutable.state.gems, 0),
      normalizeTicketPrice(mutable.state.ticketPrice, 25),
      Math.max(0, toFiniteNumber(mutable.state.loyalVisitors, 0)),
      mutable.state.laboratoryUnlocked ? 1 : 0,
      mutable.state.laboratoryUnlockedAt || null,
      mutable.state.hatcheryUnlocked ? 1 : 0,
      mutable.state.hatcheryUnlockedAt || null,
      serializeDinoGeneState(normalizedGenes),
      serializeLabProjectState(normalizedLabProjects),
      serializeModifiedDinoState(normalizedModifiedDinos),
      serializeZooHistory(normalizedZooHistory),
      serializeAdBoosts(normalizedAdBoosts),
      serializePendingAdBonus(normalizedPendingAdBonus),
      clampInteger(mutable.state.adViewsCount, 0),
      mutable.state.magicBirdLastClaimedAt || null,
      clampInteger(mutable.state.magicBirdClaimCount, 0),
      clampInteger(mutable.state.referralStats?.successfulInvites, 0),
      clampInteger(mutable.state.referralStats?.pendingInvites, 0),
      JSON.stringify(normalizeClaimedMilestones(mutable.state.referralStats?.claimedMilestones)),
      antiCheat.clickChainStartedAt,
      antiCheat.lastClickAt,
      antiCheat.suspiciousClickFlaggedAt,
      antiCheat.suspiciousClickChainSeconds,
      mutable.state.lastPassiveAt || stamp,
      stamp,
      String(telegramUserId)
    );

    mutable.state.updatedAt = stamp;
    this.replaceInventory(telegramUserId, mutable.inventory, stamp);
    this.replaceDinoProgress(telegramUserId, mutable.dinoProgress, mutable.inventory, stamp);
    this.replaceQuests(telegramUserId, mutable.quests, stamp);
    this.db.prepare(
      "UPDATE players SET last_seen_at = ?, updated_at = ? WHERE telegram_user_id = ?"
    ).run(stamp, stamp, String(telegramUserId));
  }

  listExchangeOrders(telegramUserId, options = {}, stamp = nowIso()) {
    const includeClaimed = Boolean(options?.includeClaimed);
    const limit = clampInteger(options?.limit, includeClaimed ? 24 : 12);
    const rows = this.db.prepare(`
      SELECT
        order_id,
        route_id,
        route_name,
        route_description,
        image_key,
        resource_type,
        resource_amount,
        gem_reward,
        duration_hours,
        created_at,
        ready_at,
        claimed_at,
        updated_at
      FROM player_exchange_orders
      WHERE telegram_user_id = ?
        ${includeClaimed ? "" : "AND claimed_at IS NULL"}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(String(telegramUserId), limit);

    return rows.map((row) => buildExchangeOrderSnapshot(row, stamp));
  }

  buildMarketSnapshot(telegramUserId, stamp = nowIso()) {
    const activeOrders = this.listExchangeOrders(telegramUserId, { includeClaimed: false, limit: 18 }, stamp);
    const recentOrders = this.listExchangeOrders(telegramUserId, { includeClaimed: true, limit: 18 }, stamp);
    return {
      routes: MARKET_ROUTE_DEFS.map((route) => ({
        ...route,
        durationSeconds: Math.round(toFiniteNumber(route.durationHours, 0) * 3600)
      })),
      activeOrders,
      recentOrders,
      readyCount: activeOrders.filter((order) => order.ready).length
    };
  }

  buildSnapshot(mutable) {
    const normalizedGenes = parseDinoGeneState(mutable.state.dinoGenes);
    const normalizedLabProjects = parseLabProjectState(mutable.state.labProjects);
    const normalizedModifiedDinos = parseModifiedDinoState(mutable.state.modifiedDinos);
    const normalizedAdBoosts = normalizeAdBoosts(mutable.state.adBoosts);
    const normalizedPendingAdBonus = normalizePendingAdBonus(mutable.state.pendingAdBonus);
    mutable.state.dinoGenes = normalizedGenes;
    mutable.state.labProjects = normalizedLabProjects;
    mutable.state.modifiedDinos = normalizedModifiedDinos;
    mutable.state.adBoosts = normalizedAdBoosts;
    mutable.state.pendingAdBonus = normalizedPendingAdBonus;
    const snapshotStamp = nowIso();
    clearExpiredAdState(mutable.state, snapshotStamp);
    const activeAdBoosts = getActiveAdBoostSummary(mutable.state.adBoosts, snapshotStamp);
    const collection = buildDinoCollection(mutable.inventory, mutable.dinoProgress, snapshotStamp, normalizedGenes, normalizedModifiedDinos);
    const productionPerSec = computeProductionPerSecond(mutable.inventory, mutable.dinoProgress, snapshotStamp, normalizedGenes, normalizedModifiedDinos) * activeAdBoosts.meatMultiplier;
    const zooEconomy = applyGemBoostToZooEconomy(
      computeZooEconomyStats(collection.totalAttractiveness, mutable.state.ticketPrice, mutable.state.loyalVisitors),
      activeAdBoosts.gemsMultiplier
    );
    const zooHistory = recordZooHistory(mutable.state.zooHistory, snapshotStamp, collection.totalAttractiveness, zooEconomy, productionPerSec, mutable.state.ticketPrice);
    const zooHistorySeries = buildZooHistorySeries(zooHistory, snapshotStamp);
    const gemIncomePerSec = zooEconomy.gemIncomePerSec;
    const antiCheat = normalizeAntiCheatState(mutable.state.antiCheat);
    const referralSummary = this.loadReferredPlayers(mutable.player.telegram_user_id);
    const lifetimeMeatEarned = this.getLifetimeMeatEarned(mutable.player.telegram_user_id);
    const successfulPaymentsCount = this.getSuccessfulPaymentsCount(mutable.player.telegram_user_id);
    const products = this.listProducts();
    const pass = buildSeasonPassState({
      totalAttractiveness: collection.totalAttractiveness,
      totalPurchases: mutable.state.totalPurchases,
      clickUpgrades: mutable.state.clickUpgrades,
      successfulInvites: mutable.state.referralStats?.successfulInvites,
      productionPerSec
    });
    const starterOffer = this.getStarterOfferState(mutable.player.telegram_user_id, products);
    const elitePassOffer = this.getElitePassOfferState(mutable.player.telegram_user_id, products);
    const modifiedSpeciesCount = collection.totalModifiedCount || 0;
    const magicBird = getMagicBirdState(mutable.state.magicBirdLastClaimedAt, snapshotStamp);
    const productionBreakdown = computeProductionBreakdown(mutable.inventory, mutable.dinoProgress, snapshotStamp, normalizedGenes, normalizedModifiedDinos);
    const market = this.buildMarketSnapshot(mutable.player.telegram_user_id, snapshotStamp);

    return {
      telegramUser: {
        id: mutable.player.telegram_user_id,
        username: mutable.player.username,
        firstName: mutable.player.first_name,
        lastName: mutable.player.last_name,
        languageCode: mutable.player.language_code
      },
      state: {
        meat: toFiniteNumber(mutable.state.meat, 0),
        gems: toFiniteNumber(mutable.state.gems, 0),
        ticketPrice: normalizeTicketPrice(mutable.state.ticketPrice, 25),
        loyalVisitors: Math.max(0, toFiniteNumber(mutable.state.loyalVisitors, 0)),
        owned: { ...mutable.inventory },
        clickPower: clampInteger(mutable.state.clickPower, 1),
        clickUpgrades: clampInteger(mutable.state.clickUpgrades, 0),
        ferns: clampInteger(mutable.state.ferns, 0),
        totalPurchases: clampInteger(mutable.state.totalPurchases, 0),
        quests: mutable.quests.map((quest) => ({
          id: quest.id,
          type: quest.type,
          titleTemplate: quest.titleTemplate || "",
          title: quest.title,
          level: clampInteger(quest.level, 1),
          target: toFiniteNumber(quest.target, 0),
          progress: toFiniteNumber(quest.progress, 0),
          reward: cloneReward(quest.reward),
          ...(quest.link ? { link: quest.link } : {})
        })),
        fortunePoints: clampInteger(mutable.state.fortunePoints, 0),
        freeSpins: clampInteger(mutable.state.freeSpins, 0),
        laboratoryUnlocked: Boolean(mutable.state.laboratoryUnlocked),
        laboratoryUnlockedAt: mutable.state.laboratoryUnlockedAt || null,
        hatcheryUnlocked: Boolean(mutable.state.hatcheryUnlocked),
        hatcheryUnlockedAt: mutable.state.hatcheryUnlockedAt || null,
        dinoGenes: normalizedGenes,
        labProjects: normalizedLabProjects,
        modifiedDinos: normalizedModifiedDinos,
        zooHistory,
        pendingAdBonus: mutable.state.pendingAdBonus,
        referralStats: {
          successfulInvites: clampInteger(mutable.state.referralStats?.successfulInvites, 0),
          pendingInvites: clampInteger(mutable.state.referralStats?.pendingInvites, 0),
          claimedMilestones: normalizeClaimedMilestones(mutable.state.referralStats?.claimedMilestones)
        },
        antiCheat: {
          isSuspiciousClicker: Boolean(antiCheat.suspiciousClickFlaggedAt),
          flaggedAt: antiCheat.suspiciousClickFlaggedAt,
          lastClickAt: antiCheat.lastClickAt,
          clickChainStartedAt: antiCheat.clickChainStartedAt,
          currentContinuousClickSeconds: antiCheat.suspiciousClickChainSeconds,
          currentContinuousClickMinutes: Math.floor(antiCheat.suspiciousClickChainSeconds / 60)
        },
        userReferralCode: mutable.player.referral_code,
        spinIndex: clampInteger(mutable.state.spinIndex, 0),
        lifetimeClicks: clampInteger(mutable.state.lifetimeClicks, 0)
      },
      referral: {
        code: mutable.player.referral_code,
        referredByTelegramUserId: mutable.player.referred_by_telegram_user_id || "",
        referredByCode: mutable.player.referred_by_code || "",
        referredAt: mutable.player.referred_at || null,
        invitedPlayers: referralSummary.invitedPlayers,
        totalCommissionMeat: referralSummary.totalCommissionMeat
      },
      profileStats: {
        lifetimeMeatEarned,
        lifetimeClicks: clampInteger(mutable.state.lifetimeClicks, 0),
        successfulPaymentsCount,
        totalSpinsUsed: clampInteger(mutable.state.spinIndex, 0),
        totalDinosaursOwned: collection.totalCount,
        adViewsCount: clampInteger(mutable.state.adViewsCount, 0)
      },
      ads: {
        boosts: {
          meatMultiplier: activeAdBoosts.meatMultiplier,
          gemsMultiplier: activeAdBoosts.gemsMultiplier,
          loyalVisitorsMultiplier: activeAdBoosts.loyalVisitorsMultiplier,
          meatActiveUntil: activeAdBoosts.meatActiveUntil,
          gemsActiveUntil: activeAdBoosts.gemsActiveUntil,
          loyalVisitorsActiveUntil: activeAdBoosts.loyalVisitorsActiveUntil
        },
        pendingBonus: mutable.state.pendingAdBonus,
        totalViews: clampInteger(mutable.state.adViewsCount, 0)
      },
      events: {
        magicBird: {
          ...magicBird,
          claimCount: clampInteger(mutable.state.magicBirdClaimCount, 0)
        }
      },
      market,
      collection,
      laboratory: {
        unlocked: Boolean(mutable.state.laboratoryUnlocked),
        unlockedAt: mutable.state.laboratoryUnlockedAt || null,
        unlockCostGems: LABORATORY_UNLOCK_COST_GEMS,
        hatcheryUnlocked: Boolean(mutable.state.hatcheryUnlocked),
        hatcheryUnlockedAt: mutable.state.hatcheryUnlockedAt || null,
        hatcheryUnlockCostGems: HATCHERY_UNLOCK_COST_GEMS,
        modifiedSpeciesCount,
        eggCatalog: DINO_DEFS.filter((dino) => dino.meatPerSec > 0).map((dino) => ({
          id: dino.id,
          name: dino.name,
          rarity: dino.rarity,
          baseMeatPerSec: dino.meatPerSec,
          eggCostGems: getLabEggPrice(dino.id),
          blurb: dino.blurb || ""
        })),
        geneCatalog: DINO_GENE_DEFS.map((gene) => ({ ...gene })),
        genotypeCatalog: DINO_GENOTYPE_DEFS.map((trait) => ({ ...trait })),
        eggProjects: normalizedLabProjects.map((project) => ({
          ...project,
          incubation: getEggIncubationMeta(project, snapshotStamp),
          traitProfile: getDinoTraitProfile({
            geneIds: project.geneIds,
            genotypeIds: project.genotypeIds
          })
        })),
        speciesGenes: normalizedGenes
      },
      pass,
      offers: {
        starterSpin: starterOffer,
        elitePass: elitePassOffer
      },
      derived: {
        productionPerSec,
        fernProductionPerSec: productionBreakdown.fernsPerSec,
        productionBreakdown,
        gemIncomePerSec,
        ticketAttractivenessMultiplier: getTicketAttractivenessMultiplier(mutable.state.ticketPrice),
        zooEconomy,
        zooHistory: {
          points: zooHistorySeries,
          raw: zooHistory
        },
        totalSpins: clampInteger(mutable.state.fortunePoints, 0) + clampInteger(mutable.state.freeSpins, 0),
        clickUpgradePrice: getClickUpgradePrice(mutable.state.clickUpgrades),
        lastPassiveAt: mutable.state.lastPassiveAt,
        lastUpdatedAt: mutable.state.updatedAt || mutable.player.updated_at,
        totalAttractiveness: collection.totalAttractiveness,
        dinoCount: collection.totalCount,
        uniqueSpecies: collection.uniqueSpecies,
        adBoosts: {
          meatMultiplier: activeAdBoosts.meatMultiplier,
          gemsMultiplier: activeAdBoosts.gemsMultiplier,
          loyalVisitorsMultiplier: activeAdBoosts.loyalVisitorsMultiplier
        }
      },
      products
    };
  }
  getPlayerSnapshot(telegramUserId) {

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      const passive = this.applyPassiveProgress(mutable, stamp);

      if (passive.gainedMeat > 0 || passive.gainedFerns > 0) {
        this.logTransaction(String(telegramUserId), {
          type: "passive_income",
          source: "server",
          meat: passive.gainedMeat,
          ferns: passive.gainedFerns,
          metadata: {
            productionPerSec: passive.productionPerSec,
            fernProductionPerSec: passive.fernProductionPerSec || 0,
            previousPassiveAt: passive.previousPassiveAt,
            secondsApplied: passive.elapsedSeconds || 0
          },
          idempotencyKey: `passive:${telegramUserId}:${stamp}`
        });
      }

      this.saveMutableState(telegramUserId, mutable, stamp);
      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  assertPlayerProduct(productId) {
    const product = this.db.prepare(
      "SELECT * FROM shop_products WHERE product_id = ? AND active = 1"
    ).get(productId);

    if (!product) {
      throw new Error("Product not found.");
    }

    return product;
  }

  logTransaction(telegramUserId, entry) {
    const fields = rewardToLedgerFields(entry);

    this.db.prepare(`
      INSERT INTO transactions (
        telegram_user_id,
        type,
        amount_meat,
        amount_gems,
        amount_ferns,
        amount_free_spins,
        amount_fortune_points,
        item_id,
        item_count,
        source,
        metadata_json,
        idempotency_key,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(telegramUserId),
      entry.type,
      fields.meat,
      fields.gems,
      fields.ferns,
      fields.freeSpins,
      fields.fortunePoints,
      entry.itemId || "",
      clampInteger(entry.itemCount, 0),
      entry.source || "",
      JSON.stringify(entry.metadata || {}),
      entry.idempotencyKey || null,
      nowIso()
    );
  }

  logAudit(adminTelegramUserId, targetTelegramUserId, action, metadata = {}) {
    this.db.prepare(
      "INSERT INTO admin_audit_log (admin_telegram_user_id, target_telegram_user_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      String(adminTelegramUserId),
      String(targetTelegramUserId),
      action,
      JSON.stringify(metadata),
      nowIso()
    );
  }

  applyReward(mutable, reward = {}) {
    const normalized = rewardToLedgerFields(reward);
    mutable.state.meat = Math.max(0, mutable.state.meat + normalized.meat);
    mutable.state.gems = Math.max(0, toFiniteNumber(mutable.state.gems, 0) + normalized.gems);
    mutable.state.ferns = Math.max(0, mutable.state.ferns + normalized.ferns);
    mutable.state.freeSpins = Math.max(0, mutable.state.freeSpins + normalized.freeSpins);
    mutable.state.fortunePoints = Math.max(0, mutable.state.fortunePoints + normalized.fortunePoints);

    if (normalized.meat > 0) {
      this.incrementQuestProgress(mutable.quests, "meat", normalized.meat);
    }

    if (normalized.ferns > 0) {
      this.incrementQuestProgress(mutable.quests, "ferns", normalized.ferns);
    }

    return normalized;
  }

  tap(telegramUserId, count = 1) {
    const normalizedCount = Math.max(1, Math.min(100, clampInteger(count, 1)));

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);
      const antiCheat = this.updateContinuousClickState(mutable.state, stamp);

      const gainedMeat = mutable.state.clickPower * normalizedCount;
      mutable.state.meat += gainedMeat;
      mutable.state.lifetimeClicks = clampInteger(mutable.state.lifetimeClicks, 0) + normalizedCount;
      this.incrementQuestProgress(mutable.quests, "clicks", normalizedCount);
      this.incrementQuestProgress(mutable.quests, "meat", gainedMeat);
      const referralCommissionMeat = this.awardReferralCommission(telegramUserId, gainedMeat, "tap", {
        count: normalizedCount,
        clickPower: mutable.state.clickPower
      }, stamp);
      this.saveMutableState(telegramUserId, mutable, stamp);

      this.logTransaction(telegramUserId, {
        type: "tap",
        source: "game",
        meat: gainedMeat,
        metadata: {
          count: normalizedCount,
          clickPower: mutable.state.clickPower,
          referralCommissionMeat,
          continuousClickSeconds: antiCheat.suspiciousClickChainSeconds
        },
        idempotencyKey: `tap:${telegramUserId}:${stamp}:${normalizedCount}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  upgradeClick(telegramUserId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      const price = getClickUpgradePrice(mutable.state.clickUpgrades);
      if (mutable.state.meat < price) {
        throw new Error("Not enough meat for a click upgrade.");
      }

      mutable.state.meat -= price;
      mutable.state.clickUpgrades += 1;
      mutable.state.clickPower = Math.floor(mutable.state.clickPower * 1.6) + 1;
      this.incrementQuestProgress(mutable.quests, "upgrade", 1);
      this.saveMutableState(telegramUserId, mutable, stamp);

      this.logTransaction(telegramUserId, {
        type: "click_upgrade",
        source: "shop",
        meat: -price,
        metadata: {
          price,
          clickUpgrades: mutable.state.clickUpgrades,
          clickPower: mutable.state.clickPower
        },
        idempotencyKey: `upgrade:${telegramUserId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  purchaseDino(telegramUserId, itemId, requestedSex = "") {
    const targetDino = getDinoById(itemId);
    const targetPromotion = getPromotionById(itemId);

    if (!targetDino && !targetPromotion) {
      throw new Error("Shop item not found.");
    }

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      const purchaseSex = String(requestedSex || "").toLowerCase() === "female" ? "female" : "male";
      this.applyPassiveProgress(mutable, stamp);

      const ownedCount = clampInteger(mutable.inventory[itemId], 0);
      const isPromotion = Boolean(targetPromotion);
      const isUnique = !isPromotion && isUniqueDinoId(itemId);
      const price = isPromotion
        ? getPromotionPrice(targetPromotion.baseFernsCost, ownedCount)
        : isUnique
          ? getUniqueDinoPrice(targetDino.baseFernsCost, ownedCount)
          : getDinoPrice(targetDino.cost, ownedCount);
      const currency = (isPromotion || isUnique) ? "ferns" : "meat";

      if (currency === "ferns") {
        if (mutable.state.ferns < price) {
          throw new Error(isPromotion ? "Not enough ferns for this promotion." : "Not enough ferns for this dinosaur.");
        }
        mutable.state.ferns -= price;
      } else {
        if (mutable.state.meat < price) {
          throw new Error("Not enough meat for this dinosaur.");
        }
        mutable.state.meat -= price;
      }

      mutable.inventory[itemId] = ownedCount + 1;

      if (!isPromotion) {
        const currentEntry = normalizeDinoProgressEntry(mutable.dinoProgress[itemId], targetDino, ownedCount, stamp);
        mutable.dinoProgress[itemId] = normalizeDinoProgressEntry(
          {
            ...currentEntry,
            lastAcquiredAt: stamp,
            updatedAt: stamp,
            instances: [...currentEntry.instances, createPurchasedDinoInstance(targetDino, stamp, purchaseSex)]
          },
          targetDino,
          ownedCount + 1,
          stamp
        );
      }

      let grantedSpins = 0;
      let grantedBonusDino = null;
      const countsTowardPurchaseMilestone = !isPromotion;

      if (countsTowardPurchaseMilestone) {
        mutable.state.totalPurchases += 1;

        this.incrementQuestProgress(mutable.quests, "buy", 1);

        if (mutable.state.totalPurchases % 3 === 0) {
          mutable.state.freeSpins += 5;
          grantedSpins = 5;
        }

        if (mutable.state.totalPurchases % 15 === 0) {
          const eligibleBonusSpecies = Object.entries(mutable.inventory || {})
            .filter(([ownedId, quantity]) => clampInteger(quantity, 0) > 0 && getDinoById(ownedId))
            .map(([ownedId]) => getDinoById(ownedId))
            .filter(Boolean);

          if (eligibleBonusSpecies.length > 0) {
            const bonusDino = eligibleBonusSpecies[Math.floor(Math.random() * eligibleBonusSpecies.length)];
            const bonusSex = Math.random() < 0.5 ? "female" : "male";
            const bonusOwnedCount = clampInteger(mutable.inventory[bonusDino.id], 0);
            const bonusEntry = normalizeDinoProgressEntry(mutable.dinoProgress[bonusDino.id], bonusDino, bonusOwnedCount, stamp);

            mutable.inventory[bonusDino.id] = bonusOwnedCount + 1;
            mutable.dinoProgress[bonusDino.id] = normalizeDinoProgressEntry(
              {
                ...bonusEntry,
                lastAcquiredAt: stamp,
                updatedAt: stamp,
                instances: [...bonusEntry.instances, createPurchasedDinoInstance(bonusDino, stamp, bonusSex)]
              },
              bonusDino,
              bonusOwnedCount + 1,
              stamp
            );
            grantedBonusDino = {
              id: bonusDino.id,
              name: bonusDino.name,
              sex: bonusSex,
              rarity: bonusDino.rarity || "common"
            };
          }
        }
      }

      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: isPromotion ? "promotion_purchase" : "purchase",
        source: "shop",
        meat: currency === "meat" ? -price : 0,
        ferns: currency === "ferns" ? -price : 0,
        freeSpins: 0,
        itemId,
        itemCount: 1,
        metadata: {
          price,
          currency,
          grantedSpins,
          grantedBonusDino,
          sex: !isPromotion ? purchaseSex : "",
          unique: isUnique,
          promotion: isPromotion,
          itemKind: isPromotion ? "promotion" : (isUnique ? "unique_dino" : "dino")
        },
        idempotencyKey: `purchase:${telegramUserId}:${itemId}:${stamp}`
      });

      if (grantedSpins > 0 || grantedBonusDino) {
        this.logTransaction(telegramUserId, {
          type: "purchase_milestone",
          source: "shop",
          freeSpins: grantedSpins,
          itemId: grantedBonusDino?.id || null,
          itemCount: grantedBonusDino ? 1 : 0,
          metadata: {
            totalPurchases: mutable.state.totalPurchases,
            grantedSpins,
            grantedBonusDino
          },
          idempotencyKey: `purchase-milestone:${telegramUserId}:${mutable.state.totalPurchases}:${stamp}`
        });
      }

      mutable.player = this.getPlayerRow(telegramUserId);
      return {
        player: this.buildSnapshot(mutable),
        purchaseMilestone: (grantedSpins > 0 || grantedBonusDino)
          ? {
              totalPurchases: mutable.state.totalPurchases,
              spinsAwarded: grantedSpins,
              bonusDino: grantedBonusDino
            }
          : null
      };
    });
  }

  setTicketPrice(telegramUserId, ticketPrice) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      const normalizedTicketPrice = Math.max(5, Math.min(100, Math.round(toFiniteNumber(ticketPrice, mutable.state.ticketPrice || 25))));
      const previousTicketPrice = clampInteger(mutable.state.ticketPrice, 25);
      mutable.state.ticketPrice = normalizedTicketPrice;

      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "ticket_price_update",
        source: "zoo",
        metadata: {
          previousTicketPrice,
          ticketPrice: normalizedTicketPrice
        },
        idempotencyKey: `ticket-price:${telegramUserId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  createExchangeOrder(telegramUserId, routeId, resourceType, amount) {
    const route = getMarketRouteById(routeId);
    if (!route) {
      throw new Error("Exchange route not found.");
    }

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      const normalizedResourceType = normalizeMarketResourceType(resourceType);
      const normalizedAmount = normalizedResourceType === "ferns"
        ? clampInteger(amount, 0)
        : Math.max(0, Math.floor(toFiniteNumber(amount, 0)));

      if (normalizedAmount <= 0) {
        throw new Error("Pick an amount greater than zero.");
      }

      const available = normalizedResourceType === "ferns"
        ? clampInteger(mutable.state.ferns, 0)
        : Math.max(0, toFiniteNumber(mutable.state.meat, 0));

      if (normalizedAmount > available) {
        throw new Error(normalizedResourceType === "ferns"
          ? "Not enough ferns for this shipment."
          : "Not enough meat for this shipment.");
      }

      const gemReward = calculateExchangeGemReward(route, normalizedResourceType, normalizedAmount);
      const orderId = randomUUID();
      const durationHours = Math.max(0, toFiniteNumber(route.durationHours, 0));
      const readyAt = new Date((parseTimestampMs(stamp) || Date.now()) + (Math.round(durationHours * 3600) * 1000)).toISOString();
      const instantRoute = durationHours <= 0;

      if (normalizedResourceType === "ferns") {
        mutable.state.ferns = Math.max(0, clampInteger(mutable.state.ferns, 0) - normalizedAmount);
      } else {
        mutable.state.meat = Math.max(0, toFiniteNumber(mutable.state.meat, 0) - normalizedAmount);
      }

      this.db.prepare(`
        INSERT INTO player_exchange_orders (
          order_id,
          telegram_user_id,
          route_id,
          route_name,
          route_description,
          image_key,
          resource_type,
          resource_amount,
          gem_reward,
          duration_hours,
          created_at,
          ready_at,
          claimed_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        String(telegramUserId),
        route.id,
        route.name,
        route.description,
        route.imageKey || "",
        normalizedResourceType,
        normalizedAmount,
        gemReward,
        durationHours,
        stamp,
        readyAt,
        null,
        stamp
      );

      if (instantRoute) {
        mutable.state.gems = Math.max(0, toFiniteNumber(mutable.state.gems, 0) + gemReward);
        this.db.prepare(`
          UPDATE player_exchange_orders SET
            claimed_at = ?,
            updated_at = ?
          WHERE order_id = ? AND telegram_user_id = ?
        `).run(stamp, stamp, orderId, String(telegramUserId));
      }

      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "exchange_order_created",
        source: "market",
        meat: normalizedResourceType === "meat" ? -normalizedAmount : 0,
        ferns: normalizedResourceType === "ferns" ? -normalizedAmount : 0,
        metadata: {
          orderId,
          routeId: route.id,
          routeName: route.name,
          resourceType: normalizedResourceType,
          amount: normalizedAmount,
          gemReward,
          readyAt,
          instant: instantRoute
        },
        idempotencyKey: `exchange-create:${telegramUserId}:${orderId}`
      });

      if (instantRoute) {
        this.logTransaction(telegramUserId, {
          type: "exchange_order_claimed",
          source: "market",
          gems: gemReward,
          metadata: {
            orderId,
            routeId: route.id,
            routeName: route.name,
            resourceType: normalizedResourceType,
            amount: normalizedAmount,
            readyAt,
            instant: true
          },
          idempotencyKey: `exchange-claim:${telegramUserId}:${orderId}`
        });
      }

      mutable.player = this.getPlayerRow(telegramUserId);
      return {
        orderId,
        instant: instantRoute,
        player: this.buildSnapshot(mutable)
      };
    });
  }

  claimExchangeOrder(telegramUserId, orderId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      const row = this.db.prepare(`
        SELECT
          order_id,
          route_id,
          route_name,
          route_description,
          image_key,
          resource_type,
          resource_amount,
          gem_reward,
          duration_hours,
          created_at,
          ready_at,
          claimed_at,
          updated_at
        FROM player_exchange_orders
        WHERE order_id = ? AND telegram_user_id = ?
      `).get(String(orderId), String(telegramUserId));

      if (!row) {
        throw new Error("Exchange order not found.");
      }

      const snapshot = buildExchangeOrderSnapshot(row, stamp);
      if (snapshot.claimed) {
        throw new Error("This exchange order was already claimed.");
      }
      if (!snapshot.ready) {
        throw new Error("This shipment is still on the way.");
      }

      mutable.state.gems = Math.max(0, toFiniteNumber(mutable.state.gems, 0) + snapshot.gemReward);

      this.db.prepare(`
        UPDATE player_exchange_orders SET
          claimed_at = ?,
          updated_at = ?
        WHERE order_id = ? AND telegram_user_id = ?
      `).run(stamp, stamp, String(orderId), String(telegramUserId));

      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "exchange_order_claimed",
        source: "market",
        gems: snapshot.gemReward,
        metadata: {
          orderId: snapshot.orderId,
          routeId: snapshot.routeId,
          routeName: snapshot.title,
          resourceType: snapshot.resourceType,
          amount: snapshot.amount,
          readyAt: snapshot.readyAt
        },
        idempotencyKey: `exchange-claim:${telegramUserId}:${orderId}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return {
        orderId: snapshot.orderId,
        gemReward: snapshot.gemReward,
        player: this.buildSnapshot(mutable)
      };
    });
  }

  buyLaboratory(telegramUserId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      if (mutable.state.laboratoryUnlocked) {
        throw new Error("Laboratory is already unlocked.");
      }

      if (mutable.state.gems < LABORATORY_UNLOCK_COST_GEMS) {
        throw new Error("Not enough gems for the laboratory.");
      }

      mutable.state.gems -= LABORATORY_UNLOCK_COST_GEMS;
      mutable.state.laboratoryUnlocked = true;
      mutable.state.laboratoryUnlockedAt = stamp;
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "laboratory_unlock",
        source: "zoo",
        metadata: {
          costGems: LABORATORY_UNLOCK_COST_GEMS
        },
        idempotencyKey: `laboratory:${telegramUserId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  unlockHatchery(telegramUserId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      if (!mutable.state.laboratoryUnlocked) {
        throw new Error("Unlock the laboratory first.");
      }

      if (mutable.state.hatcheryUnlocked) {
        throw new Error("Hatchery is already unlocked.");
      }

      if (mutable.state.gems < HATCHERY_UNLOCK_COST_GEMS) {
        throw new Error("Not enough gems for the hatchery.");
      }

      mutable.state.gems -= HATCHERY_UNLOCK_COST_GEMS;
      mutable.state.hatcheryUnlocked = true;
      mutable.state.hatcheryUnlockedAt = stamp;
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "hatchery_unlock",
        source: "laboratory",
        metadata: {
          costGems: HATCHERY_UNLOCK_COST_GEMS
        },
        idempotencyKey: `hatchery:${telegramUserId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  createLabEgg(telegramUserId, dinoId, requestedSex = "") {
    const dino = getDinoById(dinoId);

    if (!dino || !(dino.meatPerSec > 0)) {
      throw new Error("This dinosaur cannot be grown as a laboratory egg.");
    }

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      const plannedSex = String(requestedSex || "").toLowerCase() === "female" ? "female" : "male";
      this.applyPassiveProgress(mutable, stamp);

      if (!mutable.state.laboratoryUnlocked) {
        throw new Error("Unlock the laboratory first.");
      }

      const price = getLabEggPrice(dinoId);
      if (mutable.state.gems < price) {
        throw new Error("Not enough gems for this laboratory egg.");
      }

      const incubationDurationSeconds = getEggIncubationDurationSeconds(dinoId, { hybrid: false });
      const incubationStartedAt = stamp;
      const incubationEndsAt = new Date((Date.parse(incubationStartedAt) || Date.now()) + (incubationDurationSeconds * 1000)).toISOString();
      mutable.state.gems -= price;
      mutable.state.labProjects = [
        ...parseLabProjectState(mutable.state.labProjects),
        {
          id: `egg_${randomUUID()}`,
          speciesId: dinoId,
          displayName: `${dino.name} Lab Egg`,
          sex: plannedSex,
          createdAt: stamp,
          source: "laboratory",
          geneIds: [],
          genotypeIds: [],
          iconId: dinoId,
          motherSpeciesId: "",
          fatherSpeciesId: "",
          hybrid: false,
          shellTint: "",
          incubationStartedAt,
          incubationEndsAt,
          incubationDurationSeconds
        }
      ];
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "lab_egg_purchase",
        source: "laboratory",
        gems: -price,
        metadata: {
          dinoId,
          sex: plannedSex,
          costGems: price
        },
        idempotencyKey: `lab-egg:${telegramUserId}:${dinoId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  installTraitOnProject(telegramUserId, projectId, traitId, kind = "gene") {
    const trait = kind === "genotype" ? getDinoGenotypeById(traitId) : getDinoGeneById(traitId);
    if (!trait) {
      throw new Error(kind === "genotype" ? "Genotype not found." : "Gene not found.");
    }

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      if (!mutable.state.laboratoryUnlocked) {
        throw new Error("Unlock the laboratory first.");
      }

      const projects = parseLabProjectState(mutable.state.labProjects);
      const projectIndex = projects.findIndex((entry) => entry.id === String(projectId));
      if (projectIndex < 0) {
        throw new Error("Egg project not found.");
      }

      const project = { ...projects[projectIndex] };
      const collectionKey = kind === "genotype" ? "genotypeIds" : "geneIds";
      const ownedIds = Array.isArray(project[collectionKey]) ? project[collectionKey] : [];
      if (ownedIds.includes(traitId)) {
        throw new Error(kind === "genotype" ? "This genotype is already installed on the egg." : "This gene is already installed on the egg.");
      }

      const price = Math.max(1, clampInteger(getTraitPriceForDino(traitId, project.motherSpeciesId || project.speciesId || project.fatherSpeciesId), 0));
      if (mutable.state.gems < price) {
        throw new Error(kind === "genotype" ? "Not enough gems for this genotype." : "Not enough gems for this gene.");
      }

      mutable.state.gems -= price;
      project[collectionKey] = [...ownedIds, traitId];
      project.shellTint = getDinoTraitProfile({
        geneIds: project.geneIds,
        genotypeIds: project.genotypeIds
      }).shellTint;
      projects[projectIndex] = project;
      mutable.state.labProjects = projects;
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: kind === "genotype" ? "genotype_install" : "gene_install",
        source: "laboratory",
        gems: -price,
        metadata: {
          projectId: project.id,
          speciesId: project.speciesId,
          traitId,
          traitName: trait.name,
          traitKind: kind,
          costGems: price
        },
        idempotencyKey: `${kind}:${telegramUserId}:${project.id}:${traitId}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  buyGene(telegramUserId, projectId, geneId) {
    return this.installTraitOnProject(telegramUserId, projectId, geneId, "gene");
  }

  buyGenotype(telegramUserId, projectId, genotypeId) {
    return this.installTraitOnProject(telegramUserId, projectId, genotypeId, "genotype");
  }

  breedDinosaurs(telegramUserId, motherSpeciesId, fatherSpeciesId) {
    const motherDino = getDinoById(motherSpeciesId);
    const fatherDino = getDinoById(fatherSpeciesId);

    if (!motherDino || !fatherDino) {
      throw new Error("Choose two valid dinosaurs for breeding.");
    }

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      if (!mutable.state.hatcheryUnlocked) {
        throw new Error("Unlock the hatchery before breeding dinosaurs.");
      }

      const motherEntry = normalizeDinoProgressEntry(mutable.dinoProgress[motherSpeciesId], motherDino, clampInteger(mutable.inventory[motherSpeciesId], 0), stamp);
      const fatherEntry = normalizeDinoProgressEntry(mutable.dinoProgress[fatherSpeciesId], fatherDino, clampInteger(mutable.inventory[fatherSpeciesId], 0), stamp);
      const motherFemales = motherEntry.instances.filter((entry) => entry.sex === "female").length;
      const fatherMales = fatherEntry.instances.filter((entry) => entry.sex === "male").length;

      if (motherFemales <= 0) {
        throw new Error("You need at least one female dinosaur for the mother slot.");
      }

      if (fatherMales <= 0) {
        throw new Error("You need at least one male dinosaur for the father slot.");
      }

      const price = getBreedingCost(motherSpeciesId, fatherSpeciesId);
      if (mutable.state.meat < price) {
        throw new Error("Not enough meat to encourage breeding.");
      }

      const hybrid = motherSpeciesId !== fatherSpeciesId;
      const offspringSpeciesId = hybrid ? buildHybridId(motherSpeciesId, fatherSpeciesId) : motherSpeciesId;
      const incubationDurationSeconds = getEggIncubationDurationSeconds(offspringSpeciesId, { hybrid, motherSpeciesId, fatherSpeciesId });
      const incubationStartedAt = stamp;
      const incubationEndsAt = new Date((Date.parse(incubationStartedAt) || Date.now()) + (incubationDurationSeconds * 1000)).toISOString();
      mutable.state.meat -= price;
      mutable.state.labProjects = [
        ...parseLabProjectState(mutable.state.labProjects),
        {
          id: `egg_${randomUUID()}`,
          speciesId: offspringSpeciesId,
          displayName: hybrid ? `${buildHybridName(motherSpeciesId, fatherSpeciesId)} Egg` : `${motherDino.name} Nest Egg`,
          sex: ((Date.parse(stamp) || 0) % 2 === 0) ? "female" : "male",
          createdAt: stamp,
          source: "breeding",
          geneIds: [],
          genotypeIds: [],
          iconId: motherSpeciesId,
          motherSpeciesId,
          fatherSpeciesId,
          hybrid,
          shellTint: "",
          incubationStartedAt,
          incubationEndsAt,
          incubationDurationSeconds
        }
      ];
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "breed_dino",
        source: "zoo",
        meat: -price,
        metadata: {
          motherSpeciesId,
          fatherSpeciesId,
          hybrid,
          costMeat: price
        },
        idempotencyKey: `breed:${telegramUserId}:${motherSpeciesId}:${fatherSpeciesId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  hatchProject(telegramUserId, projectId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      if (!mutable.state.hatcheryUnlocked) {
        throw new Error("Unlock the hatchery first.");
      }

      const projects = parseLabProjectState(mutable.state.labProjects);
      const projectIndex = projects.findIndex((entry) => entry.id === String(projectId));
      if (projectIndex < 0) {
        throw new Error("Egg project not found.");
      }

      const project = projects[projectIndex];
      const incubation = getEggIncubationMeta(project, stamp);
      if (!incubation.readyToHatch) {
        const remainingMinutes = Math.max(1, Math.ceil(incubation.remainingSeconds / 60));
        throw new Error(`This egg is still incubating. ${remainingMinutes} more min left.`);
      }
      const traitProfile = getDinoTraitProfile({
        geneIds: project.geneIds,
        genotypeIds: project.genotypeIds
      });
      const baseSpecies = getDinoById(project.motherSpeciesId || project.speciesId || project.fatherSpeciesId);
      const fatherSpecies = getDinoById(project.fatherSpeciesId);
      const motherSpecies = getDinoById(project.motherSpeciesId);

      if (!baseSpecies) {
        throw new Error("This egg no longer has a valid species definition.");
      }

      const shouldCreateModified = project.hybrid || traitProfile.totalTraits > 0;

      if (!shouldCreateModified) {
        const ownedCount = clampInteger(mutable.inventory[baseSpecies.id], 0);
        mutable.inventory[baseSpecies.id] = ownedCount + 1;
        const currentEntry = normalizeDinoProgressEntry(mutable.dinoProgress[baseSpecies.id], baseSpecies, ownedCount, stamp);
        mutable.dinoProgress[baseSpecies.id] = normalizeDinoProgressEntry({
          ...currentEntry,
          lastAcquiredAt: stamp,
          updatedAt: stamp,
          instances: [...currentEntry.instances, createPurchasedDinoInstance(baseSpecies, stamp, project.sex)]
        }, baseSpecies, ownedCount + 1, stamp);
      } else {
        const baseAdultProduction = project.hybrid
          ? (((motherSpecies?.meatPerSec || baseSpecies.meatPerSec || 1) + (fatherSpecies?.meatPerSec || baseSpecies.meatPerSec || 1)) / 2)
          : (baseSpecies.meatPerSec || 1);
        const baseAttractiveness = project.hybrid
          ? Math.round((((motherSpecies?.baseAttractiveness || baseSpecies.baseAttractiveness || 10) + (fatherSpecies?.baseAttractiveness || baseSpecies.baseAttractiveness || 10)) / 2) + 22)
          : (baseSpecies.baseAttractiveness || 10);
        const adultProduction = Math.max(1, Math.round(baseAdultProduction * traitProfile.productionMultiplier * (project.hybrid ? 1.45 : 1.28)));
        const modifiedBaseAttractiveness = Math.max(1, Math.round(baseAttractiveness * traitProfile.attractivenessMultiplier * (project.hybrid ? 1.55 : 1.35)));

        mutable.state.modifiedDinos = [
          ...parseModifiedDinoState(mutable.state.modifiedDinos),
          {
            id: `mod_${randomUUID()}`,
            speciesId: project.hybrid ? buildHybridId(project.motherSpeciesId, project.fatherSpeciesId) : baseSpecies.id,
            baseSpeciesId: baseSpecies.id,
            displayName: project.hybrid ? `${buildHybridName(project.motherSpeciesId, project.fatherSpeciesId)} Hybrid` : `${baseSpecies.name} Dreamline`,
            iconId: project.iconId || baseSpecies.id,
            rarity: project.hybrid ? "hybrid" : "modified",
            blurb: project.hybrid ? `${buildHybridName(project.motherSpeciesId, project.fatherSpeciesId)} is a bright hybrid hatch with extra wow-factor for kids and families.` : `${baseSpecies.name} Dreamline is a laboratory-crafted superstar with stronger output and brighter colors.`,
            adultProduction,
            baseAttractiveness: modifiedBaseAttractiveness,
            acquiredAt: stamp,
            updatedAt: stamp,
            sex: project.sex,
            geneIds: project.geneIds,
            genotypeIds: project.genotypeIds,
            source: project.source,
            hybrid: project.hybrid,
            motherSpeciesId: project.motherSpeciesId,
            fatherSpeciesId: project.fatherSpeciesId,
            shellTint: traitProfile.shellTint
          }
        ];
      }

      projects.splice(projectIndex, 1);
      mutable.state.labProjects = projects;
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "hatch_egg",
        source: "laboratory",
        metadata: {
          projectId: project.id,
          speciesId: project.speciesId,
          hybrid: project.hybrid,
          modified: shouldCreateModified,
          totalTraits: traitProfile.totalTraits
        },
        idempotencyKey: `hatch:${telegramUserId}:${project.id}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }
  spin(telegramUserId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);
      clearExpiredAdState(mutable.state, stamp);
      const activeAdBoosts = getActiveAdBoostSummary(mutable.state.adBoosts, stamp);

      let consumed = null;
      if (mutable.state.freeSpins > 0) {
        mutable.state.freeSpins -= 1;
        consumed = { freeSpins: -1, kind: "freeSpins" };
      } else if (mutable.state.fortunePoints > 0) {
        mutable.state.fortunePoints -= 1;
        consumed = { fortunePoints: -1, kind: "fortunePoints" };
      } else {
        throw new Error("You need at least one spin.");
      }

      const rewardEntry = getSpinReward(
        mutable.state.spinIndex,
        computeProductionPerSecond(mutable.inventory, mutable.dinoProgress, stamp, mutable.state.dinoGenes, mutable.state.modifiedDinos) * activeAdBoosts.meatMultiplier
      );
      const reward = rewardEntry?.reward || {};
      mutable.state.spinIndex += 1;
      if (rewardEntry?.id === "meat_60" && reward?.meat > 0) {
        mutable.state.pendingAdBonus = buildPendingFortuneAdBonus(reward.meat, mutable.state.spinIndex, stamp);
      } else {
        mutable.state.pendingAdBonus = normalizePendingAdBonus({});
      }
      const appliedReward = this.applyReward(mutable, reward);
      this.incrementQuestProgress(mutable.quests, "spins", 1);
      this.saveMutableState(telegramUserId, mutable, stamp);

      this.logTransaction(telegramUserId, {
        type: "spin",
        source: "wheel",
        meat: appliedReward.meat,
        ferns: appliedReward.ferns,
        freeSpins: (appliedReward.freeSpins || 0) + (consumed.freeSpins || 0),
        fortunePoints: (appliedReward.fortunePoints || 0) + (consumed.fortunePoints || 0),
        metadata: {
          reward,
          rewardId: rewardEntry?.id || null,
          consumed: consumed.kind
        },
        idempotencyKey: `spin:${telegramUserId}:${stamp}:${mutable.state.spinIndex}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return {
        reward: cloneReward(reward),
        rewardId: rewardEntry?.id || null,
        player: this.buildSnapshot(mutable)
      };
    });
  }

  claimQuest(telegramUserId, questId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      const inviteMilestone = findInviteMilestone(questId);
      if (inviteMilestone) {
        const successfulInvites = clampInteger(mutable.state.referralStats?.successfulInvites, 0);
        const claimedMilestones = normalizeClaimedMilestones(mutable.state.referralStats?.claimedMilestones);

        if (successfulInvites < inviteMilestone.target) {
          throw new Error("Invite milestone is not completed yet.");
        }

        if (claimedMilestones.includes(inviteMilestone.id)) {
          throw new Error("This invite milestone has already been claimed.");
        }

        const awardedReward = this.applyReward(mutable, inviteMilestone.reward);
        mutable.state.referralStats.claimedMilestones = [...claimedMilestones, inviteMilestone.id];
        this.saveMutableState(telegramUserId, mutable, stamp);
        this.logTransaction(telegramUserId, {
          type: "invite_claim",
          source: "referrals",
          meat: awardedReward?.meat || 0,
          ferns: awardedReward?.ferns || 0,
          freeSpins: awardedReward?.freeSpins || 0,
          fortunePoints: awardedReward?.fortunePoints || 0,
          metadata: { questId },
          idempotencyKey: `invite:${telegramUserId}:${questId}:${stamp}`
        });

        mutable.player = this.getPlayerRow(telegramUserId);
        return this.buildSnapshot(mutable);
      }

      const questIndex = mutable.quests.findIndex((quest) => quest.id === questId);
      if (questIndex < 0) {
        throw new Error("Quest not found.");
      }

      const quest = mutable.quests[questIndex];
      let awardedReward = null;

      if (quest.type === "social") {
        if (quest.progress >= quest.target) {
          throw new Error("This social quest has already been claimed.");
        }

        quest.progress = quest.target;
        awardedReward = this.applyReward(mutable, quest.reward);
      } else {
        if (quest.progress < quest.target) {
          throw new Error("Quest is not completed yet.");
        }

        awardedReward = this.applyReward(mutable, quest.reward);
        const nextLevel = quest.level + 1;
        const rebuilt = this.buildScaledQuest(quest.id, nextLevel, computeProductionPerSecond(mutable.inventory, mutable.dinoProgress, stamp, mutable.state.dinoGenes, mutable.state.modifiedDinos));
        rebuilt.sortOrder = quest.sortOrder;
        mutable.quests[questIndex] = rebuilt;
      }

      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "quest_claim",
        source: "quests",
        meat: awardedReward?.meat || 0,
        gems: awardedReward?.gems || 0,
        ferns: awardedReward?.ferns || 0,
        freeSpins: awardedReward?.freeSpins || 0,
        fortunePoints: awardedReward?.fortunePoints || 0,
        metadata: { questId },
        idempotencyKey: `quest:${telegramUserId}:${questId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  buildScaledQuest(questId, level, productionPerSec = 0) {
    const current = createInitialQuestState().find((entry) => entry.id === questId);

    if (!current) {
      throw new Error("Quest template not found.");
    }

    if (current.type === "social") {
      return {
        ...current,
        progress: 0,
        sortOrder: questSortOrder(current.id)
      };
    }

    const template = getQuestTemplateById(questId);
    if (!template) {
      return {
        ...current,
        sortOrder: questSortOrder(current.id)
      };
    }

    const scaledQuest = this.scaleQuestRewardToProduction(
      computeQuestFromTemplate(template, level),
      productionPerSec
    );

    return {
      ...scaledQuest,
      sortOrder: questSortOrder(questId)
    };
  }

  watchAdReward(telegramUserId, productId, context = {}) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const product = this.assertPlayerProduct(productId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);
      clearExpiredAdState(mutable.state, stamp);

      if (product.kind !== "ad") {
        throw new Error("This reward is not ad-backed.");
      }

      let reward = {};
      let metadata = {
        productId: product.product_id,
        rewardType: product.reward_type
      };

      if (product.product_id === AD_SPIN_PRODUCT_ID) {
        reward = { freeSpins: 3 };
      } else if (product.product_id === AD_MEAT_BOOST_PRODUCT_ID) {
        mutable.state.adBoosts.meat = extendAdBoost(mutable.state.adBoosts?.meat, AD_BOOST_MULTIPLIER, AD_BOOST_DURATION_SECONDS, stamp);
        metadata = {
          ...metadata,
          multiplier: AD_BOOST_MULTIPLIER,
          durationSeconds: AD_BOOST_DURATION_SECONDS,
          activeUntil: mutable.state.adBoosts.meat.activeUntil
        };
      } else if (product.product_id === AD_GEMS_BOOST_PRODUCT_ID) {
        mutable.state.adBoosts.gems = extendAdBoost(mutable.state.adBoosts?.gems, AD_BOOST_MULTIPLIER, AD_BOOST_DURATION_SECONDS, stamp);
        metadata = {
          ...metadata,
          multiplier: AD_BOOST_MULTIPLIER,
          durationSeconds: AD_BOOST_DURATION_SECONDS,
          activeUntil: mutable.state.adBoosts.gems.activeUntil
        };
      } else if (product.product_id === AD_LOYAL_VISITORS_BOOST_PRODUCT_ID) {
        mutable.state.adBoosts.loyalVisitors = extendAdBoost(mutable.state.adBoosts?.loyalVisitors, AD_BOOST_MULTIPLIER, AD_BOOST_DURATION_SECONDS, stamp);
        metadata = {
          ...metadata,
          multiplier: AD_BOOST_MULTIPLIER,
          durationSeconds: AD_BOOST_DURATION_SECONDS,
          activeUntil: mutable.state.adBoosts.loyalVisitors.activeUntil
        };
      } else if (product.product_id === AD_FORTUNE_MEAT_BONUS_PRODUCT_ID) {
        const pendingBonus = normalizePendingAdBonus(mutable.state.pendingAdBonus);
        if (pendingBonus.productId !== AD_FORTUNE_MEAT_BONUS_PRODUCT_ID || pendingBonus.rewardId !== "meat_60") {
          throw new Error("No 60 minute meat reward is waiting for an ad bonus.");
        }

        if (!isTimestampActive(pendingBonus.expiresAt, stamp)) {
          mutable.state.pendingAdBonus = normalizePendingAdBonus({});
          throw new Error("That fortune ad bonus has expired.");
        }

        const bonusMultiplier = Math.max(2, toFiniteNumber(pendingBonus.multiplier, AD_FORTUNE_MEAT_MULTIPLIER));
        reward = {
          meat: Math.max(0, Math.floor(pendingBonus.baseMeat * (bonusMultiplier - 1)))
        };
        mutable.state.pendingAdBonus = normalizePendingAdBonus({});
        metadata = {
          ...metadata,
          bonusMultiplier,
          baseMeat: pendingBonus.baseMeat,
          sourceSpinIndex: pendingBonus.sourceSpinIndex
        };
      } else {
        throw new Error("Unsupported ad reward.");
      }

      const appliedReward = this.applyReward(mutable, reward);
      mutable.state.adViewsCount = clampInteger(mutable.state.adViewsCount, 0) + 1;
      this.incrementQuestProgress(mutable.quests, "ads", 1);
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "ad_reward",
        source: "ads",
        meat: appliedReward.meat,
        gems: appliedReward.gems,
        ferns: appliedReward.ferns,
        freeSpins: appliedReward.freeSpins,
        fortunePoints: appliedReward.fortunePoints,
        metadata,
        idempotencyKey: `ad:${telegramUserId}:${product.product_id}:${stamp}:${mutable.state.adViewsCount}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return {
        productId: product.product_id,
        reward: cloneReward(appliedReward),
        player: this.buildSnapshot(mutable)
      };
    });
  }

  claimMagicBird(telegramUserId) {
    return this.withTransaction(() => {
      const mutable = this.loadMutableState(telegramUserId);
      const stamp = nowIso();
      const passive = this.applyPassiveProgress(mutable, stamp);
      const magicBirdState = getMagicBirdState(mutable.state.magicBirdLastClaimedAt, stamp);

      if (!magicBirdState.ready) {
        throw new Error(`Magic bird will come back in ${magicBirdState.remainingSeconds}s.`);
      }

      const productionPerSec = Math.max(0, Number(passive.productionPerSec || 0) || 0);
      const gemIncomePerSec = Math.max(0, Number(passive.gemIncomePerSec || 0) || 0);
      const offer = buildMagicBirdOffer({ productionPerSec, gemIncomePerSec });
      const appliedReward = this.applyReward(mutable, offer.reward);
      mutable.state.magicBirdLastClaimedAt = stamp;
      mutable.state.magicBirdClaimCount = clampInteger(mutable.state.magicBirdClaimCount, 0) + 1;
      this.saveMutableState(telegramUserId, mutable, stamp);
      this.logTransaction(telegramUserId, {
        type: "magic_bird",
        source: "events",
        meat: appliedReward.meat,
        gems: appliedReward.gems,
        ferns: appliedReward.ferns,
        freeSpins: appliedReward.freeSpins,
        fortunePoints: appliedReward.fortunePoints,
        metadata: {
          offerId: offer.id,
          title: offer.title,
          description: offer.description,
          reward: offer.reward
        },
        idempotencyKey: `magic-bird:${telegramUserId}:${stamp}`
      });

      mutable.player = this.getPlayerRow(telegramUserId);
      return {
        offer: {
          id: offer.id,
          title: offer.title,
          description: offer.description,
          reward: cloneReward(offer.reward),
          claimedAt: stamp,
          nextBirdAt: getMagicBirdState(stamp, stamp).nextAvailableAt
        },
        player: this.buildSnapshot(mutable)
      };
    });
  }

  createPaymentIntent(telegramUserId, productId, idempotencyKey = null) {
    return this.withTransaction(() => {
      this.loadMutableState(telegramUserId);
      const product = this.assertPlayerProduct(productId);
      if (product.kind === "ad") {
        throw new Error("Ad placements do not use invoice checkout.");
      }
      const paymentId = randomUUID();
      const stamp = nowIso();

      this.db.prepare(`
        INSERT INTO telegram_payments (
          payment_id,
          telegram_user_id,
          product_id,
          status,
          invoice_url,
          invoice_slug,
          external_charge_id,
          idempotency_key,
          reward_type,
          reward_amount,
          stars_price,
          raw_payload,
          granted_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        paymentId,
        String(telegramUserId),
        product.product_id,
        "pending",
        "",
        "",
        null,
        idempotencyKey || `invoice:${telegramUserId}:${productId}:${paymentId}`,
        product.reward_type,
        clampInteger(product.reward_amount, 0),
        clampInteger(product.stars_price, 0),
        "",
        null,
        stamp,
        stamp
      );

      return {
        paymentId,
        product: {
          id: product.product_id,
          kind: product.kind,
          title: product.title,
          description: product.description,
          rewardType: product.reward_type,
          rewardAmount: product.reward_amount,
          starsPrice: product.stars_price,
          priceAmount: product.stars_price,
          priceLabel: product.price_label,
          placement: product.placement,
          highlightText: product.highlight_text,
          currency: product.currency
        }
      };
    });
  }

  attachInvoiceToPayment(paymentId, invoiceData = {}) {
    const payment = this.db.prepare("SELECT * FROM telegram_payments WHERE payment_id = ?").get(paymentId);
    if (!payment) {
      throw new Error("Payment not found.");
    }

    const invoiceUrl = typeof invoiceData.invoiceUrl === "string" ? invoiceData.invoiceUrl : "";
    const invoiceSlug = typeof invoiceData.invoiceSlug === "string" ? invoiceData.invoiceSlug : "";
    const status = invoiceUrl ? "awaiting_payment" : payment.status;

    this.db.prepare(`
      UPDATE telegram_payments SET
        invoice_url = ?,
        invoice_slug = ?,
        status = ?,
        raw_payload = ?,
        updated_at = ?
      WHERE payment_id = ?
    `).run(
      invoiceUrl,
      invoiceSlug,
      status,
      JSON.stringify(invoiceData.rawPayload || {}),
      nowIso(),
      paymentId
    );

    return this.db.prepare("SELECT * FROM telegram_payments WHERE payment_id = ?").get(paymentId);
  }

  completePayment(callbackPayload = {}) {
    return this.withTransaction(() => {
      const paymentId = callbackPayload.paymentId || callbackPayload.payload || callbackPayload.invoice_payload;
      let payment = null;

      if (paymentId) {
        payment = this.db.prepare("SELECT * FROM telegram_payments WHERE payment_id = ?").get(String(paymentId));
      }

      if (!payment && callbackPayload.externalChargeId) {
        payment = this.db.prepare(
          "SELECT * FROM telegram_payments WHERE external_charge_id = ?"
        ).get(String(callbackPayload.externalChargeId));
      }

      if (!payment) {
        throw new Error("Payment not found.");
      }

      if (payment.granted_at) {
        const mutable = this.loadMutableState(payment.telegram_user_id);
        const stamp = nowIso();
        this.applyPassiveProgress(mutable, stamp);
        this.saveMutableState(payment.telegram_user_id, mutable, stamp);
        mutable.player = this.getPlayerRow(payment.telegram_user_id);

        return {
          alreadyGranted: true,
          paymentId: payment.payment_id,
          player: this.buildSnapshot(mutable)
        };
      }

      const externalChargeId = callbackPayload.externalChargeId || payment.external_charge_id || `dev-${payment.payment_id}`;
      const stamp = nowIso();
      this.db.prepare(`
        UPDATE telegram_payments SET
          status = ?,
          external_charge_id = ?,
          raw_payload = ?,
          granted_at = ?,
          updated_at = ?
        WHERE payment_id = ?
      `).run(
        "paid",
        externalChargeId,
        JSON.stringify(callbackPayload.rawPayload || callbackPayload),
        stamp,
        stamp,
        payment.payment_id
      );

      const mutable = this.loadMutableState(payment.telegram_user_id);
      this.applyPassiveProgress(mutable, stamp);
      const rewardAmount = clampInteger(payment.reward_amount, 0);
      const productionPerSec = computeProductionPerSecond(mutable.inventory, mutable.dinoProgress, stamp, mutable.state.dinoGenes, mutable.state.modifiedDinos);
      const resolvedReward = payment.reward_type === "meatHours"
        ? { meat: Math.max(STAR_MEAT_HOURS_MINIMUM, Math.floor(productionPerSec * 3600 * rewardAmount)) }
        : { [payment.reward_type]: rewardAmount };
      const appliedReward = this.applyReward(mutable, resolvedReward);
      this.saveMutableState(payment.telegram_user_id, mutable, stamp);
      this.logTransaction(payment.telegram_user_id, {
        type: "payment_grant",
        source: "payments",
        meat: appliedReward.meat,
        gems: appliedReward.gems,
        ferns: appliedReward.ferns,
        freeSpins: appliedReward.freeSpins,
        fortunePoints: appliedReward.fortunePoints,
        metadata: {
          paymentId: payment.payment_id,
          productId: payment.product_id,
          externalChargeId,
          rewardType: payment.reward_type,
          rewardAmount,
          resolvedReward,
          ...(payment.reward_type === "meatHours" ? { productionPerSec, hours: rewardAmount } : {})
        },
        idempotencyKey: `payment:${payment.payment_id}:grant`
      });

      mutable.player = this.getPlayerRow(payment.telegram_user_id);
      return {
        alreadyGranted: false,
        paymentId: payment.payment_id,
        player: this.buildSnapshot(mutable)
      };
    });
  }

  listPlayers(search = "", limit = DEFAULT_LIMIT) {
    const normalizedSearch = `%${String(search || "").trim()}%`;
    const rows = this.db.prepare(`
      SELECT
        p.telegram_user_id,
        p.username,
        p.first_name,
        p.last_name,
        p.last_seen_at,
        p.referral_code,
        p.referred_by_code,
        p.language_code,
        s.meat,
        s.gems,
        s.ferns,
        s.free_spins,
        s.fortune_points,
        s.total_purchases,
        s.referral_successful_invites,
        s.last_click_at,
        s.suspicious_click_flagged_at,
        s.suspicious_click_chain_seconds,
        s.updated_at
      FROM players p
      JOIN player_state s ON s.telegram_user_id = p.telegram_user_id
      WHERE
        (? = '%%')
        OR p.telegram_user_id LIKE ?
        OR p.username LIKE ?
        OR p.first_name LIKE ?
        OR p.last_name LIKE ?
      ORDER BY s.updated_at DESC
      LIMIT ?
    `).all(normalizedSearch, normalizedSearch, normalizedSearch, normalizedSearch, normalizedSearch, clampInteger(limit, DEFAULT_LIMIT));

    return rows.map((row) => ({
      telegramUserId: row.telegram_user_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
      referralCode: row.referral_code,
      referredByCode: row.referred_by_code,
      languageCode: normalizeLanguageCode(row.language_code),
      meat: toFiniteNumber(row.meat, 0),
      gems: toFiniteNumber(row.gems, 0),
      ferns: clampInteger(row.ferns, 0),
      freeSpins: clampInteger(row.free_spins, 0),
      fortunePoints: clampInteger(row.fortune_points, 0),
      totalPurchases: clampInteger(row.total_purchases, 0),
      successfulInvites: clampInteger(row.referral_successful_invites, 0),
      lastClickAt: row.last_click_at || null,
      flaggedAt: row.suspicious_click_flagged_at || null,
      currentContinuousClickMinutes: Math.floor(clampInteger(row.suspicious_click_chain_seconds, 0) / 60),
      isSuspiciousClicker: Boolean(row.suspicious_click_flagged_at)
    }));
  }

  getPlayerDetail(telegramUserId) {
    const player = this.getPlayerSnapshot(telegramUserId);
    const payments = this.db.prepare(`
      SELECT payment_id, product_id, status, reward_type, reward_amount, stars_price, invoice_url, external_charge_id, granted_at, created_at, updated_at
      FROM telegram_payments
      WHERE telegram_user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(String(telegramUserId)).map((row) => ({
      paymentId: row.payment_id,
      productId: row.product_id,
      status: row.status,
      rewardType: row.reward_type,
      rewardAmount: row.reward_amount,
      starsPrice: row.stars_price,
      invoiceUrl: row.invoice_url,
      externalChargeId: row.external_charge_id,
      grantedAt: row.granted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const transactions = this.db.prepare(`
      SELECT transaction_id, type, amount_meat, amount_gems, amount_ferns, amount_free_spins, amount_fortune_points, item_id, item_count, source, metadata_json, created_at
      FROM transactions
      WHERE telegram_user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(String(telegramUserId)).map((row) => ({
      transactionId: row.transaction_id,
      type: row.type,
      meat: toFiniteNumber(row.amount_meat, 0),
      gems: toFiniteNumber(row.amount_gems, 0),
      ferns: clampInteger(row.amount_ferns, 0),
      freeSpins: clampInteger(row.amount_free_spins, 0),
      fortunePoints: clampInteger(row.amount_fortune_points, 0),
      itemId: row.item_id,
      itemCount: clampInteger(row.item_count, 0),
      source: row.source,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at
    }));

    const referralSummary = this.loadReferredPlayers(telegramUserId);

    return {
      player,
      payments,
      transactions,
      referredPlayers: referralSummary.invitedPlayers
    };
  }

  getSuspiciousClickers(limit = DEFAULT_LIMIT) {
    const rows = this.db.prepare(`
      SELECT
        p.telegram_user_id,
        p.username,
        p.first_name,
        p.last_name,
        p.referral_code,
        s.meat,
        s.gems,
        s.ferns,
        s.free_spins,
        s.fortune_points,
        s.total_purchases,
        s.referral_successful_invites,
        s.last_click_at,
        s.suspicious_click_flagged_at,
        s.suspicious_click_chain_seconds,
        s.updated_at
      FROM players p
      JOIN player_state s ON s.telegram_user_id = p.telegram_user_id
      WHERE s.suspicious_click_flagged_at IS NOT NULL
      ORDER BY s.suspicious_click_flagged_at DESC, s.updated_at DESC
      LIMIT ?
    `).all(clampInteger(limit, DEFAULT_LIMIT));

    return rows.map((row) => ({
      telegramUserId: row.telegram_user_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      referralCode: row.referral_code,
      meat: toFiniteNumber(row.meat, 0),
      gems: toFiniteNumber(row.gems, 0),
      ferns: clampInteger(row.ferns, 0),
      freeSpins: clampInteger(row.free_spins, 0),
      fortunePoints: clampInteger(row.fortune_points, 0),
      totalPurchases: clampInteger(row.total_purchases, 0),
      successfulInvites: clampInteger(row.referral_successful_invites, 0),
      lastClickAt: row.last_click_at || null,
      flaggedAt: row.suspicious_click_flagged_at || null,
      currentContinuousClickMinutes: Math.floor(clampInteger(row.suspicious_click_chain_seconds, 0) / 60),
      isSuspiciousClicker: true,
      updatedAt: row.updated_at
    }));
  }

  getLeaderboard(limit = 20) {
    const rows = this.db.prepare(`
      SELECT
        p.telegram_user_id,
        p.username,
        p.first_name,
        p.last_name,
        p.referral_code,
        s.meat,
        s.gems,
        s.ferns,
        s.free_spins,
        s.fortune_points,
        s.total_purchases,
        s.referral_successful_invites,
        s.dino_genes_json,
        s.modified_dinos_json,
        s.updated_at
      FROM players p
      JOIN player_state s ON s.telegram_user_id = p.telegram_user_id
    `).all();

    const inventoryStatement = this.db.prepare(
      "SELECT item_id, quantity FROM player_inventory WHERE telegram_user_id = ? AND quantity > 0"
    );
    const dinoProgressStatement = this.db.prepare(
      "SELECT dino_id, first_acquired_at, last_acquired_at, instances_json, updated_at FROM player_dino_progress WHERE telegram_user_id = ?"
    );

    return rows
      .map((row) => {
        const inventoryRows = inventoryStatement.all(String(row.telegram_user_id));
        const inventory = Object.fromEntries(
          inventoryRows.map((item) => [item.item_id, clampInteger(item.quantity, 0)])
        );
        const dinoProgressRows = dinoProgressStatement.all(String(row.telegram_user_id));
        const dinoProgress = Object.fromEntries(
          dinoProgressRows.map((item) => {
            const itemId = String(item.dino_id);
            const dino = getDinoById(itemId);
            const quantity = clampInteger(inventory[itemId], 0);
            return [itemId, normalizeDinoProgressEntry({
              firstAcquiredAt: item.first_acquired_at,
              lastAcquiredAt: item.last_acquired_at,
              updatedAt: item.updated_at,
              instances: parseJson(item.instances_json, [])
            }, dino, quantity, row.updated_at || nowIso())];
          })
        );
        const dinoGenes = parseDinoGeneState(row.dino_genes_json);
        const modifiedDinos = parseModifiedDinoState(row.modified_dinos_json);
        const productionPerSec = computeProductionPerSecond(inventory, dinoProgress, nowIso(), dinoGenes, modifiedDinos);
        const collection = buildDinoCollection(inventory, dinoProgress, nowIso(), dinoGenes, modifiedDinos);

        return {
          telegramUserId: row.telegram_user_id,
          username: row.username,
          firstName: row.first_name,
          lastName: row.last_name,
          referralCode: row.referral_code,
          meat: toFiniteNumber(row.meat, 0),
          ferns: clampInteger(row.ferns, 0),
          freeSpins: clampInteger(row.free_spins, 0),
          fortunePoints: clampInteger(row.fortune_points, 0),
          totalPurchases: clampInteger(row.total_purchases, 0),
          successfulInvites: clampInteger(row.referral_successful_invites, 0),
          productionPerSec,
          totalAttractiveness: collection.totalAttractiveness,
          modifiedSpeciesCount: Object.keys(dinoGenes).length,
          updatedAt: row.updated_at
        };
      })
      .sort((left, right) => {
        if (right.productionPerSec !== left.productionPerSec) return right.productionPerSec - left.productionPerSec;
        if (right.totalAttractiveness !== left.totalAttractiveness) return right.totalAttractiveness - left.totalAttractiveness;
        if (right.totalPurchases !== left.totalPurchases) return right.totalPurchases - left.totalPurchases;
        if (right.meat !== left.meat) return right.meat - left.meat;
        return right.successfulInvites - left.successfulInvites;
      })
      .slice(0, clampInteger(limit, 20))
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
  }
  grantResources(adminTelegramUserId, payload = {}) {
    const targetTelegramUserId = String(payload.telegramUserId || "").trim();
    if (!targetTelegramUserId) {
      throw new Error("Target player is required.");
    }

    const requestedReward = {
      meat: toFiniteNumber(payload.meat, 0),
      gems: toFiniteNumber(payload.gems, 0),
      ferns: toInteger(payload.ferns, 0),
      freeSpins: toInteger(payload.freeSpins, 0),
      fortunePoints: toInteger(payload.fortunePoints, 0)
    };

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(targetTelegramUserId);
      const stamp = nowIso();
      this.applyPassiveProgress(mutable, stamp);

      const before = {
        meat: mutable.state.meat,
        gems: mutable.state.gems,
        ferns: mutable.state.ferns,
        freeSpins: mutable.state.freeSpins,
        fortunePoints: mutable.state.fortunePoints
      };

      mutable.state.meat = Math.max(0, mutable.state.meat + requestedReward.meat);
      mutable.state.gems = Math.max(0, toFiniteNumber(mutable.state.gems, 0) + requestedReward.gems);
      mutable.state.ferns = Math.max(0, mutable.state.ferns + requestedReward.ferns);
      mutable.state.freeSpins = Math.max(0, mutable.state.freeSpins + requestedReward.freeSpins);
      mutable.state.fortunePoints = Math.max(0, mutable.state.fortunePoints + requestedReward.fortunePoints);

      const appliedReward = {
        meat: mutable.state.meat - before.meat,
        gems: mutable.state.gems - before.gems,
        ferns: mutable.state.ferns - before.ferns,
        freeSpins: mutable.state.freeSpins - before.freeSpins,
        fortunePoints: mutable.state.fortunePoints - before.fortunePoints
      };

      this.saveMutableState(targetTelegramUserId, mutable, stamp);
      this.logTransaction(targetTelegramUserId, {
        type: "admin_grant",
        source: "admin",
        meat: appliedReward.meat,
        gems: appliedReward.gems,
        ferns: appliedReward.ferns,
        freeSpins: appliedReward.freeSpins,
        fortunePoints: appliedReward.fortunePoints,
        metadata: {
          adminTelegramUserId: String(adminTelegramUserId),
          reason: payload.reason || "manual_adjustment"
        },
        idempotencyKey: payload.idempotencyKey || `admin-grant:${adminTelegramUserId}:${targetTelegramUserId}:${stamp}`
      });
      this.logAudit(adminTelegramUserId, targetTelegramUserId, "grant_resources", {
        reward: appliedReward,
        reason: payload.reason || "manual_adjustment"
      });

      mutable.player = this.getPlayerRow(targetTelegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  resetPlayer(adminTelegramUserId, payload = {}) {
    const targetTelegramUserId = String(payload.telegramUserId || "").trim();
    const scope = String(payload.scope || "all").trim() || "all";

    if (!targetTelegramUserId) {
      throw new Error("Target player is required.");
    }

    return this.withTransaction(() => {
      const mutable = this.loadMutableState(targetTelegramUserId);
      const stamp = nowIso();
      const initialScalars = createInitialScalarState();

      if (scope === "all") {
        mutable.state.meat = initialScalars.meat;
        mutable.state.clickPower = initialScalars.clickPower;
        mutable.state.clickUpgrades = initialScalars.clickUpgrades;
        mutable.state.ferns = initialScalars.ferns;
        mutable.state.totalPurchases = initialScalars.totalPurchases;
        mutable.state.fortunePoints = initialScalars.fortunePoints;
        mutable.state.freeSpins = initialScalars.freeSpins;
        mutable.state.spinIndex = initialScalars.spinIndex;
        mutable.state.lifetimeClicks = 0;
        mutable.state.gems = initialScalars.gems;
        mutable.state.ticketPrice = initialScalars.ticketPrice;
        mutable.state.loyalVisitors = initialScalars.loyalVisitors;
        mutable.state.laboratoryUnlocked = false;
        mutable.state.laboratoryUnlockedAt = null;
        mutable.state.hatcheryUnlocked = false;
        mutable.state.hatcheryUnlockedAt = null;
        mutable.state.dinoGenes = {};
        mutable.state.labProjects = [];
        mutable.state.modifiedDinos = [];
        mutable.state.adBoosts = {};
        mutable.state.pendingAdBonus = {};
        mutable.state.adViewsCount = 0;
        mutable.state.magicBirdLastClaimedAt = null;
        mutable.state.magicBirdClaimCount = 0;
        mutable.inventory = createInitialInventory();
        mutable.dinoProgress = createInitialDinoProgress(mutable.inventory, stamp);
        mutable.quests = createInitialQuestState().map((quest) => {
          const scaledQuest = this.scaleQuestRewardToProduction(quest, computeProductionPerSecond(mutable.inventory, mutable.dinoProgress, stamp, mutable.state.dinoGenes, mutable.state.modifiedDinos));
          return {
            ...scaledQuest,
            sortOrder: questSortOrder(quest.id)
          };
        });
      } else if (scope === "quests") {
        mutable.quests = createInitialQuestState().map((quest) => {
          const scaledQuest = this.scaleQuestRewardToProduction(quest, computeProductionPerSecond(mutable.inventory, mutable.dinoProgress, stamp, mutable.state.dinoGenes, mutable.state.modifiedDinos));
          return {
            ...scaledQuest,
            sortOrder: questSortOrder(quest.id)
          };
        });
      } else if (scope === "wallet") {
        mutable.state.meat = initialScalars.meat;
        mutable.state.ferns = initialScalars.ferns;
        mutable.state.fortunePoints = initialScalars.fortunePoints;
        mutable.state.freeSpins = initialScalars.freeSpins;
        mutable.state.gems = initialScalars.gems;
        mutable.state.ticketPrice = initialScalars.ticketPrice;
        mutable.state.loyalVisitors = initialScalars.loyalVisitors;
        mutable.state.laboratoryUnlocked = false;
        mutable.state.laboratoryUnlockedAt = null;
        mutable.state.hatcheryUnlocked = false;
        mutable.state.hatcheryUnlockedAt = null;
        mutable.state.dinoGenes = {};
        mutable.state.labProjects = [];
        mutable.state.modifiedDinos = [];
        mutable.state.adBoosts = {};
        mutable.state.pendingAdBonus = {};
        mutable.state.magicBirdLastClaimedAt = null;
        mutable.state.magicBirdClaimCount = 0;
      } else {
        throw new Error("Unsupported reset scope.");
      }

      mutable.state.lastPassiveAt = stamp;
      this.saveMutableState(targetTelegramUserId, mutable, stamp);
      this.logTransaction(targetTelegramUserId, {
        type: "admin_reset",
        source: "admin",
        metadata: {
          adminTelegramUserId: String(adminTelegramUserId),
          scope,
          reason: payload.reason || "manual_reset"
        },
        idempotencyKey: payload.idempotencyKey || `admin-reset:${adminTelegramUserId}:${targetTelegramUserId}:${scope}:${stamp}`
      });
      this.logAudit(adminTelegramUserId, targetTelegramUserId, "reset_player", {
        scope,
        reason: payload.reason || "manual_reset"
      });

      mutable.player = this.getPlayerRow(targetTelegramUserId);
      return this.buildSnapshot(mutable);
    });
  }

  getAuditLog(limit = DEFAULT_LIMIT) {
    return this.db.prepare(`
      SELECT audit_id, admin_telegram_user_id, target_telegram_user_id, action, metadata_json, created_at
      FROM admin_audit_log
      ORDER BY created_at DESC
      LIMIT ?
    `).all(clampInteger(limit, DEFAULT_LIMIT)).map((row) => ({
      auditId: row.audit_id,
      adminTelegramUserId: row.admin_telegram_user_id,
      targetTelegramUserId: row.target_telegram_user_id,
      action: row.action,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at
    }));
  }
}





































