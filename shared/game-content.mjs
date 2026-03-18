export const STAR_MEAT_HOURS_MINIMUM = 25000;
export const STARTER_OFFER_PRODUCT_ID = "cash_starter_spins_50";
export const ELITE_PASS_PRODUCT_ID = "cash_elite_pass_bundle";
export const AD_SPIN_PRODUCT_ID = "ad_spins_3";
export const AD_MEAT_BOOST_PRODUCT_ID = "ad_boost_meat_3h";
export const AD_GEMS_BOOST_PRODUCT_ID = "ad_boost_gems_3h";
export const AD_LOYAL_VISITORS_BOOST_PRODUCT_ID = "ad_boost_loyal_visitors_3h";
export const AD_FORTUNE_MEAT_BONUS_PRODUCT_ID = "ad_fortune_meat_60_x5";
export const AD_BOOST_DURATION_SECONDS = 3 * 60 * 60;
export const AD_BOOST_MULTIPLIER = 3;
export const AD_FORTUNE_MEAT_MULTIPLIER = 5;
export const AD_FORTUNE_BONUS_WINDOW_SECONDS = 5 * 60;
export const MAGIC_BIRD_COOLDOWN_SECONDS = 7 * 60;
export const LABORATORY_UNLOCK_COST_GEMS = 250000;
export const HATCHERY_UNLOCK_COST_GEMS = 125000;
export const LAB_EGG_BASE_COST_GEMS = 18000;
export const BREEDING_BASE_COST_MEAT = 4000;
const RARITY_ATTRACTIVENESS = {
  common: 12,
  uncommon: 18,
  rare: 26,
  epic: 38,
  legendary: 56,
  mythic: 82,
  unique: 94
};

const RARITY_BLURBS = {
  common: "A reliable crowd favorite that keeps your early zoo busy.",
  uncommon: "A sturdier species that brings in steadier resources once it matures.",
  rare: "A premium attraction with stronger adult production and better photo appeal.",
  epic: "A headline dino that grows into a heavy producer for serious zoos.",
  legendary: "A feared top-shelf predator that visitors never forget.",
  mythic: "A trophy monster built for endgame income and long-term prestige.",
  unique: "A rare showcase specimen that boosts the whole zoo in its own way."
};

function buildDinoBlurb(dino) {
  const resourceType = dino?.productionResource === "ferns" ? "ferns" : "meat";
  const outputLabel = resourceType === "ferns" ? "ferns" : "meat";

  if (!dino?.meatPerSec) {
    return RARITY_BLURBS[dino?.rarity] || "A rare attraction that changes the mood of your entire zoo.";
  }

  return `${RARITY_BLURBS[dino?.rarity] || "A crowd-pleasing dinosaur for your sanctuary."} Adult specimens usually settle around ${dino.meatPerSec} ${outputLabel}/s, although each one grows a little differently.`;
}

const RAW_DINO_DEFS = [
  { id: "velociraptor", name: "Velociraptor", cost: 50, meatPerSec: 10, rarity: "common" },
  { id: "pteranodon", name: "Pteranodon", cost: 150, meatPerSec: 19, rarity: "common" },
  { id: "mega_velociraptor", name: "Mega Velociraptor", cost: 250, meatPerSec: 26, rarity: "rare" },
  { id: "triceratops", name: "Triceratops", cost: 300, meatPerSec: 29, rarity: "uncommon", productionResource: "ferns" },
  { id: "ankylosaurus", name: "Ankylosaurus", cost: 800, meatPerSec: 54, rarity: "uncommon", productionResource: "ferns" },
  { id: "allosaurus", name: "Allosaurus", cost: 1200, meatPerSec: 69, rarity: "uncommon" },
  { id: "ultra_velociraptor", name: "Ultra Velociraptor", cost: 1250, meatPerSec: 71, rarity: "epic" },
  { id: "mega_triceratops", name: "Mega Triceratops", cost: 1500, meatPerSec: 79, rarity: "rare", productionResource: "ferns" },
  { id: "diplodocus", name: "Diplodocus", cost: 5000, meatPerSec: 167, rarity: "rare", productionResource: "ferns" },
  { id: "giga_velociraptor", name: "Giga Velociraptor", cost: 6250, meatPerSec: 191, rarity: "epic" },
  { id: "ultra_triceratops", name: "Ultra Triceratops", cost: 7500, meatPerSec: 214, rarity: "epic", productionResource: "ferns" },
  { id: "baryonyx", name: "Baryonyx", cost: 9000, meatPerSec: 240, rarity: "legendary" },
  { id: "mega_trex", name: "Mega T-Rex", cost: 10000, meatPerSec: 351, rarity: "epic" },
  { id: "mythic_velociraptor", name: "Mythic Velociraptor", cost: 31250, meatPerSec: 519, rarity: "mythic" },
  { id: "giga_triceratops", name: "Giga Triceratops", cost: 37500, meatPerSec: 581, rarity: "mythic", productionResource: "ferns" },
  { id: "ultra_trex", name: "Ultra T-Rex", cost: 50000, meatPerSec: 695, rarity: "mythic" },
  { id: "mega_spino", name: "Mega Spinosaurus", cost: 60000, meatPerSec: 961, rarity: "mythic" },
  { id: "mythic_triceratops", name: "Mythic Triceratops", cost: 187500, meatPerSec: 2001, rarity: "mythic", productionResource: "ferns" },
  { id: "giga_trex", name: "Giga T-Rex", cost: 250000, meatPerSec: 2049, rarity: "mythic" },
  { id: "ultra_spino", name: "Ultra Spinosaurus", cost: 300000, meatPerSec: 3841, rarity: "mythic" },
  { id: "mythic_trex", name: "Mythic T-Rex", cost: 1250000, meatPerSec: 8001, rarity: "mythic" },
  { id: "giga_spino", name: "Giga Spinosaurus", cost: 1500000, meatPerSec: 15361, rarity: "mythic" },
  { id: "mythic_spino", name: "Mythic Spinosaurus", cost: 7500000, meatPerSec: 32001, rarity: "mythic" }
];

const TOTAL_ZOO_ERAS = 15;
const DINOS_IN_FIRST_ERA = 12;
const DINOS_PER_LATER_ERA = 8;
const TARGET_DINO_COUNT = DINOS_IN_FIRST_ERA + ((TOTAL_ZOO_ERAS - 1) * DINOS_PER_LATER_ERA);

const GENERATED_DINO_PREFIXES = [
  "Solar", "Jade", "Crimson", "Frost", "Thunder", "Ivory", "Cobalt", "Blaze",
  "Shadow", "Amber", "Neon", "Iron", "Storm", "Golden", "Emerald", "Nova",
  "Obsidian", "Glacier", "Ruby", "Saffron", "Onyx", "Lunar", "Aurora", "Titan",
  "Comet", "Velvet", "Tempest", "Copper"
];

const GENERATED_DINO_SPECIES = [
  { id: "raptor", display: "Raptor", productionResource: "meat" },
  { id: "horncrest", display: "Horncrest", productionResource: "ferns" },
  { id: "longneck", display: "Longneck", productionResource: "ferns" },
  { id: "spineclaw", display: "Spineclaw", productionResource: "meat" },
  { id: "wingtalon", display: "Wingtalon", productionResource: "meat" },
  { id: "leafback", display: "Leafback", productionResource: "ferns" },
  { id: "fangjaw", display: "Fangjaw", productionResource: "meat" },
  { id: "tuskhorn", display: "Tuskhorn", productionResource: "ferns" },
  { id: "skybeak", display: "Skybeak", productionResource: "meat" },
  { id: "bloomshield", display: "Bloomshield", productionResource: "ferns" },
  { id: "clawrex", display: "Clawrex", productionResource: "meat" },
  { id: "mossmaw", display: "Mossmaw", productionResource: "ferns" }
];

function getUnlockEraForIndex(index) {
  if (index < DINOS_IN_FIRST_ERA) return 1;
  return Math.min(TOTAL_ZOO_ERAS, 2 + Math.floor((index - DINOS_IN_FIRST_ERA) / DINOS_PER_LATER_ERA));
}

function getGeneratedRarity(unlockEra, slotInEra = 0) {
  const slot = Math.max(0, slotInEra % DINOS_PER_LATER_ERA);

  if (unlockEra <= 2) {
    return ["rare", "rare", "epic", "rare", "epic", "legendary", "epic", "legendary"][slot];
  }

  if (unlockEra <= 4) {
    return ["epic", "epic", "legendary", "epic", "legendary", "mythic", "legendary", "mythic"][slot];
  }

  if (unlockEra <= 8) {
    return ["legendary", "epic", "legendary", "mythic", "legendary", "mythic", "legendary", "mythic"][slot];
  }

  return ["mythic", "legendary", "mythic", "mythic", "legendary", "mythic", "mythic", "mythic"][slot];
}

function buildGeneratedDinos() {
  const lastBaseDino = RAW_DINO_DEFS[RAW_DINO_DEFS.length - 1] || { cost: 1000, meatPerSec: 100 };
  const blueprints = GENERATED_DINO_SPECIES.flatMap((species) => GENERATED_DINO_PREFIXES.map((prefix) => ({ prefix, ...species })));
  const neededCount = Math.max(0, TARGET_DINO_COUNT - RAW_DINO_DEFS.length);

  return blueprints.slice(0, neededCount).map((blueprint, index) => {
    const overallIndex = RAW_DINO_DEFS.length + index;
    const unlockEra = getUnlockEraForIndex(overallIndex);
    const slotInEra = overallIndex < DINOS_IN_FIRST_ERA ? overallIndex : ((overallIndex - DINOS_IN_FIRST_ERA) % DINOS_PER_LATER_ERA);
    const growthStep = index + 1;
    const meatPerSec = Math.max(1, Math.round(lastBaseDino.meatPerSec * Math.pow(1.16, growthStep)));
    const cost = Math.max(1, Math.round(lastBaseDino.cost * Math.pow(1.18, growthStep)));

    return {
      id: `${blueprint.prefix}_${blueprint.id}`.toLowerCase(),
      name: `${blueprint.prefix} ${blueprint.display}`,
      cost,
      meatPerSec,
      rarity: getGeneratedRarity(unlockEra, slotInEra),
      productionResource: blueprint.productionResource
    };
  });
}

const ALL_RAW_DINO_DEFS = [...RAW_DINO_DEFS, ...buildGeneratedDinos()];

function decorateDino(dino) {
  const rarityBase = RARITY_ATTRACTIVENESS[dino.rarity] || 12;
  return {
    ...dino,
    productionResource: dino.productionResource || "meat",
    blurb: dino.blurb || buildDinoBlurb(dino),
    baseAttractiveness: dino.baseAttractiveness || Math.max(8, rarityBase + Math.round(Math.sqrt(dino.meatPerSec || 1)))
  };
}

export const DINO_DEFS = ALL_RAW_DINO_DEFS.map((dino, index) => decorateDino({
  ...dino,
  unlockEra: getUnlockEraForIndex(index)
}));

export const FERN_DINOS = [
  {
    id: "unique_shadow_raptor",
    name: "Shadow Raptor",
    baseFernsCost: 3,
    incomeMultiplier: 1.2,
    rarity: "unique",
    unlockEra: 3,
    baseAttractiveness: 108,
    blurb: "A stealthy centerpiece that quietly boosts the whole island's hunting rhythm."
  },
  {
    id: "unique_crystal_triceratops",
    name: "Crystal Triceratops",
    baseFernsCost: 5,
    incomeMultiplier: 1.4,
    rarity: "unique",
    unlockEra: 6,
    baseAttractiveness: 132,
    blurb: "A shimmering herbivore that turns your zoo into a premium attraction."
  },
  {
    id: "unique_obsidian_trex",
    name: "Obsidian T-Rex",
    baseFernsCost: 8,
    incomeMultiplier: 1.6,
    rarity: "unique",
    unlockEra: 9,
    baseAttractiveness: 168,
    blurb: "A black-glass apex monster that commands attention from every visitor."
  },
  {
    id: "unique_solar_longneck",
    name: "Solar Longneck",
    baseFernsCost: 12,
    incomeMultiplier: 1.85,
    rarity: "unique",
    unlockEra: 12,
    baseAttractiveness: 210,
    blurb: "A radiant titan that makes the whole zoo feel brighter, calmer and much more prestigious."
  },
  {
    id: "unique_cyber_clawrex",
    name: "Cyber Clawrex",
    baseFernsCost: 18,
    incomeMultiplier: 2.15,
    rarity: "unique",
    unlockEra: 15,
    baseAttractiveness: 260,
    blurb: "A futuristic endgame showcase beast built to headline your final empire era."
  }
];
export const ZOO_PROMOTIONS = [
  { id: "promo_tv_spotlight", name: "TV Spotlight", baseFernsCost: 2, incomeMultiplier: 1.08, channel: "Television", description: "Run a polished local TV campaign for your zoo." },
  { id: "promo_newspaper_feature", name: "Newspaper Feature", baseFernsCost: 3, incomeMultiplier: 1.1, channel: "Newspaper", description: "Buy a big newspaper feature with your strongest dinos on the cover." },
  { id: "promo_billboard_blitz", name: "Billboard Blitz", baseFernsCost: 4, incomeMultiplier: 1.15, channel: "Billboards", description: "Cover the city with giant dinosaur billboards." },
  { id: "promo_flyer_crew", name: "Flyer Crew", baseFernsCost: 5, incomeMultiplier: 1.12, channel: "Flyers", description: "Send promo teams to hand out flyers near the zoo." },
  { id: "promo_social_storm", name: "Social Storm", baseFernsCost: 7, incomeMultiplier: 1.24, channel: "Socials", description: "Push your best dinos across short-form social feeds." },
  { id: "promo_brand_ambassadors", name: "Brand Ambassadors", baseFernsCost: 9, incomeMultiplier: 1.28, channel: "Ambassadors", description: "Hire ambassadors to talk about your zoo in the city." },
  { id: "promo_citywide_tour", name: "Citywide Zoo Tour", baseFernsCost: 11, incomeMultiplier: 1.35, channel: "PR", description: "Launch a citywide campaign with hosts, press and promo vans." },
  { id: "promo_pigeon_drop", name: "Pigeon Flyer Drop", baseFernsCost: 13, incomeMultiplier: 1.4, channel: "Pigeons", description: "Drop flyers over the whole city with trained pigeons." }
];

export const MARKET_ROUTE_DEFS = [
  {
    id: "local_market",
    name: "Local Market",
    description: "Sell to nearby families and food stands right away. Instant payout, but the gem rate is modest.",
    durationHours: 0,
    meatGemRate: 0.00022,
    fernGemRate: 0.6,
    imageKey: "market-local"
  },
  {
    id: "capital_shipment",
    name: "Capital Shipment",
    description: "Pack the cargo for the capital. Better gem margins if you can wait a little longer.",
    durationHours: 24,
    meatGemRate: 0.00038,
    fernGemRate: 1.05,
    imageKey: "market-capital"
  },
  {
    id: "foreign_export",
    name: "Foreign Export",
    description: "Ship premium stock abroad. Slowest route, but the gem payout is the biggest.",
    durationHours: 48,
    meatGemRate: 0.00062,
    fernGemRate: 1.8,
    imageKey: "market-export"
  }
];

export const DINO_GENE_DEFS = [
  {
    id: "gene_amber_muscle",
    name: "Amber Muscle",
    costGems: 35000,
    meatMultiplier: 0.45,
    attractivenessMultiplier: 0.18,
    description: "Dense amber muscle strands make every bite heavier and every hunt more profitable."
  },
  {
    id: "gene_primal_plumage",
    name: "Primal Plumage",
    costGems: 60000,
    meatMultiplier: 0.25,
    attractivenessMultiplier: 0.55,
    description: "A vibrant feather gene that turns your dinosaurs into a crowd magnet."
  },
  {
    id: "gene_titan_heart",
    name: "Titan Heart",
    costGems: 90000,
    meatMultiplier: 0.65,
    attractivenessMultiplier: 0.28,
    description: "A reinforced heart mutation that lets the whole species work harder for longer."
  },
  {
    id: "gene_luminous_hide",
    name: "Luminous Hide",
    costGems: 120000,
    meatMultiplier: 0.4,
    attractivenessMultiplier: 0.8,
    description: "Bioluminescent skin makes even mature specimens impossible for visitors to ignore."
  }
];

export const DINO_GENOTYPE_DEFS = [
  {
    id: "geno_chameleon_shell",
    name: "Chameleon Shell",
    costGems: 28000,
    meatMultiplier: 0.12,
    attractivenessMultiplier: 0.62,
    shellTint: "#5eead4",
    badge: "Color shift",
    description: "Borrowed from a chameleon, this shell shifts color in the light and makes every hatch feel magical."
  },
  {
    id: "geno_peacock_glimmer",
    name: "Peacock Glimmer",
    costGems: 36000,
    meatMultiplier: 0.08,
    attractivenessMultiplier: 0.74,
    shellTint: "#60a5fa",
    badge: "Show feathers",
    description: "A peacock-inspired glow that turns scales and shells into a stage-ready rainbow show."
  },
  {
    id: "geno_tiger_stripes",
    name: "Tiger Stripes",
    costGems: 52000,
    meatMultiplier: 0.22,
    attractivenessMultiplier: 0.4,
    shellTint: "#fb923c",
    badge: "Striped power",
    description: "Striped predator genes give your hatchlings a bolder look and stronger hunting instincts."
  },
  {
    id: "geno_firefly_bloom",
    name: "Firefly Bloom",
    costGems: 68000,
    meatMultiplier: 0.18,
    attractivenessMultiplier: 0.88,
    shellTint: "#f9a8d4",
    badge: "Night glow",
    description: "Firefly light cells make modified dinosaurs shimmer after sunset and mesmerize visitors."
  }
];
export const ZOO_ERAS = [
  { order: 1, id: "small_zoo", label: "Small Zoo", description: "Your first tiny dinosaur park with the starter twelve species." },
  { order: 2, id: "budding_zoo", label: "Budding Zoo", description: "The island starts growing and fresh crowd favorites roll in." },
  { order: 3, id: "city_block_zoo", label: "City Block Zoo", description: "A busier city zoo with more banners, families and heavier earners." },
  { order: 4, id: "neighborhood_zoo", label: "Neighborhood Zoo", description: "Your zoo is now the talk of the district and the roster expands again." },
  { order: 5, id: "district_zoo", label: "District Zoo", description: "Big enclosures, louder crowds and stronger dinosaur lines." },
  { order: 6, id: "metro_zoo", label: "Metro Zoo", description: "The whole metro area knows your park and expects bigger attractions." },
  { order: 7, id: "regional_zoo", label: "Regional Zoo", description: "Visitors travel from nearby regions to see your midgame stars." },
  { order: 8, id: "grand_zoo", label: "Grand Zoo", description: "A serious showcase park with striking dinosaurs in every lane." },
  { order: 9, id: "wonder_zoo", label: "Wonder Zoo", description: "Your collection feels magical, huge and impossible to ignore." },
  { order: 10, id: "safari_zoo", label: "Safari Zoo", description: "Massive paddocks and high-powered beasts define this era." },
  { order: 11, id: "titan_zoo", label: "Titan Zoo", description: "Titanic enclosures bring in elite guests and giant income spikes." },
  { order: 12, id: "world_zoo", label: "World Zoo", description: "Your zoo is now a world-class destination with international pull." },
  { order: 13, id: "legend_zoo", label: "Legend Zoo", description: "Only legendary names remain on the bucket list for your visitors." },
  { order: 14, id: "mythic_zoo", label: "Mythic Zoo", description: "A near-endgame wonderland stacked with mythic dinosaur celebrities." },
  { order: 15, id: "cyber_dino_empire", label: "Cyber Dino Empire", description: "The final era: a giant cyber dinosaur empire packed with your strongest attractions." }
];

export const DINO_GROWTH_STAGES = [
  {
    id: "hatchling",
    label: "Hatchling",
    minAgeSeconds: 0,
    visualScale: 0.82,
    glow: "rgba(34,197,94,0.2)"
  },
  {
    id: "youngling",
    label: "Youngling",
    minAgeSeconds: 12 * 60 * 60,
    visualScale: 0.9,
    glow: "rgba(45,212,191,0.22)"
  },
  {
    id: "teen",
    label: "Teen",
    minAgeSeconds: 24 * 60 * 60,
    visualScale: 0.98,
    glow: "rgba(251,191,36,0.24)"
  },
  {
    id: "adult",
    label: "Adult",
    minAgeSeconds: 48 * 60 * 60,
    visualScale: 1.08,
    glow: "rgba(236,72,153,0.28)"
  }
];

export const PASS_LEVELS_PER_ERA = 60;
export const ZOO_ERA_START_LEVELS = Array.from({ length: ZOO_ERAS.length }, (_, index) => {
  if (index === 0) return 1;
  if (index === 1) return 15;
  if (index === 2) return 30;
  if (index === 3) return 50;
  return 50 + ((index - 3) * 20);
});

function buildPassXpRequirement(level) {
  if (level <= 1) return 0;
  const normalized = level - 1;
  return Math.floor((normalized * normalized * 18) + (normalized * 120));
}

function buildPassReward(level, track = "free") {
  const spins = Math.max(5, Math.floor(level * (track === "elite" ? 2.4 : 1.15)));
  const meat = Math.max(3000, Math.floor(level * level * (track === "elite" ? 3200 : 1500)));
  const ferns = Math.max(1, Math.floor(level / (track === "elite" ? 5 : 10)) + (track === "elite" ? 2 : 0));

  if (level % 10 === 0) return track === "elite" ? String(spins) + " spins + " + String(ferns) + " ferns" : String(ferns) + " ferns";
  if (level % 5 === 0) return track === "elite" ? meat.toLocaleString() + " meat" : String(spins) + " spins";
  if (level % 3 === 0) return track === "elite" ? String(spins) + " spins" : meat.toLocaleString() + " meat";
  return track === "elite" ? String(spins) + " spins" : meat.toLocaleString() + " meat";
}

export const SEASON_PASS_LEVELS = Array.from({ length: PASS_LEVELS_PER_ERA }, (_, index) => {
  const level = index + 1;
  return {
    level,
    xpRequired: buildPassXpRequirement(level),
    freeReward: buildPassReward(level, "free"),
    eliteReward: buildPassReward(level, "elite")
  };
});
export const QUEST_TEMPLATES = [
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
  },
  {
    id: "q_ferns",
    title: "Collect {target} ferns",
    type: "ferns",
    baseTarget: 2,
    baseReward: { freeSpins: 3 },
    targetGrowth: 1.8,
    rewardGrowth: 1.5
  },
  {
    id: "q_spins",
    title: "Use {target} spins",
    type: "spins",
    baseTarget: 3,
    baseReward: { meat: 4000 },
    targetGrowth: 1.7,
    rewardGrowth: 1.5
  },
  {
    id: "q_upgrade",
    title: "Upgrade click power {target} times",
    type: "upgrade",
    baseTarget: 1,
    baseReward: { ferns: 2 },
    targetGrowth: 1.7,
    rewardGrowth: 1.6
  },
  {
    id: "q_ads",
    title: "Watch {target} ads",
    type: "ads",
    baseTarget: 3,
    baseReward: { gems: 90 },
    targetGrowth: 1.6,
    rewardGrowth: 1.45
  }
];

export const SOCIAL_QUESTS = [
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

export const DEFAULT_STORE_PRODUCTS = [
  {
    id: STARTER_OFFER_PRODUCT_ID,
    kind: "fiat",
    title: "Starter Spin Burst",
    description: "50 spins the second your island opens. Designed as the first session offer.",
    rewardType: "freeSpins",
    rewardAmount: 50,
    starsPrice: 499,
    priceLabel: "$4.99",
    currency: "USD",
    placement: "starter",
    highlightText: "Best for new runs",
    active: true
  },
  {
    id: ELITE_PASS_PRODUCT_ID,
    kind: "fiat",
    title: "Jurassic Drift Elite Pass",
    description: "Premium season pass purchase offer with an instant bonus of 350 spins.",
    rewardType: "freeSpins",
    rewardAmount: 350,
    starsPrice: 999,
    priceLabel: "$9.99",
    currency: "USD",
    placement: "pass",
    highlightText: "Elite track purchase",
    active: true
  },
  {
    id: AD_SPIN_PRODUCT_ID,
    kind: "ad",
    title: "Spin Snack",
    description: "Watch a short ad and claim 3 extra spins from the server.",
    rewardType: "freeSpins",
    rewardAmount: 3,
    starsPrice: 0,
    priceLabel: "Watch Ad",
    currency: "AD",
    placement: "shop",
    highlightText: "3 instant spins",
    active: true
  },
  {
    id: AD_MEAT_BOOST_PRODUCT_ID,
    kind: "ad",
    title: "Meat Rush x3",
    description: "Watch an ad to triple your meat income for 3 hours.",
    rewardType: "boostMeat",
    rewardAmount: AD_BOOST_MULTIPLIER,
    starsPrice: 0,
    priceLabel: "Watch Ad",
    currency: "AD",
    placement: "shop",
    highlightText: "3h boost",
    active: true
  },
  {
    id: AD_GEMS_BOOST_PRODUCT_ID,
    kind: "ad",
    title: "Gem Rush x3",
    description: "Watch an ad to triple your gem income for 3 hours.",
    rewardType: "boostGems",
    rewardAmount: AD_BOOST_MULTIPLIER,
    starsPrice: 0,
    priceLabel: "Watch Ad",
    currency: "AD",
    placement: "shop",
    highlightText: "3h boost",
    active: true
  },
  {
    id: AD_LOYAL_VISITORS_BOOST_PRODUCT_ID,
    kind: "ad",
    title: "Crowd Rush x3",
    description: "Watch an ad to grow loyal visitors 3 times faster for 3 hours.",
    rewardType: "boostLoyalVisitors",
    rewardAmount: AD_BOOST_MULTIPLIER,
    starsPrice: 0,
    priceLabel: "Watch Ad",
    currency: "AD",
    placement: "shop",
    highlightText: "3h boost",
    active: true
  },
  {
    id: AD_FORTUNE_MEAT_BONUS_PRODUCT_ID,
    kind: "ad",
    title: "Fortune Meat Multiplier",
    description: "After a 60 minute meat reward, watch an ad to turn it into a 5x payout.",
    rewardType: "fortuneMeatBonus",
    rewardAmount: AD_FORTUNE_MEAT_MULTIPLIER,
    starsPrice: 0,
    priceLabel: "Watch Ad",
    currency: "AD",
    placement: "reward",
    highlightText: "5x fortune bonus",
    active: true
  },
  {
    id: "stars_meat_hours_100",
    kind: "stars",
    title: "100h Meat Vault",
    description: "Instant delivery of meat equal to 100 hours of your current production. Minimum 25,000 meat.",
    rewardType: "meatHours",
    rewardAmount: 100,
    starsPrice: 25,
    priceLabel: "25 Stars",
    currency: "XTR",
    placement: "shop",
    highlightText: "Server-calculated",
    active: true
  },
  {
    id: "stars_spins_200",
    kind: "stars",
    title: "Spin Vault 200",
    description: "Adds 200 extra spins.",
    rewardType: "freeSpins",
    rewardAmount: 200,
    starsPrice: 20,
    priceLabel: "20 Stars",
    currency: "XTR",
    placement: "shop",
    highlightText: "High value",
    active: true
  },
  {
    id: "stars_spins_700",
    kind: "stars",
    title: "Spin Vault 700",
    description: "Adds 700 extra spins.",
    rewardType: "freeSpins",
    rewardAmount: 700,
    starsPrice: 70,
    priceLabel: "70 Stars",
    currency: "XTR",
    placement: "shop",
    highlightText: "Huge bundle",
    active: true
  }
];

export const DEFAULT_STAR_PRODUCTS = DEFAULT_STORE_PRODUCTS;



