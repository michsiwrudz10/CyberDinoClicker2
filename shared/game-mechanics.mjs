import {
  BREEDING_BASE_COST_MEAT,
  DINO_DEFS,
  DINO_GENE_DEFS,
  DINO_GENOTYPE_DEFS,
  DINO_GROWTH_STAGES,
  FERN_DINOS,
  LAB_EGG_BASE_COST_GEMS,
  PASS_LEVELS_PER_ERA,
  QUEST_TEMPLATES,
  SEASON_PASS_LEVELS,
  SOCIAL_QUESTS,
  ZOO_ERA_START_LEVELS,
  ZOO_ERAS,
  ZOO_PROMOTIONS
} from "./game-content.mjs";

const REFERRAL_CODE_LENGTH = 9;
export const ADULT_GROWTH_SECONDS = 48 * 60 * 60;
export const DINO_SEXES = Object.freeze(["female", "male"]);
const ALL_DINOS = [...DINO_DEFS, ...FERN_DINOS];
const ALL_DINO_MAP = new Map(ALL_DINOS.map((dino) => [dino.id, dino]));
const ALL_PROMOTION_MAP = new Map(ZOO_PROMOTIONS.map((promotion) => [promotion.id, promotion]));
const ALL_GENE_MAP = new Map(DINO_GENE_DEFS.map((gene) => [gene.id, gene]));
const ALL_GENOTYPE_MAP = new Map(DINO_GENOTYPE_DEFS.map((trait) => [trait.id, trait]));
function getEraWindowByOrder(order = 1) {
  const normalizedOrder = Math.max(1, Math.min(ZOO_ERAS.length, Number(order) || 1));
  const startLevel = ZOO_ERA_START_LEVELS[normalizedOrder - 1] || 1;
  const defaultSpan = normalizedOrder <= 3 ? [14, 15, 20][normalizedOrder - 1] || 20 : 20;
  const nextStartLevel = ZOO_ERA_START_LEVELS[normalizedOrder] || (startLevel + defaultSpan);
  return {
    startLevel,
    nextStartLevel,
    span: Math.max(1, nextStartLevel - startLevel)
  };
}

function getEraProgressFromAbsoluteLevel(absoluteLevel = 1) {
  const normalizedLevel = Math.max(1, Math.floor(Number(absoluteLevel) || 1));
  let currentEraOrder = 1;

  for (let index = 0; index < ZOO_ERA_START_LEVELS.length; index += 1) {
    if (normalizedLevel >= ZOO_ERA_START_LEVELS[index]) {
      currentEraOrder = index + 1;
      continue;
    }
    break;
  }

  const window = getEraWindowByOrder(currentEraOrder);
  return {
    currentEraOrder,
    eraLevel: Math.max(1, normalizedLevel - window.startLevel + 1),
    levelsPerEra: window.span,
    nextEraStartLevel: currentEraOrder < ZOO_ERAS.length ? window.nextStartLevel : null,
    currentEraStartLevel: window.startLevel
  };
}

function randomDigit() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return String(values[0] % 10);
  }

  return String(Math.floor(Math.random() * 10));
}

function parseTimestampMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function hashSeed(seed = "") {
  const raw = String(seed || "");
  let total = 0;
  for (let index = 0; index < raw.length; index += 1) {
    total = (total + (raw.charCodeAt(index) * (index + 1))) % 9973;
  }
  return total;
}

function normalizeSex(value, fallbackSeed = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "female" || raw === "male") return raw;
  return hashSeed(fallbackSeed) % 2 === 0 ? "female" : "male";
}

function buildLabBlurb(name, hybrid = false) {
  if (hybrid) {
    return `A custom hybrid line grown in your laboratory hatchery. This specimen is flashy, powerful and made to wow young zoo fans.`;
  }

  return `A custom laboratory egg from ${name}. Built to be brighter, stronger and much more exciting than a natural hatch.`;
}

const FEMALE_NAME_POOL = ["Luna", "Ruby", "Nova", "Mimi", "Poppy", "Daisy", "Sunny", "Coco", "Pearl", "Skye", "Nala", "Zara"];
const MALE_NAME_POOL = ["Rex", "Milo", "Rocky", "Dash", "Bongo", "Leo", "Toby", "Max", "Comet", "Blaze", "Atlas", "Jax"];
const NAME_TITLES = ["Spark", "Stomp", "Roar", "Flash", "Bloom", "Star", "Bounce", "Fang", "Glow", "Zoom"];
const RARITY_INCUBATION_SECONDS = Object.freeze({
  common: 10 * 60,
  uncommon: 14 * 60,
  rare: 18 * 60,
  epic: 26 * 60,
  legendary: 34 * 60,
  mythic: 48 * 60,
  unique: 62 * 60,
  hybrid: 72 * 60
});
const RARITY_WEIGHT = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  mythic: 6,
  unique: 7,
  hybrid: 8
});

function buildDinoNickname(speciesName = "Dino", sex = "male", seed = "") {
  const normalizedSex = normalizeSex(sex, seed);
  const firstPool = normalizedSex === "female" ? FEMALE_NAME_POOL : MALE_NAME_POOL;
  const hash = hashSeed(`${speciesName}:${normalizedSex}:${seed}`);
  const first = firstPool[hash % firstPool.length];
  const suffix = NAME_TITLES[Math.floor(hash / firstPool.length) % NAME_TITLES.length];
  return `${first} ${suffix}`;
}

function normalizeDinoInstance(dino, instance = {}, fallbackStamp) {
  const acquiredAt = instance.acquiredAt || fallbackStamp;
  const sex = normalizeSex(instance.sex, `${dino?.id || 'dino'}:${acquiredAt}:${instance.sequence || ''}`);
  return {
    acquiredAt,
    updatedAt: instance.updatedAt || fallbackStamp,
    adultProduction: Math.max(0, Number(instance.adultProduction ?? dino?.meatPerSec ?? 0) || 0),
    sex,
    nickname: String(instance.nickname || buildDinoNickname(dino?.name || "Dino", sex, `${dino?.id || 'dino'}:${acquiredAt}:${instance.sequence || ''}`))
  };
}

function buildFallbackInstances(dino, quantity, progress = {}, fallbackStamp) {
  return Array.from({ length: Math.max(0, quantity) }, (_, index) => normalizeDinoInstance(dino, {
    acquiredAt: progress.firstAcquiredAt || progress.lastAcquiredAt || fallbackStamp,
    adultProduction: dino?.meatPerSec || 0,
    sequence: index + 1
  }, fallbackStamp));
}

function getProgressInstances(dino, quantity, progress = {}, fallbackStamp) {
  const rawInstances = Array.isArray(progress?.instances) ? progress.instances : [];
  let instances = rawInstances.map((instance, index) => normalizeDinoInstance(dino, { ...instance, sequence: index + 1 }, fallbackStamp));

  if (instances.length < quantity) {
    instances = instances.concat(buildFallbackInstances(dino, quantity - instances.length, progress, fallbackStamp));
  }

  if (instances.length > quantity) {
    instances = instances.slice(0, quantity);
  }

  return instances;
}

function normalizeGeneIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "")).filter((entry) => ALL_GENE_MAP.has(entry)))];
}

function normalizeGenotypeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "")).filter((entry) => ALL_GENOTYPE_MAP.has(entry)))];
}

export function normalizeDinoGenes(geneState = {}) {
  const normalized = {};

  for (const [dinoId, rawGeneIds] of Object.entries(geneState || {})) {
    if (!ALL_DINO_MAP.has(dinoId)) continue;
    const geneIds = normalizeGeneIds(rawGeneIds);
    if (!geneIds.length) continue;
    normalized[dinoId] = geneIds;
  }

  return normalized;
}

export function normalizeDinoGenotypes(genotypeIds = []) {
  return normalizeGenotypeIds(genotypeIds);
}

export function getDinoGeneById(geneId) {
  return ALL_GENE_MAP.get(geneId) || null;
}

export function getDinoGenotypeById(genotypeId) {
  return ALL_GENOTYPE_MAP.get(genotypeId) || null;
}

export function getDinoGeneProfile(dinoId, geneState = {}) {
  const normalizedGenes = normalizeDinoGenes(geneState);
  const geneIds = normalizedGenes[dinoId] || [];
  const genes = geneIds.map((geneId) => getDinoGeneById(geneId)).filter(Boolean);
  const productionMultiplier = genes.reduce((sum, gene) => sum + Math.max(0, Number(gene.meatMultiplier) || 0), 1);
  const attractivenessMultiplier = genes.reduce((sum, gene) => sum + Math.max(0, Number(gene.attractivenessMultiplier) || 0), 1);

  return {
    geneIds,
    genes,
    totalGenes: genes.length,
    modified: genes.length > 0,
    productionMultiplier,
    attractivenessMultiplier
  };
}

export function getDinoTraitProfile({ geneIds = [], genotypeIds = [] } = {}) {
  const normalizedGeneIds = normalizeGeneIds(geneIds);
  const normalizedGenotypeIds = normalizeGenotypeIds(genotypeIds);
  const genes = normalizedGeneIds.map((geneId) => getDinoGeneById(geneId)).filter(Boolean);
  const genotypes = normalizedGenotypeIds.map((genotypeId) => getDinoGenotypeById(genotypeId)).filter(Boolean);
  const allTraits = [...genes, ...genotypes];
  const productionMultiplier = allTraits.reduce((sum, trait) => sum + Math.max(0, Number(trait.meatMultiplier) || 0), 1);
  const attractivenessMultiplier = allTraits.reduce((sum, trait) => sum + Math.max(0, Number(trait.attractivenessMultiplier) || 0), 1);
  const shellTint = [...genotypes].reverse().find((trait) => trait?.shellTint)?.shellTint || "#67e8f9";

  return {
    geneIds: normalizedGeneIds,
    genotypeIds: normalizedGenotypeIds,
    genes,
    genotypes,
    allTraits,
    totalGenes: genes.length,
    totalGenotypes: genotypes.length,
    totalTraits: allTraits.length,
    modified: allTraits.length > 0,
    productionMultiplier,
    attractivenessMultiplier,
    shellTint,
    badges: allTraits.map((trait) => trait.badge || trait.name)
  };
}

export function normalizeLabProjects(projects = []) {
  if (!Array.isArray(projects)) return [];

  return projects.map((project, index) => {
    const normalized = {
      id: String(project.id || `egg_${index + 1}`),
      speciesId: String(project.speciesId || ""),
      displayName: String(project.displayName || project.name || "Lab Egg"),
      sex: normalizeSex(project.sex, `${project.id || index}:egg`),
      createdAt: project.createdAt || new Date().toISOString(),
      source: String(project.source || "laboratory"),
      geneIds: normalizeGeneIds(project.geneIds),
      genotypeIds: normalizeGenotypeIds(project.genotypeIds),
      iconId: String(project.iconId || project.speciesId || "basic"),
      motherSpeciesId: project.motherSpeciesId ? String(project.motherSpeciesId) : "",
      fatherSpeciesId: project.fatherSpeciesId ? String(project.fatherSpeciesId) : "",
      hybrid: Boolean(project.hybrid),
      shellTint: String(project.shellTint || ""),
      kind: String(project.kind || "laboratory")
    };
    return {
      ...normalized,
      ...getEggIncubationMeta({
        ...normalized,
        incubationStartedAt: project.incubationStartedAt || normalized.createdAt,
        incubationEndsAt: project.incubationEndsAt,
        incubationDurationSeconds: project.incubationDurationSeconds
      })
    };
  }).filter((project) => project.speciesId);
}

export function normalizeModifiedDinos(entries = []) {
  if (!Array.isArray(entries)) return [];

  return entries.map((entry, index) => {
    const acquiredAt = entry.acquiredAt || new Date().toISOString();
    const traitProfile = getDinoTraitProfile({ geneIds: entry.geneIds, genotypeIds: entry.genotypeIds });
    return {
      id: String(entry.id || `mod_${index + 1}`),
      speciesId: String(entry.speciesId || entry.baseSpeciesId || ""),
      baseSpeciesId: String(entry.baseSpeciesId || entry.speciesId || ""),
      displayName: String(entry.displayName || entry.name || "Modified Dino"),
      iconId: String(entry.iconId || entry.baseSpeciesId || entry.speciesId || "basic"),
      rarity: String(entry.rarity || "modified"),
      blurb: String(entry.blurb || buildLabBlurb(entry.displayName || entry.name || "Modified Dino", Boolean(entry.hybrid))),
      adultProduction: Math.max(1, Number(entry.adultProduction || 0) || 1),
      baseAttractiveness: Math.max(1, Number(entry.baseAttractiveness || 0) || 1),
      acquiredAt,
      updatedAt: entry.updatedAt || acquiredAt,
      sex: normalizeSex(entry.sex, `${entry.id || index}:${acquiredAt}`),
      nickname: String(entry.nickname || buildDinoNickname(entry.displayName || entry.speciesId || "Modified Dino", entry.sex, entry.id || acquiredAt)),
      geneIds: traitProfile.geneIds,
      genotypeIds: traitProfile.genotypeIds,
      source: String(entry.source || "laboratory"),
      hybrid: Boolean(entry.hybrid),
      motherSpeciesId: entry.motherSpeciesId ? String(entry.motherSpeciesId) : "",
      fatherSpeciesId: entry.fatherSpeciesId ? String(entry.fatherSpeciesId) : "",
      shellTint: String(entry.shellTint || traitProfile.shellTint || "#67e8f9"),
      traitProfile
    };
  }).filter((entry) => entry.speciesId || entry.hybrid);
}

export function computeQuestFromTemplate(template, level = 1) {
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

export function createInitialQuestState() {
  return QUEST_TEMPLATES.map((template) => computeQuestFromTemplate(template, 1)).concat(SOCIAL_QUESTS);
}

export function getQuestTemplateById(questId) {
  return QUEST_TEMPLATES.find((template) => template.id === questId) || null;
}

export function buildReferralCode(_seed = "", length = REFERRAL_CODE_LENGTH) {
  return Array.from({ length: Math.max(6, Math.floor(length)) }, () => randomDigit()).join("");
}

export function getClickUpgradePrice(clickUpgrades = 0) {
  return Math.floor(100 * Math.pow(1.8, clickUpgrades || 0));
}

export function adjustBaseCost(base) {
  if (base <= 150) return Math.max(1, Math.round(base * 0.05));
  if (base <= 1000) return Math.max(1, Math.round(base * 0.2));
  if (base <= 50000) return Math.round(base);
  if (base <= 500000) return Math.round(base * 3);
  return Math.round(base * 10);
}

export function getDinoPrice(baseCost, ownedCount) {
  const adjusted = adjustBaseCost(baseCost);
  const grown = Math.floor(adjusted * Math.pow(1.4, ownedCount));
  return Math.max(1, Math.floor(grown * 77));
}

export function getUniqueDinoPrice(baseFernsCost, ownedCount) {
  return Math.max(1, Math.ceil((baseFernsCost || 1) * Math.pow(1.6, ownedCount)) * 10);
}

export function getDinoById(dinoId) {
  return ALL_DINO_MAP.get(dinoId) || null;
}

export function getDinoProductionResource(dinoOrId) {
  const dino = typeof dinoOrId === "string" ? getDinoById(dinoOrId) : dinoOrId;
  return dino?.productionResource === "ferns" ? "ferns" : "meat";
}

export function isUniqueDinoId(dinoId) {
  return FERN_DINOS.some((item) => item.id === dinoId);
}

export function getPromotionById(promotionId) {
  return ALL_PROMOTION_MAP.get(promotionId) || null;
}

export function isPromotionId(promotionId) {
  return ZOO_PROMOTIONS.some((item) => item.id === promotionId);
}

export function getPromotionPrice(baseFernsCost, ownedCount) {
  return Math.max(1, Math.ceil((baseFernsCost || 1) * Math.pow(1.7, ownedCount || 0)));
}

export function getLabEggPrice(dinoId) {
  const dino = getDinoById(dinoId);
  if (!dino || !(dino.meatPerSec > 0)) return LAB_EGG_BASE_COST_GEMS;
  const powerFactor = Math.max(1, Math.log10((dino.meatPerSec || 1) + 10) + 0.8);
  return Math.max(LAB_EGG_BASE_COST_GEMS, Math.round((LAB_EGG_BASE_COST_GEMS + (dino.meatPerSec * 140)) * powerFactor));
}

function getEggIncubationBaseRarity(speciesId, options = {}) {
  if (options.hybrid) return "hybrid";

  const candidates = [
    getDinoById(speciesId),
    getDinoById(options.motherSpeciesId),
    getDinoById(options.fatherSpeciesId)
  ].filter(Boolean);

  if (!candidates.length) return "common";

  return candidates
    .map((entry) => entry.rarity || "common")
    .sort((left, right) => (RARITY_WEIGHT[right] || 0) - (RARITY_WEIGHT[left] || 0))[0];
}

export function getEggIncubationDurationSeconds(speciesId, options = {}) {
  const candidates = [
    getDinoById(speciesId),
    getDinoById(options.motherSpeciesId),
    getDinoById(options.fatherSpeciesId)
  ].filter(Boolean);
  const rarity = getEggIncubationBaseRarity(speciesId, options);
  const averagePower = candidates.length
    ? (candidates.reduce((total, entry) => total + Math.max(1, Number(entry.meatPerSec || 1) || 1), 0) / candidates.length)
    : 10;
  const raritySeconds = RARITY_INCUBATION_SECONDS[rarity] || RARITY_INCUBATION_SECONDS.common;
  const powerSeconds = Math.round(Math.log10(averagePower + 10) * 7 * 60);
  const hybridBonus = options.hybrid ? 12 * 60 : 0;
  return Math.max(8 * 60, Math.min(4 * 60 * 60, raritySeconds + powerSeconds + hybridBonus));
}

export function getEggIncubationMeta(project, nowValue = Date.now()) {
  const nowMs = typeof nowValue === "number" ? nowValue : (parseTimestampMs(nowValue) ?? Date.now());
  const fallbackStartedAt = project?.createdAt || new Date(nowMs).toISOString();
  const startedAtMs = parseTimestampMs(project?.incubationStartedAt || fallbackStartedAt) ?? nowMs;
  const durationSeconds = Math.max(
    60,
    Math.round(
      Number(project?.incubationDurationSeconds)
      || getEggIncubationDurationSeconds(project?.speciesId, {
        hybrid: Boolean(project?.hybrid),
        motherSpeciesId: project?.motherSpeciesId,
        fatherSpeciesId: project?.fatherSpeciesId
      })
    )
  );
  const endsAtMs = parseTimestampMs(project?.incubationEndsAt) ?? (startedAtMs + (durationSeconds * 1000));
  const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
  const elapsedSeconds = Math.max(0, durationSeconds - remainingSeconds);
  const progressPercent = durationSeconds > 0 ? Math.max(0, Math.min(100, (elapsedSeconds / durationSeconds) * 100)) : 100;

  return {
    incubationStartedAt: new Date(startedAtMs).toISOString(),
    incubationEndsAt: new Date(endsAtMs).toISOString(),
    incubationDurationSeconds: durationSeconds,
    elapsedSeconds,
    remainingSeconds,
    progressPercent,
    readyToHatch: remainingSeconds <= 0
  };
}

export function getTraitPriceForDino(traitId, dinoId) {
  const trait = getDinoGeneById(traitId) || getDinoGenotypeById(traitId);
  const dino = getDinoById(dinoId);
  if (!trait) return 0;
  if (!dino || !(dino.meatPerSec > 0)) return Math.max(1, Math.round(trait.costGems || 0));
  const scale = 1 + (Math.log10((dino.meatPerSec || 1) + 10) * 0.55);
  return Math.max(1, Math.round((trait.costGems || 0) * scale));
}

export function getBreedingCost(motherSpeciesId, fatherSpeciesId) {
  const mother = getDinoById(motherSpeciesId);
  const father = getDinoById(fatherSpeciesId);
  const motherPower = Math.max(1, Number(mother?.meatPerSec || 10) || 10);
  const fatherPower = Math.max(1, Number(father?.meatPerSec || 10) || 10);
  return Math.max(BREEDING_BASE_COST_MEAT, Math.round(BREEDING_BASE_COST_MEAT + ((motherPower + fatherPower) * 540)));
}

export function getDinoMaturityMultiplier(ageSeconds = 0) {
  const normalizedAge = Math.max(0, Number(ageSeconds) || 0);
  return 0.55 + (Math.min(1, normalizedAge / ADULT_GROWTH_SECONDS) * 0.45);
}

export function getTicketAttractivenessMultiplier(ticketPrice = 25) {
  const normalizedPrice = Math.max(5, Math.min(100, Number(ticketPrice) || 25));
  return Math.max(0.25, 1.2 - ((normalizedPrice - 15) / 90));
}

export function getTargetLoyalVisitors(totalAttractiveness = 0, ticketPrice = 25) {
  const attraction = Math.max(0, Number(totalAttractiveness) || 0);
  const normalizedPrice = Math.max(5, Math.min(100, Number(ticketPrice) || 25));
  const affordabilityFactor = Math.max(0.18, 2.1 - ((normalizedPrice - 5) / 54));
  return Math.max(0, attraction / 46) * affordabilityFactor;
}

export function advanceLoyalVisitors(currentLoyalVisitors = 0, totalAttractiveness = 0, ticketPrice = 25, elapsedSeconds = 0, growthMultiplier = 1) {
  const current = Math.max(0, Number(currentLoyalVisitors) || 0);
  const target = getTargetLoyalVisitors(totalAttractiveness, ticketPrice);
  const normalizedElapsed = Math.max(0, Number(elapsedSeconds) || 0) * Math.max(1, Number(growthMultiplier) || 1);

  if (!normalizedElapsed) {
    return {
      loyalVisitors: current,
      loyalVisitorsDelta: 0,
      targetLoyalVisitors: target
    };
  }

  const easing = 1 - Math.exp(-normalizedElapsed / (8 * 60 * 60));
  const next = Math.max(0, current + ((target - current) * easing));

  return {
    loyalVisitors: next,
    loyalVisitorsDelta: next - current,
    targetLoyalVisitors: target
  };
}

export function computeZooEconomyStats(totalAttractiveness = 0, ticketPrice = 25, loyalVisitors = 0) {
  const attractiveness = Math.max(0, Number(totalAttractiveness) || 0);
  const normalizedPrice = Math.max(5, Math.min(100, Number(ticketPrice) || 25));
  const ticketDemandFactor = getTicketAttractivenessMultiplier(normalizedPrice);
  const baseVisitorsPerSecond = (attractiveness / 52000) * ticketDemandFactor;
  const currentLoyalVisitors = Math.max(0, Number(loyalVisitors) || 0);
  const loyalVisitorsPerSecond = currentLoyalVisitors / 3600;
  const totalVisitorsPerSecond = baseVisitorsPerSecond + loyalVisitorsPerSecond;
  const gemIncomePerSec = totalVisitorsPerSecond * normalizedPrice;
  const targetLoyalVisitors = getTargetLoyalVisitors(attractiveness, normalizedPrice);
  const stableVisitorShare = totalVisitorsPerSecond > 0 ? loyalVisitorsPerSecond / totalVisitorsPerSecond : 0;
  const pricePressure = Math.max(0, Math.min(1, (normalizedPrice - 20) / 80));
  const developmentPercent = Math.max(0, Math.min(100, Math.round((Math.log10(attractiveness + 10) / 6) * 100)));
  const loyaltyProgressPercent = targetLoyalVisitors > 0
    ? Math.max(0, Math.min(100, Math.round((currentLoyalVisitors / targetLoyalVisitors) * 100)))
    : 0;
  const dailyGemRevenue = gemIncomePerSec * 86400;
  const revenueProgressPercent = Math.max(0, Math.min(100, Math.round((Math.log10(dailyGemRevenue + 10) / 8) * 100)));

  return {
    gemIncomePerSec,
    dailyGemRevenue,
    ticketDemandFactor,
    baseVisitorsPerSecond,
    loyalVisitors: currentLoyalVisitors,
    loyalVisitorsPerSecond,
    totalVisitorsPerSecond,
    targetLoyalVisitors,
    stableVisitorShare,
    pricePressure,
    developmentPercent,
    loyaltyProgressPercent,
    revenueProgressPercent
  };
}

export function computeGemIncomePerSecond(totalAttractiveness = 0, ticketPrice = 25, loyalVisitors = 0) {
  return computeZooEconomyStats(totalAttractiveness, ticketPrice, loyalVisitors).gemIncomePerSec;
}

function computeModifiedProductionBreakdown(entries = [], nowMs = Date.now()) {
  return normalizeModifiedDinos(entries).reduce((sum, entry) => {
    const acquiredMs = parseTimestampMs(entry.acquiredAt) || nowMs;
    const ageSeconds = Math.max(0, Math.floor((nowMs - acquiredMs) / 1000));
    const production = entry.adultProduction * getDinoMaturityMultiplier(ageSeconds);
    const resourceType = getDinoProductionResource(entry.baseSpeciesId || entry.speciesId);

    return {
      meatPerSec: sum.meatPerSec + (resourceType === "meat" ? production : 0),
      fernsPerSec: sum.fernsPerSec + (resourceType === "ferns" ? production : 0)
    };
  }, { meatPerSec: 0, fernsPerSec: 0 });
}

export function computeProductionBreakdown(owned = {}, progressMap = null, nowValue = new Date().toISOString(), geneState = {}, modifiedDinos = []) {
  const nowMs = typeof nowValue === "number" ? nowValue : parseTimestampMs(nowValue) || Date.now();
  const normalizedGenes = normalizeDinoGenes(geneState);
  const baseProduction = DINO_DEFS.reduce((sum, dino) => {
    const quantity = Math.max(0, Math.floor(Number(owned[dino.id] || 0)));
    if (quantity <= 0) return sum;

    const geneProfile = getDinoGeneProfile(dino.id, normalizedGenes);
    const resourceType = getDinoProductionResource(dino);

    if (progressMap?.[dino.id]?.instances?.length) {
      const fallbackStamp = progressMap[dino.id]?.firstAcquiredAt || progressMap[dino.id]?.lastAcquiredAt || new Date(nowMs).toISOString();
      const instances = getProgressInstances(dino, quantity, progressMap[dino.id], fallbackStamp);
      const generated = instances.reduce((running, instance) => {
        const acquiredMs = parseTimestampMs(instance.acquiredAt) || nowMs;
        const ageSeconds = Math.max(0, Math.floor((nowMs - acquiredMs) / 1000));
        return running + (instance.adultProduction * getDinoMaturityMultiplier(ageSeconds) * geneProfile.productionMultiplier);
      }, 0);
      return {
        meatPerSec: sum.meatPerSec + (resourceType === "meat" ? generated : 0),
        fernsPerSec: sum.fernsPerSec + (resourceType === "ferns" ? generated : 0)
      };
    }

    const generated = quantity * (dino.meatPerSec || 0) * geneProfile.productionMultiplier;
    return {
      meatPerSec: sum.meatPerSec + (resourceType === "meat" ? generated : 0),
      fernsPerSec: sum.fernsPerSec + (resourceType === "ferns" ? generated : 0)
    };
  }, { meatPerSec: 0, fernsPerSec: 0 });

  const modifiedProduction = computeModifiedProductionBreakdown(modifiedDinos, nowMs);

  const multiplier = [...FERN_DINOS, ...ZOO_PROMOTIONS].reduce((current, item) => {
    return current * Math.pow(item.incomeMultiplier || 1, owned[item.id] || 0);
  }, 1);

  const meatPerSec = (baseProduction.meatPerSec + modifiedProduction.meatPerSec) * multiplier;
  const fernsPerSec = (baseProduction.fernsPerSec + modifiedProduction.fernsPerSec) * multiplier;

  return {
    meatPerSec,
    fernsPerSec,
    totalPerSec: meatPerSec + fernsPerSec
  };
}

export function computeProductionPerSecond(owned = {}, progressMap = null, nowValue = new Date().toISOString(), geneState = {}, modifiedDinos = []) {
  return computeProductionBreakdown(owned, progressMap, nowValue, geneState, modifiedDinos).meatPerSec;
}

export function computeFernProductionPerSecond(owned = {}, progressMap = null, nowValue = new Date().toISOString(), geneState = {}, modifiedDinos = []) {
  return computeProductionBreakdown(owned, progressMap, nowValue, geneState, modifiedDinos).fernsPerSec;
}

function buildSpinSequence(length = 50) {
  const base = [];

  if (length === 50) {
    base.push(...Array(12).fill(1));
    base.push(...Array(10).fill(2));
    base.push(...Array(12).fill(3));
    base.push(...Array(12).fill(4));
    base.push(...Array(4).fill(5));
  } else {
    const choices = [1, 2, 3, 4, 5];
    for (let index = 0; index < length; index += 1) {
      base.push(choices[index % choices.length]);
    }
  }

  const stepCandidates = [13, 11, 7, 3, 5];
  const step = stepCandidates.find((candidate) => gcd(candidate, length) === 1) || 1;
  const sequence = new Array(length);

  for (let index = 0; index < length; index += 1) {
    sequence[index] = base[(index * step) % length];
  }

  return sequence;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

export function getSpinReward(spinIndex, productionPerSec, sequenceLength = 50) {
  const meat30 = Math.max(1, Math.floor(productionPerSec * 60 * 30));
  const meat60 = Math.max(1, Math.floor(productionPerSec * 60 * 60));

  const segments = [
    { id: "spin_1", key: "spin_1", reward: { freeSpins: 1 } },
    { id: "spin_2", key: "spin_2", reward: { freeSpins: 2 } },
    { id: "ferns_3", key: "ferns_3", reward: { ferns: 3 } },
    { id: "ferns_1", key: "ferns_1", reward: { ferns: 1 } },
    { id: "meat_30", key: "meat_30", reward: { meat: meat30 } },
    { id: "meat_60", key: "meat_60", reward: { meat: meat60 } }
  ];

  const sequence = buildSpinSequence(sequenceLength);
  const segmentIndex = sequence[spinIndex % sequence.length];
  return segments[segmentIndex];
}

export function getDinoGrowthStage(ageSeconds = 0) {
  const normalizedAge = Math.max(0, Math.floor(Number(ageSeconds) || 0));
  let currentStage = DINO_GROWTH_STAGES[0];

  for (const stage of DINO_GROWTH_STAGES) {
    if (normalizedAge >= stage.minAgeSeconds) {
      currentStage = stage;
    }
  }

  return currentStage;
}

export function getDinoGrowthStageMeta(ageSeconds = 0) {
  const stage = getDinoGrowthStage(ageSeconds);
  const index = DINO_GROWTH_STAGES.findIndex((entry) => entry.id === stage.id);
  const nextStage = index >= 0 ? DINO_GROWTH_STAGES[index + 1] || null : null;
  const stageStart = stage.minAgeSeconds || 0;
  const stageEnd = nextStage?.minAgeSeconds || stageStart;
  const span = Math.max(1, stageEnd - stageStart);
  const elapsed = Math.max(0, Math.floor(ageSeconds) - stageStart);

  return {
    ...stage,
    nextStage,
    stageProgressPercent: nextStage ? Math.max(0, Math.min(100, Math.round((elapsed / span) * 100))) : 100,
    secondsUntilNextStage: nextStage ? Math.max(0, nextStage.minAgeSeconds - Math.floor(ageSeconds)) : 0
  };
}

export function getBaseAttractiveness(dinoOrId) {
  const dino = typeof dinoOrId === "string" ? getDinoById(dinoOrId) : dinoOrId;
  if (!dino) return 0;
  return Math.max(1, Math.round(Number(dino.baseAttractiveness || 0) || 0));
}

export function getDinoAttractiveness(dinoOrId, ageSeconds = 0, attractionMultiplier = 1) {
  const base = getBaseAttractiveness(dinoOrId);
  const normalizedAge = Math.max(0, Number(ageSeconds) || 0);
  const ageHours = normalizedAge / 3600;
  const maturityFactor = 0.6 + (Math.min(1, normalizedAge / ADULT_GROWTH_SECONDS) * 0.4);
  const endlessGrowth = 1 + (Math.log1p(Math.max(0, ageHours) / 6) * 0.34);
  return Math.max(1, Math.round(base * maturityFactor * endlessGrowth * Math.max(1, Number(attractionMultiplier) || 1)));
}

export function buildHybridId(motherSpeciesId, fatherSpeciesId) {
  const parts = [String(motherSpeciesId || ""), String(fatherSpeciesId || "")].filter(Boolean).sort();
  return `hybrid_${parts.join("_")}`;
}

export function buildHybridName(motherSpeciesId, fatherSpeciesId) {
  const mother = getDinoById(motherSpeciesId);
  const father = getDinoById(fatherSpeciesId);
  const motherName = mother?.name || motherSpeciesId || "Unknown";
  const fatherName = father?.name || fatherSpeciesId || "Unknown";
  if (!motherSpeciesId || motherSpeciesId === fatherSpeciesId) {
    return `${motherName} Hatchling`;
  }
  return `${motherName} x ${fatherName}`;
}

function buildNaturalEntry(dino, quantity, progress, nowMs, normalizedGenes) {
  const fallbackStamp = progress.firstAcquiredAt || progress.lastAcquiredAt || new Date(nowMs).toISOString();
  const geneProfile = getDinoGeneProfile(dino.id, normalizedGenes);
  const resourceType = getDinoProductionResource(dino);
  const instances = getProgressInstances(dino, quantity, progress, fallbackStamp)
    .map((instance, index) => {
      const acquiredMs = parseTimestampMs(instance.acquiredAt) || nowMs;
      const ageSeconds = Math.max(0, Math.floor((nowMs - acquiredMs) / 1000));
      const stage = getDinoGrowthStageMeta(ageSeconds);
      const naturalCurrentProduction = instance.adultProduction * getDinoMaturityMultiplier(ageSeconds);
      const naturalAttractiveness = getDinoAttractiveness(dino, ageSeconds, 1);
      return {
        key: `${dino.id}:${index + 1}:${instance.acquiredAt || fallbackStamp}`,
        sequence: index + 1,
        acquiredAt: instance.acquiredAt || fallbackStamp,
        updatedAt: instance.updatedAt || fallbackStamp,
        ageSeconds,
        sex: normalizeSex(instance.sex, `${dino.id}:${instance.acquiredAt || fallbackStamp}:${index + 1}`),
        nickname: String(instance.nickname || buildDinoNickname(dino.name, instance.sex, `${dino.id}:${instance.acquiredAt || fallbackStamp}:${index + 1}`)),
        naturalCurrentProduction,
        currentProduction: naturalCurrentProduction * geneProfile.productionMultiplier,
        naturalAdultProduction: instance.adultProduction,
        adultProduction: instance.adultProduction * geneProfile.productionMultiplier,
        resourceType,
        naturalAttractiveness,
        attractiveness: getDinoAttractiveness(dino, ageSeconds, geneProfile.attractivenessMultiplier),
        stage,
        geneProfile
      };
    })
    .sort((left, right) => {
      if (right.currentProduction !== left.currentProduction) return right.currentProduction - left.currentProduction;
      if (right.attractiveness !== left.attractiveness) return right.attractiveness - left.attractiveness;
      return left.sequence - right.sequence;
    });

  const totalEntryAttractiveness = instances.reduce((sum, item) => sum + item.attractiveness, 0);
  const totalNaturalAttractiveness = instances.reduce((sum, item) => sum + item.naturalAttractiveness, 0);
  const totalProduction = instances.reduce((sum, item) => sum + item.currentProduction, 0);
  const totalNaturalProduction = instances.reduce((sum, item) => sum + item.naturalCurrentProduction, 0);
  const totalAdultProduction = instances.reduce((sum, item) => sum + item.adultProduction, 0);
  const totalNaturalAdultProduction = instances.reduce((sum, item) => sum + item.naturalAdultProduction, 0);
  const averageAgeSeconds = instances.length ? instances.reduce((sum, item) => sum + item.ageSeconds, 0) / instances.length : 0;
  const oldestAgeSeconds = instances.length ? Math.max(...instances.map((item) => item.ageSeconds)) : 0;
  const youngestAgeSeconds = instances.length ? Math.min(...instances.map((item) => item.ageSeconds)) : 0;
  const stage = getDinoGrowthStageMeta(averageAgeSeconds);
  const maleCount = instances.filter((item) => item.sex === "male").length;
  const femaleCount = instances.length - maleCount;

  return {
    id: dino.id,
    section: "natural",
    resourceType,
    name: dino.name,
    blurb: dino.blurb || "",
    rarity: dino.rarity,
    quantity,
    outputPerSec: quantity > 0 ? totalProduction / quantity : 0,
    adultOutputPerSec: quantity > 0 ? totalAdultProduction / quantity : 0,
    naturalOutputPerSec: quantity > 0 ? totalNaturalProduction / quantity : 0,
    naturalAdultOutputPerSec: quantity > 0 ? totalNaturalAdultProduction / quantity : 0,
    meatPerSec: quantity > 0 ? totalProduction / quantity : 0,
    adultMeatPerSec: quantity > 0 ? totalAdultProduction / quantity : 0,
    naturalMeatPerSec: quantity > 0 ? totalNaturalProduction / quantity : 0,
    naturalAdultMeatPerSec: quantity > 0 ? totalNaturalAdultProduction / quantity : 0,
    totalOutput: totalProduction,
    naturalTotalOutput: totalNaturalProduction,
    totalProduction,
    naturalTotalProduction: totalNaturalProduction,
    baseAttractiveness: getBaseAttractiveness(dino),
    attractivenessPerDino: quantity > 0 ? totalEntryAttractiveness / quantity : 0,
    naturalAttractivenessPerDino: quantity > 0 ? totalNaturalAttractiveness / quantity : 0,
    totalAttractiveness: totalEntryAttractiveness,
    naturalTotalAttractiveness: totalNaturalAttractiveness,
    ageSeconds: averageAgeSeconds,
    oldestAgeSeconds,
    youngestAgeSeconds,
    firstAcquiredAt: progress.firstAcquiredAt || fallbackStamp,
    lastAcquiredAt: progress.lastAcquiredAt || fallbackStamp,
    stage,
    modified: geneProfile.modified,
    geneProfile,
    maleCount,
    femaleCount,
    instances
  };
}

function buildModifiedEntry(entry, nowMs) {
  const acquiredMs = parseTimestampMs(entry.acquiredAt) || nowMs;
  const ageSeconds = Math.max(0, Math.floor((nowMs - acquiredMs) / 1000));
  const stage = getDinoGrowthStageMeta(ageSeconds);
  const currentProduction = entry.adultProduction * getDinoMaturityMultiplier(ageSeconds);
  const attractiveness = getDinoAttractiveness({ baseAttractiveness: entry.baseAttractiveness }, ageSeconds, 1);
  const resourceType = getDinoProductionResource(entry.baseSpeciesId || entry.speciesId);
  const instance = {
    key: entry.id,
    sequence: 1,
    acquiredAt: entry.acquiredAt,
    updatedAt: entry.updatedAt,
    ageSeconds,
    sex: entry.sex,
    nickname: String(entry.nickname || buildDinoNickname(entry.displayName || entry.speciesId || "Modified Dino", entry.sex, entry.id)),
    naturalCurrentProduction: currentProduction,
    currentProduction,
    naturalAdultProduction: entry.adultProduction,
    adultProduction: entry.adultProduction,
    resourceType,
    naturalAttractiveness: attractiveness,
    attractiveness,
    stage,
    geneProfile: entry.traitProfile,
    shellTint: entry.shellTint,
    hybrid: entry.hybrid,
    parents: [entry.motherSpeciesId, entry.fatherSpeciesId].filter(Boolean)
  };

  return {
    id: entry.id,
    section: "modified",
    speciesId: entry.speciesId,
    resourceType,
    name: entry.displayName,
    blurb: entry.blurb,
    rarity: entry.rarity,
    quantity: 1,
    outputPerSec: currentProduction,
    adultOutputPerSec: entry.adultProduction,
    naturalOutputPerSec: currentProduction,
    naturalAdultOutputPerSec: entry.adultProduction,
    meatPerSec: currentProduction,
    adultMeatPerSec: entry.adultProduction,
    naturalMeatPerSec: currentProduction,
    naturalAdultMeatPerSec: entry.adultProduction,
    totalOutput: currentProduction,
    naturalTotalOutput: currentProduction,
    totalProduction: currentProduction,
    naturalTotalProduction: currentProduction,
    baseAttractiveness: entry.baseAttractiveness,
    attractivenessPerDino: attractiveness,
    naturalAttractivenessPerDino: attractiveness,
    totalAttractiveness: attractiveness,
    naturalTotalAttractiveness: attractiveness,
    ageSeconds,
    oldestAgeSeconds: ageSeconds,
    youngestAgeSeconds: ageSeconds,
    firstAcquiredAt: entry.acquiredAt,
    lastAcquiredAt: entry.acquiredAt,
    stage,
    modified: true,
    geneProfile: entry.traitProfile,
    maleCount: entry.sex === "male" ? 1 : 0,
    femaleCount: entry.sex === "female" ? 1 : 0,
    shellTint: entry.shellTint,
    hybrid: entry.hybrid,
    source: entry.source,
    iconId: entry.iconId,
    motherSpeciesId: entry.motherSpeciesId,
    fatherSpeciesId: entry.fatherSpeciesId,
    instances: [instance]
  };
}

export function buildDinoCollection(owned = {}, progressMap = {}, nowValue = new Date().toISOString(), geneState = {}, modifiedDinos = []) {
  const nowMs = typeof nowValue === "number" ? nowValue : parseTimestampMs(nowValue) || Date.now();
  const normalizedGenes = normalizeDinoGenes(geneState);
  const naturalEntries = [];
  const modifiedEntries = normalizeModifiedDinos(modifiedDinos).map((entry) => buildModifiedEntry(entry, nowMs));
  let totalAttractiveness = modifiedEntries.reduce((sum, entry) => sum + entry.totalAttractiveness, 0);
  let totalCount = modifiedEntries.length;
  let totalMeatProduction = modifiedEntries.reduce((sum, entry) => sum + (entry.resourceType === "meat" ? entry.totalOutput : 0), 0);
  let totalFernProduction = modifiedEntries.reduce((sum, entry) => sum + (entry.resourceType === "ferns" ? entry.totalOutput : 0), 0);

  for (const [dinoId, rawQuantity] of Object.entries(owned || {})) {
    const quantity = Math.max(0, Math.floor(Number(rawQuantity) || 0));
    const dino = getDinoById(dinoId);
    if (!dino || quantity <= 0) continue;

    const progress = progressMap?.[dinoId] || {};
    const naturalEntry = buildNaturalEntry(dino, quantity, progress, nowMs, normalizedGenes);
    naturalEntries.push(naturalEntry);
    totalAttractiveness += naturalEntry.totalAttractiveness;
    totalCount += quantity;
    totalMeatProduction += naturalEntry.resourceType === "meat" ? naturalEntry.totalOutput : 0;
    totalFernProduction += naturalEntry.resourceType === "ferns" ? naturalEntry.totalOutput : 0;
  }

  naturalEntries.sort((left, right) => {
    if (right.totalAttractiveness !== left.totalAttractiveness) return right.totalAttractiveness - left.totalAttractiveness;
    if (right.totalProduction !== left.totalProduction) return right.totalProduction - left.totalProduction;
    if (right.quantity !== left.quantity) return right.quantity - left.quantity;
    return left.name.localeCompare(right.name);
  });

  modifiedEntries.sort((left, right) => {
    if (right.totalAttractiveness !== left.totalAttractiveness) return right.totalAttractiveness - left.totalAttractiveness;
    if (right.totalProduction !== left.totalProduction) return right.totalProduction - left.totalProduction;
    return left.name.localeCompare(right.name);
  });

  return {
    totalAttractiveness,
    totalCount,
    totalMeatProduction,
    totalFernProduction,
    uniqueSpecies: naturalEntries.length + modifiedEntries.length,
    naturalEntries,
    modifiedEntries,
    entries: [...naturalEntries, ...modifiedEntries],
    totalModifiedCount: modifiedEntries.length
  };
}

export function buildSeasonPassState({
  totalAttractiveness = 0,
  totalPurchases = 0,
  clickUpgrades = 0,
  successfulInvites = 0,
  productionPerSec = 0
} = {}) {
  const xp = Math.max(
    0,
    Math.floor(totalAttractiveness / 4) +
      (Math.max(0, Number(totalPurchases) || 0) * 20) +
      (Math.max(0, Number(clickUpgrades) || 0) * 30) +
      (Math.max(0, Number(successfulInvites) || 0) * 80) +
      Math.floor((Math.max(0, Number(productionPerSec) || 0) / 25))
  );

  const eraSpan = Math.max(1, (SEASON_PASS_LEVELS[SEASON_PASS_LEVELS.length - 1]?.xpRequired || 0) + 1800);
  const rawEraIndex = Math.max(0, Math.floor(xp / eraSpan));
  const xpInEra = xp % eraSpan;
  let currentTier = SEASON_PASS_LEVELS[0] || { level: 1, xpRequired: 0, freeReward: "", eliteReward: "" };

  for (const tier of SEASON_PASS_LEVELS) {
    if (xpInEra >= tier.xpRequired) {
      currentTier = tier;
      continue;
    }
    break;
  }

  const nextTier = SEASON_PASS_LEVELS.find((tier) => tier.level === currentTier.level + 1) || null;
  const currentXpStart = currentTier.xpRequired || 0;
  const currentXpEnd = nextTier ? nextTier.xpRequired : eraSpan;
  const progressSpan = Math.max(1, currentXpEnd - currentXpStart);
  const progressPercent = Math.max(0, Math.min(100, Math.round(((xpInEra - currentXpStart) / progressSpan) * 100)));
  const absoluteLevel = (rawEraIndex * PASS_LEVELS_PER_ERA) + currentTier.level;
  const eraProgress = getEraProgressFromAbsoluteLevel(absoluteLevel);
  const currentEra = ZOO_ERAS.find((era) => era.order === eraProgress.currentEraOrder) || ZOO_ERAS[ZOO_ERAS.length - 1] || { order: eraProgress.currentEraOrder, label: "Zoo Era", description: "" };
  const nextEra = currentEra.order < (ZOO_ERAS[ZOO_ERAS.length - 1]?.order || currentEra.order)
    ? ZOO_ERAS.find((era) => era.order === (currentEra.order + 1)) || null
    : null;

  const tiers = SEASON_PASS_LEVELS.map((tier, index) => {
    const next = SEASON_PASS_LEVELS[index + 1] || null;
    return {
      ...tier,
      absoluteLevel: (rawEraIndex * PASS_LEVELS_PER_ERA) + tier.level,
      unlocked: tier.level <= currentTier.level,
      isCurrent: tier.level === currentTier.level,
      nextXpRequired: next?.xpRequired || eraSpan
    };
  });

  return {
    seasonName: currentEra.label + " Pass",
    xp,
    absoluteLevel,
    currentLevel: currentTier.level,
    eraLevel: eraProgress.eraLevel,
    progressPercent,
    nextLevel: nextTier?.level || null,
    nextAbsoluteLevel: nextTier ? absoluteLevel + 1 : absoluteLevel + 1,
    nextXpRequired: nextTier?.xpRequired || eraSpan,
    currentEra,
    nextEra,
    currentEraOrder: currentEra.order || 1,
    nextEraStartLevel: eraProgress.nextEraStartLevel,
    currentEraStartLevel: eraProgress.currentEraStartLevel,
    levelsPerEra: eraProgress.levelsPerEra,
    tiers
  };
}

export function formatCompactNumber(value) {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return Math.floor(value).toString();
}
