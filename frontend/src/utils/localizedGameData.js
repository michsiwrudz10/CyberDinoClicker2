import { formatCompactNumber } from "../../../shared/game-mechanics.mjs";

function joinParts(parts = [], separator = ", ") {
  return parts.filter(Boolean).join(separator);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function translateUnit(t, unit, amount) {
  const plural = Math.abs(Number(amount) || 0) === 1 ? "one" : "other";
  return t(`units.${unit}.${plural}`, { count: amount }, t(`units.${unit}`, { count: amount }, unit));
}

function translateRewardSegment(t, amount, unit) {
  if (!unit) return `${amount}`;
  return `${amount} ${translateUnit(t, unit, amount)}`;
}

export function formatRewardList(t, reward = {}, options = {}) {
  const separator = options.separator || ", ";
  const parts = [];

  if (reward.meat) parts.push(translateRewardSegment(t, formatCompactNumber(reward.meat), "meat"));
  if (reward.gems) parts.push(translateRewardSegment(t, formatCompactNumber(reward.gems), "gems"));
  if (reward.ferns) parts.push(translateRewardSegment(t, formatCompactNumber(reward.ferns), "ferns"));
  if (reward.freeSpins) parts.push(translateRewardSegment(t, formatCompactNumber(reward.freeSpins), "spins"));
  if (reward.fortunePoints) parts.push(translateRewardSegment(t, formatCompactNumber(reward.fortunePoints), "spins"));

  return joinParts(parts, separator) || t("reward.mystery", {}, "Mystery reward");
}

export function translateRewardSummary(t, text = "") {
  const input = String(text || "").trim();
  if (!input) return "";

  const normalized = input.replace(/\s*\+\s*/g, " + ");
  return normalized.split(" + ").map((part) => {
    const match = part.match(/^([\d.,KMBT]+)\s+(.*)$/i);
    if (!match) return part;
    const [, amount, rawUnit] = match;
    const unit = String(rawUnit || "").toLowerCase();
    if (unit.includes("spin")) return translateRewardSegment(t, amount, "spins");
    if (unit.includes("fern")) return translateRewardSegment(t, amount, "ferns");
    if (unit.includes("meat")) return translateRewardSegment(t, amount, "meat");
    if (unit.includes("gem")) return translateRewardSegment(t, amount, "gems");
    if (unit.includes("xp")) return `${amount} XP`;
    return `${amount} ${rawUnit}`;
  }).join(` ${t("common.plus", {}, "+")} `);
}

function localizeDynamicContent(t, prefix, id, field, fallback, values = {}) {
  if (!id) return fallback;
  return t(`${prefix}.${id}.${field}`, values, fallback);
}

export function localizeProduct(t, product) {
  if (!product) return product;
  return {
    ...product,
    title: localizeDynamicContent(t, "content.product", product.id, "title", product.title),
    description: localizeDynamicContent(t, "content.product", product.id, "description", product.description),
    highlightText: product.highlightText ? localizeDynamicContent(t, "content.product", product.id, "highlight", product.highlightText) : ""
  };
}

export function localizeMagicBirdOffer(t, offer) {
  if (!offer) return offer;
  return {
    ...offer,
    title: localizeDynamicContent(t, "content.magicBird", offer.id, "title", offer.title),
    description: localizeDynamicContent(t, "content.magicBird", offer.id, "description", offer.description)
  };
}

export function getLocalizedOutputFallback(t, adult, resourceType = "meat") {
  const unit = resourceType === "ferns"
    ? t("resource.ferns", {}, "Ferns").toLowerCase()
    : t("resource.meat", {}, "Meat").toLowerCase();
  return t("shop.defaultDinoBlurb", { adult, resource: unit }, `Adult dinosaurs usually settle near ${adult}/s.`);
}
export function localizePromotion(t, promotion) {
  if (!promotion) return promotion;
  return {
    ...promotion,
    name: localizeDynamicContent(t, "content.promotion", promotion.id, "name", promotion.name),
    channel: localizeDynamicContent(t, "content.promotion", promotion.id, "channel", promotion.channel),
    description: localizeDynamicContent(t, "content.promotion", promotion.id, "description", promotion.description)
  };
}

export function localizeDino(t, dino) {
  if (!dino) return dino;
  const resourceType = dino?.productionResource === "ferns" ? "ferns" : "meat";
  const genericBlurb = getLocalizedOutputFallback(t, dino.meatPerSec || 0, resourceType);
  const fallbackBlurb = genericBlurb !== `Adult dinosaurs usually settle near ${dino.meatPerSec || 0}/s.` ? genericBlurb : (dino.blurb || genericBlurb);
  return {
    ...dino,
    name: localizeDynamicContent(t, "content.dino", dino.id, "name", dino.name),
    blurb: localizeDynamicContent(t, "content.dino", dino.id, "blurb", fallbackBlurb, { adult: dino.meatPerSec || 0, resource: resourceType })
  };
}

export function localizeTrait(t, trait, type = "gene") {
  if (!trait) return trait;
  return {
    ...trait,
    name: localizeDynamicContent(t, `content.${type}`, trait.id, "name", trait.name),
    description: localizeDynamicContent(t, `content.${type}`, trait.id, "description", trait.description),
    badge: trait.badge ? localizeDynamicContent(t, `content.${type}`, trait.id, "badge", trait.badge) : trait.badge
  };
}

function localizeStage(t, stage) {
  if (!stage) return stage;
  return {
    ...stage,
    label: localizeDynamicContent(t, "content.stage", stage.id, "label", stage.label)
  };
}

function localizeCollectionEntry(t, entry) {
  if (!entry) return entry;
  const adultMeatPerSec = entry.adultMeatPerSec || 0;
  const resourceType = entry?.resourceType === "ferns" || entry?.productionResource === "ferns" ? "ferns" : "meat";
  const genericBlurb = getLocalizedOutputFallback(t, adultMeatPerSec, resourceType);
  const fallbackBlurb = genericBlurb !== `Adult dinosaurs usually settle near ${adultMeatPerSec}/s.` ? genericBlurb : (entry.blurb || genericBlurb);
  return {
    ...entry,
    name: localizeDynamicContent(t, "content.dino", entry.id || entry.speciesId, "name", entry.name),
    blurb: localizeDynamicContent(t, "content.dino", entry.id || entry.speciesId, "blurb", fallbackBlurb, { adult: adultMeatPerSec, resource: resourceType }),
    stage: localizeStage(t, entry.stage)
  };
}

export function localizeCollection(t, collection) {
  if (!collection) return collection;
  return {
    ...collection,
    entries: Array.isArray(collection.entries) ? collection.entries.map((entry) => localizeCollectionEntry(t, entry)) : [],
    naturalEntries: Array.isArray(collection.naturalEntries) ? collection.naturalEntries.map((entry) => localizeCollectionEntry(t, entry)) : [],
    modifiedEntries: Array.isArray(collection.modifiedEntries) ? collection.modifiedEntries.map((entry) => localizeCollectionEntry(t, entry)) : []
  };
}

function localizeLabProject(t, project) {
  if (!project) return project;
  return {
    ...project,
    displayName: project.displayName ? localizeDynamicContent(t, "content.project", project.id || project.speciesId, "name", project.displayName) : localizeDynamicContent(t, "content.dino", project.speciesId, "name", project.displayName),
    traitProfile: project.traitProfile ? {
      ...project.traitProfile,
      allTraits: Array.isArray(project.traitProfile.allTraits)
        ? project.traitProfile.allTraits.map((trait) => ({
            ...trait,
            name: localizeDynamicContent(t, trait.id.startsWith("geno_") ? "content.genotype" : "content.gene", trait.id, "name", trait.name)
          }))
        : []
    } : project.traitProfile
  };
}

export function localizeLaboratory(t, laboratory) {
  if (!laboratory) return laboratory;
  return {
    ...laboratory,
    geneCatalog: Array.isArray(laboratory.geneCatalog) ? laboratory.geneCatalog.map((trait) => localizeTrait(t, trait, "gene")) : [],
    genotypeCatalog: Array.isArray(laboratory.genotypeCatalog) ? laboratory.genotypeCatalog.map((trait) => localizeTrait(t, trait, "genotype")) : [],
    eggProjects: Array.isArray(laboratory.eggProjects) ? laboratory.eggProjects.map((project) => localizeLabProject(t, project)) : []
  };
}

function localizeQuestTitle(t, quest) {
  if (!quest) return "";
  const fallback = quest.titleTemplate
    ? String(quest.titleTemplate).replace("{target}", quest.target)
    : (quest.title || "");
  return localizeDynamicContent(t, "content.quest", quest.id, "title", fallback, { target: quest.target, level: quest.level || 1 });
}

export function localizeQuests(t, quests = []) {
  return Array.isArray(quests) ? quests.map((quest) => ({
    ...quest,
    title: localizeQuestTitle(t, quest),
    titleTemplate: localizeDynamicContent(t, "content.quest", quest.id, "template", quest.titleTemplate || "", { target: quest.target, level: quest.level || 1 })
  })) : [];
}

export function localizeEra(t, era) {
  if (!era) return era;
  return {
    ...era,
    label: localizeDynamicContent(t, "content.era", era.id, "label", era.label),
    description: localizeDynamicContent(t, "content.era", era.id, "description", era.description)
  };
}

export function localizePass(t, pass) {
  if (!pass) return pass;
  return {
    ...pass,
    seasonName: t("pass.seasonName", {}, pass.seasonName),
    currentEra: localizeEra(t, pass.currentEra),
    tiers: Array.isArray(pass.tiers) ? pass.tiers.map((tier) => ({
      ...tier,
      freeReward: translateRewardSummary(t, tier.freeReward),
      eliteReward: translateRewardSummary(t, tier.eliteReward)
    })) : []
  };
}

export function localizeLanguageCodeLabel(t, code = "") {
  const normalized = String(code || "").trim().toLowerCase();
  if (!normalized) return t("admin.languages.unknown", {}, "Unknown");
  return t(`language.name.${normalized}`, {}, normalized.toUpperCase());
}

export function localizePlayerSnapshotLanguage(player, languageCode) {
  if (!player) return player;
  return {
    ...player,
    telegramUser: {
      ...player.telegramUser,
      languageCode
    }
  };
}

export function formatProductRewardLabel(t, product, productionPerSec = 0) {
  if (!product) return "";

  if (product.rewardType === "meatHours") {
    const estimatedMeat = Math.max(25000, Math.floor((productionPerSec || 0) * 3600 * (product.rewardAmount || 0)));
    return t("product.reward.meatHours", { hours: product.rewardAmount || 0, estimated: formatCompactNumber(estimatedMeat) }, `${product.rewardAmount || 0}h of meat production (~${formatCompactNumber(estimatedMeat)} meat now)`);
  }

  if (product.rewardType === "freeSpins") {
    return translateRewardSegment(t, formatCompactNumber(product.rewardAmount || 0), "spins");
  }

  if (product.rewardType === "meat") {
    return translateRewardSegment(t, formatCompactNumber(product.rewardAmount || 0), "meat");
  }

  if (product.rewardType === "boostMeat") {
    return t("product.reward.boostMeat", { multiplier: formatCompactNumber(product.rewardAmount || 0) }, `x${formatCompactNumber(product.rewardAmount || 0)} meat income for 3h`);
  }

  if (product.rewardType === "boostGems") {
    return t("product.reward.boostGems", { multiplier: formatCompactNumber(product.rewardAmount || 0) }, `x${formatCompactNumber(product.rewardAmount || 0)} gem income for 3h`);
  }

  if (product.rewardType === "boostLoyalVisitors") {
    return t("product.reward.boostLoyal", { multiplier: formatCompactNumber(product.rewardAmount || 0) }, `x${formatCompactNumber(product.rewardAmount || 0)} loyal visitor growth for 3h`);
  }

  if (product.rewardType === "fortuneMeatBonus") {
    return t("product.reward.fortuneBonus", { multiplier: formatCompactNumber(product.rewardAmount || 0) }, `Upgrade the 60 min meat spin to x${formatCompactNumber(product.rewardAmount || 0)}`);
  }

  return `${formatCompactNumber(product.rewardAmount || 0)} ${product.rewardType}`;
}

export function formatLocalizedPrice(t, product) {
  if (!product) return "";
  if (product.priceLabel) return product.priceLabel;
  if (product.kind === "stars") return `${product.starsPrice} ${t("units.stars.other", {}, "Stars")}`;
  if (product.currency === "USD") return `$${((product.priceAmount || product.starsPrice || 0) / 100).toFixed(2)}`;
  return `${product.priceAmount || product.starsPrice || 0} ${product.currency || ""}`.trim();
}

export function formatGraphicalLabel(t, product) {
  if (!product) return t("premium.artworkSlot", {}, "Artwork slot");
  const mapping = {
    ad_spins_3: t("premium.art.spins", {}, "Spins art"),
    ad_boost_meat_3h: t("premium.art.meatBoost", {}, "Meat boost art"),
    ad_boost_gems_3h: t("premium.art.gemBoost", {}, "Gem boost art"),
    ad_boost_loyal_visitors_3h: t("premium.art.crowdBoost", {}, "Crowd boost art"),
    ad_fortune_meat_60_x5: t("premium.art.fortuneBonus", {}, "Fortune bonus art"),
    stars_meat_hours_100: t("premium.art.meatVault", {}, "Meat vault art"),
    stars_spins_200: t("premium.art.spinVault", {}, "Spin vault art"),
    stars_spins_700: t("premium.art.megaSpin", {}, "Mega spin art")
  };
  return mapping[product.id] || t("premium.artworkSlot", {}, "Artwork slot");
}

export function translateLanguageStats(entries = []) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        ...entry,
        userCount: toNumber(entry.userCount)
      }))
    : [];
}


