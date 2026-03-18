import React, { useEffect, useMemo, useRef, useState } from "react";
import Clicker from "./Clicker";
import DinoCollection from "./DinoCollection";
import Shop from "./Shop";
import Quests from "./Quests";
import ProfileHub from "./ProfileHub";
import DinoFeeder from "./components/DinoFeeder";
import LoadingScreen from "./components/LoadingScreen";
import MagicBird from "./components/MagicBird";
import PassDrawer from "./components/PassDrawer";
import StarterOfferModal from "./components/StarterOfferModal";
import PurchaseProposalModal from "./components/PurchaseProposalModal";
import StoreProductModal from "./components/StoreProductModal";
import {
  authenticateTelegram,
  buyDinoGene,
  buyDinoGenotype,
  buyLaboratory,
  breedDinosaurs,
  claimQuest,
  completeDevPayment,
  createInvoice,
  createLabEgg,
  getPlayerMe,
  setPlayerLanguage,
  hatchLabEgg,
  claimMagicBird,
  purchaseDino,
  setZooTicketPrice,
  spinWheel,
  tapGame,
  unlockHatchery,
  upgradeClick,
  watchAdReward
} from "./utils/gameApi";
import {
  getTelegramAuthPayload,
  getTelegramViewerPreview,
  initTelegramChrome,
  openTelegramInvoice
} from "./utils/telegram";
import {
  AD_FORTUNE_MEAT_BONUS_PRODUCT_ID,
  AD_FORTUNE_MEAT_MULTIPLIER,
  DINO_DEFS,
  ELITE_PASS_PRODUCT_ID,
  FERN_DINOS,
  STAR_MEAT_HOURS_MINIMUM,
  STARTER_OFFER_PRODUCT_ID,
  ZOO_PROMOTIONS
} from "../../shared/game-content.mjs";
import { clearPendingReferralCode, getPendingReferralCode } from "./utils/referrals";
import { formatCompactNumber } from "../../shared/game-mechanics.mjs";
import useCompactLayout from "./utils/useCompactLayout";
import { normalizeLanguage, useI18n } from "./i18n";
import {
  formatGraphicalLabel,
  formatLocalizedPrice,
  formatProductRewardLabel,
  formatRewardList,
  localizeCollection,
  localizeDino,
  localizeLaboratory,
  localizeMagicBirdOffer,
  localizePass,
  localizeProduct,
  localizePromotion,
  localizeQuests
} from "./utils/localizedGameData";

const REFRESH_INTERVAL_MS = 30000;
const ADMIN_URL = `${import.meta.env.BASE_URL || "/"}admin.html`;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const RESOURCE_ICONS = {
  meat: `${import.meta.env.BASE_URL || "/"}ui/icon-meat.png`,
  ferns: `${import.meta.env.BASE_URL || "/"}ui/icon-ferns.png`,
  spins: `${import.meta.env.BASE_URL || "/"}ui/icon-spins.png`,
  gems: `${import.meta.env.BASE_URL || "/"}ui/icon-gems.png`,
  charm: `${import.meta.env.BASE_URL || "/"}ui/icon-charm.png`
};
const NAV_ITEMS = [
  { id: "clicker", labelKey: "nav.clicker", fallback: "Clicker" },
  { id: "shop", labelKey: "nav.shop", fallback: "Shop" },
  { id: "dinosaurs", labelKey: "nav.dinosaurs", fallback: "My Zoo" },
  { id: "quests", labelKey: "nav.quests", fallback: "Quests" },
  { id: "profile", labelKey: "nav.profile", fallback: "My Profile" },
  { id: "fortune", labelKey: "nav.fortune", fallback: "Fortune" }
];

function safeIdempotencyKey(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function requestAuthedJson(path, token, body = {}) {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `API request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function shouldLockForError(error) {
  const status = Number(error?.status || 0);
  return !status || status >= 500 || status === 401 || status === 403;
}

function triggerFeedback(pattern = 24) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {}
}

function shouldVibrateOnSuccess(label = "") {
  return label === "magic-bird"
    || label === "upgrade"
    || label === "spin"
    || label === "laboratory:unlock"
    || label === "hatchery:unlock"
    || label.startsWith("purchase:")
    || label.startsWith("egg:")
    || label.startsWith("gene:")
    || label.startsWith("genotype:")
    || label.startsWith("breed:")
    || label.startsWith("hatch:")
    || label.startsWith("dev-payment:");
}

function formatProductReward(product, productionPerSec) {
  if (!product) return "";

  if (product.rewardType === "meatHours") {
    const estimatedMeat = Math.max(
      STAR_MEAT_HOURS_MINIMUM,
      Math.floor((productionPerSec || 0) * 3600 * (product.rewardAmount || 0))
    );
    return `${product.rewardAmount}h of meat production (~${formatCompactNumber(estimatedMeat)} meat now)`;
  }

  if (product.rewardType === "freeSpins") {
    return `${formatCompactNumber(product.rewardAmount || 0)} spins`;
  }

  if (product.rewardType === "meat") {
    return `${formatCompactNumber(product.rewardAmount || 0)} meat`;
  }

  if (product.rewardType === "boostMeat") {
    return `x${formatCompactNumber(product.rewardAmount || 0)} meat income for 3h`;
  }

  if (product.rewardType === "boostGems") {
    return `x${formatCompactNumber(product.rewardAmount || 0)} gem income for 3h`;
  }

  if (product.rewardType === "boostLoyalVisitors") {
    return `x${formatCompactNumber(product.rewardAmount || 0)} loyal visitor growth for 3h`;
  }

  if (product.rewardType === "fortuneMeatBonus") {
    return `Upgrade the 60 min meat spin to x${formatCompactNumber(product.rewardAmount || 0)}`;
  }

  return `${formatCompactNumber(product.rewardAmount || 0)} ${product.rewardType}`;
}

function getProductGraphicLabel(product) {
  if (!product) return "Artwork slot";
  const labels = {
    ad_spins_3: "Spins art",
    ad_boost_meat_3h: "Meat boost art",
    ad_boost_gems_3h: "Gem boost art",
    ad_boost_loyal_visitors_3h: "Crowd boost art",
    ad_fortune_meat_60_x5: "Fortune bonus art",
    stars_meat_hours_100: "Meat vault art",
    stars_spins_200: "Spin vault art",
    stars_spins_700: "Mega spin art"
  };
  return labels[product.id] || "Artwork slot";
}

function formatPriceLabel(product) {
  if (!product) return "";
  if (product.priceLabel) return product.priceLabel;
  if (product.kind === "stars") return `${product.starsPrice} Stars`;
  if (product.currency === "USD") return `$${((product.priceAmount || product.starsPrice || 0) / 100).toFixed(2)}`;
  return `${product.priceAmount || product.starsPrice || 0} ${product.currency || ""}`.trim();
}

function formatRewardBundle(reward = {}) {
  const parts = [];

  if (reward.meat) parts.push(`${formatCompactNumber(reward.meat)} meat`);
  if (reward.gems) parts.push(`${formatSoftNumber(reward.gems)} gems`);
  if (reward.ferns) parts.push(`${formatCompactNumber(reward.ferns)} ferns`);
  if (reward.freeSpins) parts.push(`${formatCompactNumber(reward.freeSpins)} spins`);
  if (reward.fortunePoints) parts.push(`${formatCompactNumber(reward.fortunePoints)} fortune spins`);

  return parts.join(", ") || "Mystery reward";
}

function formatPurchaseMilestoneReward(reward = null) {
  if (!reward) return "Surprise reward";

  const parts = [];
  if (reward.spinsAwarded) parts.push(`${formatCompactNumber(reward.spinsAwarded)} spins`);
  if (reward.bonusDino?.name) parts.push(`1 ${reward.bonusDino.name}`);
  return parts.join(" + ") || "Surprise reward";
}

function describePurchaseMilestoneReward(reward = null) {
  if (!reward) return "Your zoo crowd dropped a surprise reward.";
  if (reward.bonusDino?.name && reward.spinsAwarded) {
    return `You reached ${reward.totalPurchases} dinosaur purchases. The crowd gave you ${reward.spinsAwarded} spins and a bonus ${reward.bonusDino.name}.`;
  }
  if (reward.bonusDino?.name) {
    return `You reached ${reward.totalPurchases} dinosaur purchases and got a bonus ${reward.bonusDino.name} from your existing zoo roster.`;
  }
  if (reward.spinsAwarded) {
    return `You reached ${reward.totalPurchases} dinosaur purchases and the crowd dropped ${reward.spinsAwarded} spins into your wheel stash.`;
  }
  return "Your zoo crowd dropped a surprise reward.";
}
function formatSoftNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1e12) return `${(number / 1e12).toFixed(2)}T`;
  if (number >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(2)}K`;
  if (number >= 100) return Math.round(number).toString();
  if (number >= 10) return number.toFixed(1).replace(/\.0$/, "");
  if (number >= 1) return number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return number > 0 ? number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "0";
}

export default function App() {
  const [view, setView] = useState("clicker");
  const [token, setToken] = useState("");
  const [viewer, setViewer] = useState(() => getTelegramViewerPreview());
  const [player, setPlayer] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("booting");
  const [banner, setBanner] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [latestInvoice, setLatestInvoice] = useState(null);
  const [selectedStoreProductId, setSelectedStoreProductId] = useState("");
  const [fortuneBonusOpen, setFortuneBonusOpen] = useState(false);
  const [magicBirdOffer, setMagicBirdOffer] = useState(null);
  const [purchaseMilestoneReward, setPurchaseMilestoneReward] = useState(null);
  const [bootProgress, setBootProgress] = useState(6);
  const [bootTarget, setBootTarget] = useState(12);
  const [bootMessage, setBootMessage] = useState("Waking up the island...");
  const [starterOfferOpen, setStarterOfferOpen] = useState(false);
  const [elitePassOfferOpen, setElitePassOfferOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const isCompact = useCompactLayout();
  const { language, languages, setLanguage, t } = useI18n();

  const tokenRef = useRef("");
  const tapBufferRef = useRef(0);
  const tapInFlightRef = useRef(false);
  const starterOfferShownRef = useRef(false);
  const hydratedLanguageUserRef = useRef("");
  const pendingLanguageWriteRef = useRef("");

  useEffect(() => {
    initTelegramChrome();
  }, []);

  useEffect(() => {
    if (status !== "booting") {
      setBootProgress(100);
      return undefined;
    }

    const intervalId = setInterval(() => {
      setBootProgress((current) => {
        if (current >= bootTarget) return current;
        const delta = Math.max(1, Math.ceil((bootTarget - current) / 5));
        return Math.min(bootTarget, current + delta);
      });
    }, 32);

    return () => clearInterval(intervalId);
  }, [status, bootTarget]);

  const applyAuth = (authResponse) => {
    setToken(authResponse.token || "");
    tokenRef.current = authResponse.token || "";
    setViewer(authResponse.viewer || getTelegramViewerPreview());
    setIsAdmin(Boolean(authResponse.isAdmin));
    if (authResponse.player) setPlayer(authResponse.player);
  };

  const refreshPlayer = async () => {
    const currentToken = tokenRef.current;
    if (!currentToken) throw new Error(t("error.missingSession", {}, "Telegram session is missing."));

    const response = await getPlayerMe(currentToken);
    setPlayer(response.player);
    setIsAdmin(Boolean(response.isAdmin));
    setStatus("connected");
    return response.player;
  };

  const bootstrap = async () => {
    setStatus("booting");
    setBanner("");
    setBootProgress(8);
    setBootTarget(18);
    setBootMessage(t("boot.opening", {}, "Opening your dinosaur island..."));

    try {
      const authPayload = getTelegramAuthPayload();
      if (!authPayload) {
        throw new Error(t("error.openTelegram", {}, "Open this game inside Telegram. For local tests, run the dev server with Telegram dev auth enabled."));
      }

      setBootTarget(38);
      setBootMessage(t("boot.checking", {}, "Checking Telegram identity..."));
      const referralCode = getPendingReferralCode();
      const authResponse = await authenticateTelegram({
        ...authPayload,
        ...(referralCode ? { referralCode } : {})
      });
      applyAuth(authResponse);
      clearPendingReferralCode();

      setBootTarget(72);
      setBootMessage(t("boot.syncing", {}, "Syncing cloud save and dinosaur sanctuary..."));
      await refreshPlayer();

      setBootTarget(100);
      setBootMessage(t("boot.ready", {}, "Island ready."));
    } catch (error) {
      setStatus("blocked");
      setBootTarget(100);
      setBanner(error instanceof Error ? error.message : t("error.failedConnect", {}, "Failed to connect to the game server."));
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  const persistedPlayerLanguage = normalizeLanguage(player?.telegramUser?.languageCode || viewer?.languageCode || "");
  const languageHydrationUserId = String(player?.telegramUser?.id || viewer?.id || "");

  useEffect(() => {
    if (!token || !languageHydrationUserId || !persistedPlayerLanguage) return;
    if (hydratedLanguageUserRef.current === languageHydrationUserId) return;

    hydratedLanguageUserRef.current = languageHydrationUserId;
    if (persistedPlayerLanguage !== language) {
      setLanguage(persistedPlayerLanguage);
    }
  }, [language, languageHydrationUserId, persistedPlayerLanguage, setLanguage, token]);

  useEffect(() => {
    if (!tokenRef.current || !player) return;
    const nextLanguage = normalizeLanguage(language);
    if (!nextLanguage || nextLanguage === persistedPlayerLanguage) return;
    if (pendingLanguageWriteRef.current === nextLanguage) return;

    let cancelled = false;
    pendingLanguageWriteRef.current = nextLanguage;
    void setPlayerLanguage(tokenRef.current, nextLanguage)
      .then((response) => {
        if (cancelled) return;
        pendingLanguageWriteRef.current = "";
        setPlayer(response.player);
        setViewer((current) => ({
          ...current,
          languageCode: nextLanguage
        }));
      })
      .catch(() => {
        if (!cancelled) {
          pendingLanguageWriteRef.current = "";
        }
      });

    return () => {
      cancelled = true;
    };
  }, [language, persistedPlayerLanguage, player, token]);

  useEffect(() => {
    if (!token) return undefined;

    const intervalId = setInterval(() => {
      void refreshPlayer().catch((error) => {
        setStatus("blocked");
        setBanner(error instanceof Error ? error.message : t("error.lostConnection", {}, "Lost connection to the server."));
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshPlayer().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [token]);

  useEffect(() => {
    const offer = player?.offers?.starterSpin;
    if (!offer?.eligible || starterOfferShownRef.current) return;
    starterOfferShownRef.current = true;
    setStarterOfferOpen(true);
  }, [player?.offers?.starterSpin?.eligible]);

  useEffect(() => {
    if (player?.offers?.starterSpin?.alreadyPurchased) {
      setStarterOfferOpen(false);
    }
  }, [player?.offers?.starterSpin?.alreadyPurchased]);

  useEffect(() => {
    if (player?.offers?.elitePass?.alreadyPurchased) {
      setElitePassOfferOpen(false);
    }
  }, [player?.offers?.elitePass?.alreadyPurchased]);

  useEffect(() => {
    if (!player?.ads?.pendingBonus?.productId) {
      setFortuneBonusOpen(false);
    }
  }, [player?.ads?.pendingBonus?.productId]);

  const runAction = async (label, action) => {
    if (!tokenRef.current || status === "blocked") {
      throw new Error(t("error.gameLocked", {}, "The game is locked until the server reconnects."));
    }

    setBusyAction(label);
    setBanner("");

    try {
      const result = await action();
      setStatus("connected");
      if (shouldVibrateOnSuccess(label)) {
        triggerFeedback(label === "spin" ? [24, 36, 24] : 28);
      }
      return result;
    } catch (error) {
      setStatus(shouldLockForError(error) ? "blocked" : "connected");
      const message = error instanceof Error ? error.message : t("error.actionFailed", {}, "Action failed.");
      setBanner(message);
      throw error;
    } finally {
      setBusyAction("");
    }
  };

  const flushTapQueue = async () => {
    if (tapInFlightRef.current || tapBufferRef.current <= 0 || !tokenRef.current || status === "blocked") {
      return;
    }

    tapInFlightRef.current = true;
    const count = tapBufferRef.current;
    tapBufferRef.current = 0;

    try {
      const response = await tapGame(tokenRef.current, count);
      setPlayer(response.player);
      setStatus("connected");
    } catch (error) {
      tapBufferRef.current = 0;
      setStatus(shouldLockForError(error) ? "blocked" : "connected");
      setBanner(error instanceof Error ? error.message : "Tap sync failed.");
    } finally {
      tapInFlightRef.current = false;
    }
  };

  const handleTap = () => {
    if (!tokenRef.current || status === "blocked") return;
    try {
      navigator.vibrate?.(15);
    } catch {}
    tapBufferRef.current += 1;
    void flushTapQueue();
  };

  const handleUpgradeClick = async () => {
    await runAction("upgrade", async () => {
      const response = await upgradeClick(tokenRef.current);
      setPlayer(response.player);
    });
  };

  const handlePurchaseDino = async (dino, sex = "male") => {
    await runAction(`purchase:${dino.id}:${sex}`, async () => {
      const response = await purchaseDino(tokenRef.current, dino.id, sex);
      setPlayer(response.player);
      if (response.purchaseMilestone) {
        setPurchaseMilestoneReward(response.purchaseMilestone);
      }
    });
  };

  const handleSetTicketPrice = async (nextTicketPrice) => {
    if (!tokenRef.current || status === "blocked") {
      throw new Error("The game is locked until the server reconnects.");
    }

    setTicketBusy(true);
    setBanner("");

    try {
      const response = await setZooTicketPrice(tokenRef.current, nextTicketPrice);
      setPlayer(response.player);
      setStatus("connected");
    } catch (error) {
      setStatus(shouldLockForError(error) ? "blocked" : "connected");
      setBanner(error instanceof Error ? error.message : "Ticket price update failed.");
      throw error;
    } finally {
      setTicketBusy(false);
    }
  };

  const handleClaimQuest = async (questId) => {
    await runAction(`quest:${questId}`, async () => {
      const response = await claimQuest(tokenRef.current, questId);
      setPlayer(response.player);
    });
  };

  const handleBuyLaboratory = async () => {
    await runAction("laboratory:unlock", async () => {
      const response = await buyLaboratory(tokenRef.current);
      setPlayer(response.player);
    });
  };

  const handleUnlockHatchery = async () => {
    await runAction("hatchery:unlock", async () => {
      const response = await unlockHatchery(tokenRef.current);
      setPlayer(response.player);
    });
  };

  const handleCreateLabEgg = async (dino, sex = "male") => {
    await runAction(`egg:${dino.id}:${sex}`, async () => {
      const response = await createLabEgg(tokenRef.current, dino.id, sex);
      setPlayer(response.player);
    });
  };

  const handleBuyGene = async (projectId, geneId) => {
    await runAction(`gene:${projectId}:${geneId}`, async () => {
      const response = await buyDinoGene(tokenRef.current, projectId, geneId);
      setPlayer(response.player);
    });
  };

  const handleBuyGenotype = async (projectId, genotypeId) => {
    await runAction(`genotype:${projectId}:${genotypeId}`, async () => {
      const response = await buyDinoGenotype(tokenRef.current, projectId, genotypeId);
      setPlayer(response.player);
    });
  };

  const handleHatchEgg = async (projectId) => {
    await runAction(`hatch:${projectId}`, async () => {
      const response = await hatchLabEgg(tokenRef.current, projectId);
      setPlayer(response.player);
    });
  };

  const handleBreed = async (motherSpeciesId, fatherSpeciesId) => {
    await runAction(`breed:${motherSpeciesId}:${fatherSpeciesId}`, async () => {
      const response = await breedDinosaurs(tokenRef.current, motherSpeciesId, fatherSpeciesId);
      setPlayer(response.player);
    });
  };

  const handleCreateExchangeOrder = async (routeId, resourceType, amount) => {
    await runAction(`market:create:${routeId}:${resourceType}`, async () => {
      const response = await requestAuthedJson("/api/market/create-order", tokenRef.current, { routeId, resourceType, amount });
      setPlayer(response.player);
    });
  };

  const handleClaimExchangeOrder = async (orderId) => {
    await runAction(`market:claim:${orderId}`, async () => {
      const response = await requestAuthedJson("/api/market/claim-order", tokenRef.current, { orderId });
      setPlayer(response.player);
    });
  };

  const handleSpin = async () => {
    return runAction("spin", async () => {
      const response = await spinWheel(tokenRef.current);
      setPlayer(response.player);
      return {
        reward: response.reward,
        rewardId: response.rewardId,
        remainingSpins: (response.player?.state?.freeSpins || 0) + (response.player?.state?.fortunePoints || 0),
        showFortuneBonus: response.rewardId === "meat_60" && response.player?.ads?.pendingBonus?.productId === AD_FORTUNE_MEAT_BONUS_PRODUCT_ID
      };
    });
  };

  const handleSpinResultShown = (spinResult) => {
    if (spinResult?.showFortuneBonus) {
      setFortuneBonusOpen(true);
    }
  };

  const handleCreateInvoice = async (productId) => {
    await runAction(`invoice:${productId}`, async () => {
      const response = await createInvoice(tokenRef.current, productId, safeIdempotencyKey(productId));
      setLatestInvoice(response);

      if (response.devMode) {
        setBanner(`Dev invoice created for ${response.product.title}. Use the simulate button to finish the purchase.`);
        return;
      }

      if (!response.invoiceUrl) {
        throw new Error("Telegram invoice URL was not returned by the server.");
      }

      await openTelegramInvoice(response.invoiceUrl);
      setBanner(`Invoice opened for ${response.product.title}. Finish the purchase in Telegram, then return to the game.`);
    });
  };

  const handleWatchAd = async (productId, context = {}) => {
    await runAction(`ad:${productId}`, async () => {
      const response = await watchAdReward(tokenRef.current, productId, context);
      setPlayer(response.player);
      if (selectedStoreProductId === productId) {
        setSelectedStoreProductId("");
      }
      if (productId === AD_FORTUNE_MEAT_BONUS_PRODUCT_ID) {
        setFortuneBonusOpen(false);
      }
      setBanner(`Reward claimed from ${response.productId}.`);
    });
  };
  const handleClaimMagicBird = async () => {
    await runAction("magic-bird", async () => {
      const response = await claimMagicBird(tokenRef.current);
      setPlayer(response.player);
      setMagicBirdOffer(response.offer || null);
      setBanner("Magic bird left you a sky offer.");
    });
  };
  const handleCompleteDevPayment = async () => {
    if (!latestInvoice?.paymentId) return;

    await runAction(`dev-payment:${latestInvoice.paymentId}`, async () => {
      const response = await completeDevPayment(latestInvoice.paymentId);
      setPlayer(response.player);
      setLatestInvoice(null);
      setBanner("Dev payment completed and rewards were granted from the server.");
    });
  };

  const state = player?.state;
  const derived = player?.derived;
  const rawProducts = player?.products || [];
  const rawCollection = player?.collection || { entries: [] };
  const profileStats = player?.profileStats || {};
  const starterOffer = player?.offers?.starterSpin;
  const elitePassOffer = player?.offers?.elitePass;
  const localizedPass = useMemo(() => localizePass(t, player?.pass || null), [player?.pass, t]);
  const currentEraOrder = localizedPass?.currentEraOrder || player?.pass?.currentEraOrder || 1;
  const localizedProducts = useMemo(() => rawProducts.map((product) => localizeProduct(t, product)), [rawProducts, t]);
  const localizedCollection = useMemo(() => localizeCollection(t, rawCollection), [rawCollection, t]);
  const localizedQuests = useMemo(() => localizeQuests(t, state?.quests || []), [state?.quests, t]);
  const baseLaboratory = player?.laboratory || { unlocked: false, unlockCostGems: 250000, hatcheryUnlocked: false, geneCatalog: [], genotypeCatalog: [], eggProjects: [] };
  const localizedLaboratory = useMemo(() => localizeLaboratory(t, baseLaboratory), [baseLaboratory, t]);
  const localizedMagicBirdOffer = useMemo(() => localizeMagicBirdOffer(t, magicBirdOffer), [magicBirdOffer, t]);
  const shopDinos = useMemo(() => DINO_DEFS.filter((dino) => (dino.unlockEra || 1) <= currentEraOrder).map((dino) => localizeDino(t, dino)), [currentEraOrder, t]);
  const shopFernDinos = useMemo(() => FERN_DINOS.filter((dino) => (dino.unlockEra || 3) <= currentEraOrder).map((dino) => localizeDino(t, dino)), [currentEraOrder, t]);
  const localizedPromotions = useMemo(() => ZOO_PROMOTIONS.map((promotion) => localizePromotion(t, promotion)), [t]);
  const starterProduct = starterOffer?.product
    ? localizeProduct(t, starterOffer.product)
    : localizedProducts.find((product) => product.id === STARTER_OFFER_PRODUCT_ID) || null;
  const elitePassProduct = elitePassOffer?.product
    ? localizeProduct(t, elitePassOffer.product)
    : localizedProducts.find((product) => product.id === ELITE_PASS_PRODUCT_ID) || null;
  const starterInvoiceReady = Boolean(latestInvoice?.devMode && latestInvoice?.product?.id === starterProduct?.id);
  const elitePassInvoiceReady = Boolean(latestInvoice?.devMode && latestInvoice?.product?.id === elitePassProduct?.id);
  const shopProducts = localizedProducts.filter((product) => product.placement !== "starter" && product.placement !== "pass" && product.placement !== "reward");
  const selectedStoreProduct = localizedProducts.find((product) => product.id === selectedStoreProductId) || null;
  const selectedStoreInvoiceReady = Boolean(latestInvoice?.devMode && latestInvoice?.product?.id === selectedStoreProduct?.id);
  const fortuneBonusProduct = localizedProducts.find((product) => product.id === AD_FORTUNE_MEAT_BONUS_PRODUCT_ID) || null;
  const fortunePendingBonus = player?.ads?.pendingBonus || null;
  const magicBirdEvent = player?.events?.magicBird || null;
  const magicBirdModalProduct = localizedMagicBirdOffer
    ? {
        id: "magic_bird_offer",
        kind: "event",
        title: localizedMagicBirdOffer.title || t("magicbird.skySurprise", {}, "Sky surprise"),
        description: localizedMagicBirdOffer.description || t("magicbird.description", {}, "A flying visitor brought a tiny magical offer to your zoo."),
        highlightText: t("magicbird.skySurprise", {}, "Sky surprise")
      }
    : null;
  const purchaseMilestoneModalProduct = purchaseMilestoneReward
    ? {
        id: "purchase_milestone_reward",
        kind: "event",
        title: purchaseMilestoneReward?.bonusDino?.name ? t("milestone.jackpot", {}, "Zoo streak jackpot") : t("milestone.reward", {}, "Zoo streak reward"),
        description: describePurchaseMilestoneReward(purchaseMilestoneReward),
        highlightText: t("milestone.purchasesCount", { count: purchaseMilestoneReward.totalPurchases }, `${purchaseMilestoneReward.totalPurchases} dino purchases`)
      }
    : null;
  const isReady = Boolean(player && token && status !== "booting");
  const isLocked = status === "blocked" || !player || !token;
  const navItems = NAV_ITEMS.map((item) => ({
    ...item,
    label: t(item.labelKey, {}, item.fallback)
  }));
  const lastOwned = useMemo(() => {
    if (!state?.owned) return "velociraptor";
    const ownedIds = Object.keys(state.owned).filter((id) => (state.owned[id] || 0) > 0);
    return ownedIds[ownedIds.length - 1] || "velociraptor";
  }, [state]);

  if (!isReady) {
    return (
      <LoadingScreen
        progress={bootProgress}
        message={banner || bootMessage}
        blocked={status === "blocked"}
        onRetry={() => void bootstrap()}
      />
    );
  }

  const styles = {
    pageBg: {
      minHeight: "100vh",
      background: "linear-gradient(180deg,#020617,#0f172a 28%,#1e1b4b 62%,#312e81 100%)",
      color: "#fff",
      fontFamily: "'Trebuchet MS', 'Segoe UI', Arial, sans-serif"
    },
    headerShell: {
      position: "sticky",
      top: 0,
      zIndex: 30,
      backdropFilter: "blur(18px)",
      background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(29,78,216,0.72), rgba(124,58,237,0.62))",
      borderBottom: "1px solid rgba(255,255,255,0.08)"
    },
    headerInner: {
      maxWidth: 960,
      margin: "0 auto",
      padding: isCompact ? "6px 8px 8px" : "10px 14px 10px",
      display: "grid",
      gap: isCompact ? 6 : 8
    },
    brandRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: isCompact ? 6 : 12,
      flexWrap: "wrap"
    },
    brandEyebrow: {
      fontSize: isCompact ? 10 : 12,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "#e2e8f0",
      fontWeight: 900
    },
    headerRight: {
      display: "flex",
      gap: isCompact ? 6 : 8,
      justifyItems: isCompact ? "start" : "end",
      alignItems: "center",
      flexWrap: "wrap"
    },
    languageLabel: {
      display: "grid",
      gap: 3,
      fontSize: isCompact ? 9 : 11,
      color: "#cbd5e1"
    },
    languageSelect: {
      minWidth: isCompact ? 88 : 118,
      borderRadius: 9,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(15,23,42,0.72)",
      color: "#f8fafc",
      padding: isCompact ? "4px 7px" : "6px 9px",
      fontSize: isCompact ? 10 : 11
    },
    adminLink: {
      padding: isCompact ? "5px 9px" : "7px 12px",
      borderRadius: 999,
      textDecoration: "none",
      color: "#04161f",
      background: "linear-gradient(180deg,#67e8f9,#22d3ee)",
      fontWeight: 900,
      fontSize: isCompact ? 10 : 12,
      boxShadow: "0 12px 20px rgba(8,145,178,0.28)"
    },
    viewerLabel: {
      fontSize: isCompact ? 9 : 11,
      color: "#cbd5e1"
    },
    resourceGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
      gap: isCompact ? 4 : 6
    },
    resourceChip: {
      minHeight: isCompact ? 34 : 40,
      padding: isCompact ? "5px 6px" : "6px 8px",
      borderRadius: isCompact ? 12 : 14,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(15,23,42,0.48)",
      display: "flex",
      alignItems: "center",
      gap: isCompact ? 5 : 7,
      overflow: "hidden"
    },
    resourceIcon: {
      width: isCompact ? 18 : 20,
      height: isCompact ? 18 : 20,
      flex: "0 0 auto",
      borderRadius: 6,
      backgroundColor: "rgba(255,255,255,0.06)",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "contain",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)"
    },
    resourceValueCompact: {
      minWidth: 0,
      fontSize: isCompact ? 11 : 12,
      lineHeight: 1,
      fontWeight: 900,
      color: "#f8fafc",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    container: {
      maxWidth: 960,
      margin: "0 auto",
      padding: isCompact ? "12px 10px calc(92px + env(safe-area-inset-bottom, 0px))" : "16px 14px calc(120px + env(safe-area-inset-bottom, 0px))"
    },
    bottomNav: {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 35,
      padding: isCompact ? "8px 8px calc(8px + env(safe-area-inset-bottom, 0px))" : "10px 12px calc(10px + env(safe-area-inset-bottom, 0px))",
      background: "linear-gradient(180deg, rgba(8,18,41,0), rgba(29,78,216,0.62) 22%, rgba(15,23,42,0.96))",
      backdropFilter: "blur(16px)"
    },
    bottomNavInner: {
      maxWidth: 960,
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      gap: isCompact ? 6 : 8
    },
    bottomNavButton: (active) => ({
      minHeight: isCompact ? 48 : 60,
      padding: isCompact ? "6px 4px" : "8px 6px",
      borderRadius: isCompact ? 14 : 18,
      border: active ? "1px solid rgba(103,232,249,0.32)" : "1px solid rgba(255,255,255,0.08)",
      background: active ? "linear-gradient(180deg, rgba(252,211,77,0.34), rgba(236,72,153,0.22))" : "rgba(15,23,42,0.78)",
      color: active ? "#ecfeff" : "#94a3b8",
      fontWeight: 800,
      fontSize: isCompact ? 10 : 12,
      lineHeight: 1.05,
      letterSpacing: "0.01em",
      boxShadow: active ? "0 10px 18px rgba(34,211,238,0.18)" : "none"
    })
  };

  return (
    <div style={styles.pageBg}>
      <header style={styles.headerShell}>
        <div style={styles.headerInner}>
          <div style={styles.brandRow}>
            <div style={styles.brandEyebrow}>{isCompact ? "DinoMeat" : t("brand.eyebrow", {}, "DinoMeat Island")}</div>

            <div style={styles.headerRight}>
              <label style={styles.languageLabel}>
                <span>{t("language.label", {}, "Language")}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)} style={styles.languageSelect}>
                  {languages.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
              </label>
              {isAdmin ? <a href={ADMIN_URL} style={styles.adminLink}>{t("header.admin", {}, "Admin")}</a> : null}
              <div style={styles.viewerLabel}>{t("header.player", { name: viewer?.username || viewer?.firstName || viewer?.id || "telegram" }, "@{name}")}</div>
            </div>
          </div>

          <div style={styles.resourceGrid}>
            <div style={styles.resourceChip} title={t("resource.meat", {}, "Meat")}>
              <div style={{ ...styles.resourceIcon, backgroundImage: `url(${RESOURCE_ICONS.meat})` }} />
              <div style={styles.resourceValueCompact}>{formatCompactNumber(state.meat || 0)}</div>
            </div>
            <div style={styles.resourceChip} title={t("resource.ferns", {}, "Ferns")}>
              <div style={{ ...styles.resourceIcon, backgroundImage: `url(${RESOURCE_ICONS.ferns})` }} />
              <div style={styles.resourceValueCompact}>{formatCompactNumber(state.ferns || 0)}</div>
            </div>
            <div style={styles.resourceChip} title={t("resource.spins", {}, "Spins")}>
              <div style={{ ...styles.resourceIcon, backgroundImage: `url(${RESOURCE_ICONS.spins})` }} />
              <div style={styles.resourceValueCompact}>{formatCompactNumber((state.freeSpins || 0) + (state.fortunePoints || 0))}</div>
            </div>
            <div style={styles.resourceChip} title={t("resource.gems", {}, "Gems")}>
              <div style={{ ...styles.resourceIcon, backgroundImage: `url(${RESOURCE_ICONS.gems})` }} />
              <div style={styles.resourceValueCompact}>{formatSoftNumber(state.gems || 0)}</div>
            </div>
            <div style={styles.resourceChip} title={t("resource.charm", {}, "Attractiveness")}>
              <div style={{ ...styles.resourceIcon, backgroundImage: `url(${RESOURCE_ICONS.charm})` }} />
              <div style={styles.resourceValueCompact}>{formatCompactNumber(derived?.totalAttractiveness || 0)}</div>
            </div>
          </div>
        </div>
      </header>

      <main style={styles.container}>
        {banner ? (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: isLocked ? "rgba(220,38,38,0.18)" : "rgba(14,165,164,0.18)", border: `1px solid ${isLocked ? "rgba(248,113,113,0.35)" : "rgba(45,212,191,0.3)"}` }}>
            <div style={{ fontWeight: 700 }}>{banner}</div>
            {isLocked ? <button onClick={() => void bootstrap()} style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "none", background: "#06b6d4", color: "#04232b", fontWeight: 800 }}>{t("banner.reconnect", {}, "Reconnect")}</button> : null}
          </div>
        ) : null}

        {view === "clicker" ? (
          <Clicker
            onTap={handleTap}
            clickPower={state.clickPower}
            buyClickUpgrade={() => void handleUpgradeClick()}
            clickUpgrades={state.clickUpgrades}
            clickUpgradePrice={derived?.clickUpgradePrice || 0}
            dinoFile={`dinos/${lastOwned}.png`}
            backgroundFile="dinos/bg_jungle.png"
            productionPerSec={derived?.productionPerSec || 0}
            fernProductionPerSec={derived?.fernProductionPerSec || 0}
            totalAttractiveness={derived?.totalAttractiveness || 0}
            pass={localizedPass}
            onOpenPass={() => setPassOpen(true)}
            fmt={formatCompactNumber}
          />
        ) : null}

        {view === "shop" ? (
          <div style={{ display: "grid", gap: 18 }}>
            <section>
              <h3 style={{ marginBottom: 8 }}>{t("section.dinosaurs", {}, "Dinosaurs")}</h3>
              <Shop
                dinos={shopDinos}
                fernDinos={shopFernDinos}
                promotions={localizedPromotions}
                collection={localizedCollection}
                owned={state.owned}
                meat={state.meat}
                ferns={state.ferns}
                buyDino={(dino, sex) => void handlePurchaseDino(dino, sex)}
                buyUniqueDino={(dino, sex) => void handlePurchaseDino(dino, sex)}
                buyPromotion={(promotion) => void handlePurchaseDino(promotion)}
              />
            </section>

            <section>
              <h3 style={{ marginBottom: 8 }}>{t("section.premiumStore", {}, "Premium Store")}</h3>
              <div style={{ display: "grid", gap: isCompact ? 8 : 10, gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))" }}>
                {shopProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedStoreProductId(product.id)}
                    style={{
                      padding: isCompact ? 10 : 12,
                      borderRadius: isCompact ? 14 : 18,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: product.kind === "ad" ? "linear-gradient(180deg, rgba(8,145,178,0.18), rgba(79,70,229,0.14))" : "rgba(255,255,255,0.04)",
                      color: "#f8fafc",
                      display: "grid",
                      gridTemplateRows: "auto 80px auto",
                      gap: 8,
                      textAlign: "left",
                      minHeight: isCompact ? 156 : 174,
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                      <div style={{ fontWeight: 900, fontSize: isCompact ? 12 : 14, lineHeight: 1.15 }}>{product.title}</div>
                      {product.highlightText ? <div style={{ fontSize: 9, color: "#fcd34d", textAlign: "right" }}>{product.highlightText}</div> : null}
                    </div>

                    <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(148,163,184,0.26)", display: "grid", placeItems: "center", color: product.kind === "ad" ? "#67e8f9" : "#c4b5fd", fontSize: isCompact ? 12 : 13, fontWeight: 800 }}>
                      {getProductGraphicLabel(product)}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 8 }}>
                      <div style={{ fontSize: isCompact ? 12 : 14, fontWeight: 900 }}>{formatPriceLabel(product)}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{t("premium.tap", {}, "Tap")}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {view === "dinosaurs" ? (
          <DinoCollection
            collection={localizedCollection}
            fmt={formatCompactNumber}
            meat={state.meat}
            ferns={state.ferns}
            gems={state.gems}
            ticketPrice={state.ticketPrice}
            gemIncomePerSec={derived?.gemIncomePerSec || 0}
            productionPerSec={derived?.productionPerSec || 0}
            fernProductionPerSec={derived?.fernProductionPerSec || 0}
            zooEconomy={derived?.zooEconomy || null}
            zooHistory={derived?.zooHistory || null}
            market={player?.market || null}
            onSaveTicketPrice={(value) => void handleSetTicketPrice(value)}
            ticketBusy={ticketBusy}
            laboratory={localizedLaboratory}
            labCatalog={[...shopDinos, ...shopFernDinos]}
            onBuyLaboratory={() => void handleBuyLaboratory()}
            onUnlockHatchery={() => void handleUnlockHatchery()}
            onCreateLabEgg={(dino, sex) => void handleCreateLabEgg(dino, sex)}
            onBuyGene={(projectId, geneId) => void handleBuyGene(projectId, geneId)}
            onBuyGenotype={(projectId, genotypeId) => void handleBuyGenotype(projectId, genotypeId)}
            onHatchEgg={(projectId) => void handleHatchEgg(projectId)}
            onBreed={(motherSpeciesId, fatherSpeciesId) => void handleBreed(motherSpeciesId, fatherSpeciesId)}
            onCreateExchangeOrder={(routeId, resourceType, amount) => void handleCreateExchangeOrder(routeId, resourceType, amount)}
            onClaimExchangeOrder={(orderId) => void handleClaimExchangeOrder(orderId)}
            busyAction={busyAction}
          />
        ) : null}

        {view === "quests" ? (
          <Quests quests={localizedQuests} claimQuest={(questId) => void handleClaimQuest(questId)} />
        ) : null}

        {view === "profile" ? (
          <ProfileHub
            viewer={viewer}
            pass={localizedPass}
            profileStats={profileStats}
            userReferralCode={state.userReferralCode}
            referralStats={state.referralStats}
            referral={player?.referral}
            claimQuest={(questId) => void handleClaimQuest(questId)}
            onCopyReferral={() => setBanner(t("referrals.copiedBanner", {}, "Referral link copied."))}
          />
        ) : null}

        {view === "fortune" ? (
          <DinoFeeder
            fortunePoints={state.fortunePoints}
            freeSpins={state.freeSpins}
            productionPerSec={derived?.productionPerSec || 0}
            fernProductionPerSec={derived?.fernProductionPerSec || 0}
            isBusy={Boolean(busyAction)}
            onSpin={handleSpin}
            onSpinResultShown={handleSpinResultShown}
          />
        ) : null}
      </main>

      <MagicBird
        active={Boolean(magicBirdEvent?.ready) && !selectedStoreProduct && !starterOfferOpen && !elitePassOfferOpen && !fortuneBonusOpen && !magicBirdOffer}
        compact={isCompact}
        busy={busyAction === "magic-bird"}
        remainingSeconds={magicBirdEvent?.remainingSeconds || 0}
        onClick={() => void handleClaimMagicBird()}
      />

      <StoreProductModal
        open={Boolean(magicBirdModalProduct)}
        product={magicBirdModalProduct}
        badge={t("premium.badgeMagicBird", {}, "Magic Bird")}
        title={localizedMagicBirdOffer?.title || t("magicbird.skySurprise", {}, "Sky surprise")}
        description={localizedMagicBirdOffer?.description || t("magicbird.description", {}, "A flying visitor brought a tiny magical offer to your zoo.")}
        rewardLabel={formatRewardList(t, localizedMagicBirdOffer?.reward || {})}
        priceLabel={magicBirdEvent?.cooldownSeconds ? t("magicbird.backIn", { minutes: Math.ceil((magicBirdEvent.cooldownSeconds || 0) / 60) }, `Back in ${Math.ceil((magicBirdEvent.cooldownSeconds || 0) / 60)} min`) : t("magicbird.skyEvent", {}, "Sky event")}
        graphicLabel="Magic bird art"
        actionLabel={t("premium.freeAction", {}, "Nice")}
        busyLabel={t("premium.freeAction", {}, "Nice")}
        onClose={() => setMagicBirdOffer(null)}
        onAction={() => setMagicBirdOffer(null)}
      />
      <StoreProductModal
        open={Boolean(purchaseMilestoneModalProduct)}
        product={purchaseMilestoneModalProduct}
        badge={t("premium.badgeZooBonus", {}, "Zoo Bonus")}
        title={purchaseMilestoneModalProduct?.title || "Zoo streak reward"}
        description={purchaseMilestoneModalProduct?.description || "Your visitors dropped a surprise reward."}
        rewardLabel={formatPurchaseMilestoneReward(purchaseMilestoneReward)}
        priceLabel={t("premium.freeBonus", {}, "Free bonus")}
        graphicLabel={purchaseMilestoneReward?.bonusDino?.name ? `${purchaseMilestoneReward.bonusDino.name} gift art` : "Spin burst art"}
        actionLabel="Nice"
        busyLabel="Nice"
        onClose={() => setPurchaseMilestoneReward(null)}
        onAction={() => setPurchaseMilestoneReward(null)}
      />
      <nav style={styles.bottomNav} aria-label="Main navigation">
        <div style={styles.bottomNavInner}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              style={styles.bottomNavButton(view === item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <StoreProductModal
        open={Boolean(selectedStoreProduct)}
        product={selectedStoreProduct}
        badge={selectedStoreProduct?.kind === "ad" ? t("premium.badgeAd", {}, "Ad Reward") : t("premium.badgeStore", {}, "Premium Store")}
        rewardLabel={formatProductRewardLabel(t, selectedStoreProduct, derived?.productionPerSec || 0)}
        priceLabel={formatLocalizedPrice(t, selectedStoreProduct)}
        graphicLabel={formatGraphicalLabel(t, selectedStoreProduct)}
        actionLabel={selectedStoreProduct?.kind === "ad" ? t("premium.watchAd", {}, "Watch ad") : t("premium.buyFor", { price: formatLocalizedPrice(t, selectedStoreProduct) }, `Buy for ${formatLocalizedPrice(t, selectedStoreProduct)}`)}
        busyLabel={selectedStoreProduct?.kind === "ad" ? t("premium.claimingReward", {}, "Claiming reward...") : t("premium.openInvoice", {}, "Opening invoice...")}
        busy={busyAction === `invoice:${selectedStoreProduct?.id}` || busyAction === `ad:${selectedStoreProduct?.id}`}
        devInvoiceReady={selectedStoreInvoiceReady}
        onClose={() => setSelectedStoreProductId("")}
        onAction={() => {
          if (!selectedStoreProduct) return;
          if (selectedStoreProduct.kind === "ad") {
            void handleWatchAd(selectedStoreProduct.id);
            return;
          }
          void handleCreateInvoice(selectedStoreProduct.id);
        }}
        onCompleteDev={() => void handleCompleteDevPayment()}
      />

      <StoreProductModal
        open={fortuneBonusOpen && Boolean(fortuneBonusProduct) && Boolean(fortunePendingBonus?.productId)}
        product={fortuneBonusProduct}
        badge={t("premium.badgeFortune", {}, "Fortune Bonus")}
        title={t("premium.fortuneTitle", {}, "Make that meat spin 5x bigger")}
        description={t("premium.fortuneDescription", {}, "You just landed a 60 minute meat reward. Watch an ad now and upgrade that one hit into a much bigger payout.")}
        rewardLabel={fortunePendingBonus?.baseMeat
          ? t("premium.totalMeatExtra", { total: formatCompactNumber((fortunePendingBonus.baseMeat || 0) * AD_FORTUNE_MEAT_MULTIPLIER), extra: formatCompactNumber((fortunePendingBonus.baseMeat || 0) * (AD_FORTUNE_MEAT_MULTIPLIER - 1)) }, `${formatCompactNumber((fortunePendingBonus.baseMeat || 0) * AD_FORTUNE_MEAT_MULTIPLIER)} total meat (${formatCompactNumber((fortunePendingBonus.baseMeat || 0) * (AD_FORTUNE_MEAT_MULTIPLIER - 1))} extra)`)
          : t("premium.upgradeToX", { multiplier: AD_FORTUNE_MEAT_MULTIPLIER }, `Upgrade to x${AD_FORTUNE_MEAT_MULTIPLIER}`)}
        priceLabel={t("premium.watchAd", {}, "Watch Ad")}
        graphicLabel="Fortune bonus art"
        actionLabel={t("premium.watchAdForX5", {}, "Watch ad for x5")}
        busyLabel={t("premium.claimingReward", {}, "Claiming reward...")}
        busy={busyAction === `ad:${fortuneBonusProduct?.id}`}
        onClose={() => setFortuneBonusOpen(false)}
        onAction={() => {
          if (fortuneBonusProduct) {
            void handleWatchAd(fortuneBonusProduct.id, { multiplier: AD_FORTUNE_MEAT_MULTIPLIER });
          }
        }}
      />

      <StarterOfferModal
        open={starterOfferOpen}
        product={starterProduct}
        busy={busyAction === `invoice:${starterProduct?.id}`}
        devInvoiceReady={starterInvoiceReady}
        onClose={() => setStarterOfferOpen(false)}
        onBuy={() => {
          if (starterProduct) {
            void handleCreateInvoice(starterProduct.id);
          }
        }}
        onCompleteDev={() => void handleCompleteDevPayment()}
      />

      <PassDrawer
        open={passOpen}
        onClose={() => setPassOpen(false)}
        pass={player?.pass}
        totalAttractiveness={derived?.totalAttractiveness || 0}
        elitePassOwned={Boolean(elitePassOffer?.alreadyPurchased)}
        onOpenElitePassOffer={() => setElitePassOfferOpen(true)}
      />

      <PurchaseProposalModal
        open={elitePassOfferOpen}
        product={elitePassProduct}
        badge={t("pass.eliteTrack", {}, "Elite Pass")}
        title={t("pass.unlockEliteTitle", {}, "Unlock the elite pass")}
        description={t("pass.unlockEliteDescription", {}, "Buy the premium track and claim the server-backed elite rewards with an instant spin burst.")}
        busy={busyAction === `invoice:${elitePassProduct?.id}`}
        devInvoiceReady={elitePassInvoiceReady}
        onClose={() => setElitePassOfferOpen(false)}
        onBuy={() => {
          if (elitePassProduct) {
            void handleCreateInvoice(elitePassProduct.id);
          }
        }}
        onCompleteDev={() => void handleCompleteDevPayment()}
      />
    </div>
  );
}














































