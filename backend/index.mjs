import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createGameStateStore } from "./storage/index.mjs";

const API_PORT = Number(process.env.API_PORT || 8787);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const SESSION_SECRET = process.env.SESSION_SECRET || TELEGRAM_BOT_TOKEN || "dev-session-secret";
const ALLOW_DEV_AUTH = String(process.env.ALLOW_DEV_AUTH || "").toLowerCase() === "1" || String(process.env.ALLOW_DEV_AUTH || "").toLowerCase() === "true";
const ALLOW_DEV_PAYMENTS = String(process.env.ALLOW_DEV_PAYMENTS || "").toLowerCase() === "1" || String(process.env.ALLOW_DEV_PAYMENTS || "").toLowerCase() === "true";
const TELEGRAM_AUTH_MAX_AGE_SECONDS = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 86400);
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const TELEGRAM_PAYMENT_PROVIDER_TOKEN = process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN || "";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function setCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin;
  const origin =
    ALLOWED_ORIGIN === "*"
      ? "*"
      : requestOrigin === ALLOWED_ORIGIN
        ? ALLOWED_ORIGIN
        : "null";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Telegram-Bot-Api-Secret-Token");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
}

async function readJsonBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
  }

  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function sendJson(req, res, statusCode, payload) {
  setCorsHeaders(req, res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function safeHexEqual(left, right) {
  const leftBuffer = Buffer.from(left || "", "hex");
  const rightBuffer = Buffer.from(right || "", "hex");

  if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signSessionPayload(encodedPayload) {
  return createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
}

function createSessionToken(telegramUserId) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(telegramUserId),
    iat: now,
    exp: now + 60 * 60 * 24 * 7
  };

  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signSessionPayload(encoded)}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) {
    throw new HttpError(401, "Missing session token.");
  }

  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = signSessionPayload(encodedPayload);

  if (signature !== expectedSignature) {
    throw new HttpError(401, "Invalid session token.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  if (!payload?.sub || !payload?.exp || payload.exp < now) {
    throw new HttpError(401, "Session expired.");
  }

  return payload;
}

function getBearerToken(req) {
  const raw = req.headers.authorization || "";
  if (!raw.startsWith("Bearer ")) return null;
  return raw.slice(7).trim();
}

function getRequiredSession(req, store) {
  const token = getBearerToken(req);
  const session = verifySessionToken(token);

  if (!store.getPlayerRow(session.sub)) {
    throw new HttpError(401, "Session user no longer exists.");
  }

  return session;
}

function parseTelegramUserFromInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    throw new HttpError(400, "Telegram initData is missing hash.");
  }

  if (!TELEGRAM_BOT_TOKEN) {
    throw new HttpError(503, "Telegram bot token is not configured on the server.");
  }

  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    entries.push([key, value]);
  }

  const dataCheckString = entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(TELEGRAM_BOT_TOKEN).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!safeHexEqual(hash, calculatedHash)) {
    throw new HttpError(401, "Telegram initData signature is invalid.");
  }

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    throw new HttpError(401, "Telegram initData has expired.");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new HttpError(400, "Telegram user payload is missing.");
  }

  try {
    return JSON.parse(userRaw);
  } catch {
    throw new HttpError(400, "Telegram user payload is invalid.");
  }
}

function getAuthenticatedTelegramUser(body) {
  if (body?.devUser) {
    if (!ALLOW_DEV_AUTH) {
      throw new HttpError(403, "Dev Telegram auth is disabled on this server.");
    }
    return body.devUser;
  }

  if (!body?.initData) {
    throw new HttpError(400, "Telegram initData is required.");
  }

  return parseTelegramUserFromInitData(body.initData);
}

async function callTelegramBotApi(method, payload) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new HttpError(503, "Telegram bot token is not configured.");
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.ok) {
    throw new HttpError(502, body?.description || `Telegram Bot API ${method} failed.`);
  }

  return body.result;
}

function extractInvoiceSlug(invoiceUrl) {
  if (!invoiceUrl) return "";

  try {
    const url = new URL(invoiceUrl);
    return url.pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

async function answerPreCheckoutQuery(preCheckoutQueryId, ok = true, errorMessage = "") {
  if (!TELEGRAM_BOT_TOKEN || !preCheckoutQueryId) return;

  await callTelegramBotApi("answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(ok ? {} : { error_message: errorMessage || "Unable to process payment." })
  });
}

function parsePaymentCallback(body) {
  if (body?.pre_checkout_query?.id) {
    return {
      type: "pre_checkout_query",
      preCheckoutQueryId: body.pre_checkout_query.id,
      paymentId: body.pre_checkout_query.invoice_payload || "",
      rawPayload: body
    };
  }

  const successfulPayment = body?.message?.successful_payment;
  if (successfulPayment) {
    return {
      type: "successful_payment",
      paymentId: successfulPayment.invoice_payload || successfulPayment.payload || "",
      externalChargeId:
        successfulPayment.telegram_payment_charge_id ||
        successfulPayment.provider_payment_charge_id ||
        "",
      rawPayload: body
    };
  }

  if (ALLOW_DEV_PAYMENTS && body?.paymentId) {
    return {
      type: "successful_payment",
      paymentId: String(body.paymentId),
      externalChargeId: String(body.externalChargeId || `dev-${body.paymentId}`),
      rawPayload: body
    };
  }

  return null;
}

function createRouter({ store, driver }) {
  return async function handleRequest(req, res) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "OPTIONS") {
      setCorsHeaders(req, res);
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(req, res, 200, {
          ok: true,
          storageDriver: driver,
          databaseReady: true,
          telegramBotConfigured: Boolean(TELEGRAM_BOT_TOKEN),
          devAuthEnabled: ALLOW_DEV_AUTH,
          devPaymentsEnabled: ALLOW_DEV_PAYMENTS,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/telegram/auth") {
        const body = await readJsonBody(req);
        const telegramUser = getAuthenticatedTelegramUser(body);
        const player = store.ensurePlayer(telegramUser, body?.referralCode || "");
        const token = createSessionToken(telegramUser.id);
        const isAdmin = store.isAdminUser(telegramUser.id);

        sendJson(req, res, 200, {
          ok: true,
          token,
          isAdmin,
          viewer: {
            id: String(telegramUser.id),
            username: telegramUser.username || "",
            firstName: telegramUser.first_name || "",
            lastName: telegramUser.last_name || "",
            languageCode: player?.telegramUser?.languageCode || telegramUser.language_code || ""
          },
          player
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/player/me") {
        const session = getRequiredSession(req, store);
        const player = store.getPlayerSnapshot(session.sub);
        sendJson(req, res, 200, {
          ok: true,
          isAdmin: store.isAdminUser(session.sub),
          player
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/player/language") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.setPlayerLanguage(session.sub, body?.languageCode);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/game/tap") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.tap(session.sub, body?.count || 1);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/game/upgrade-click") {
        const session = getRequiredSession(req, store);
        const player = store.upgradeClick(session.sub);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/game/purchase") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const result = store.purchaseDino(session.sub, body?.dinoId, body?.sex);
        sendJson(req, res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/ticket-price") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.setTicketPrice(session.sub, body?.ticketPrice);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/buy-laboratory") {
        const session = getRequiredSession(req, store);
        const player = store.buyLaboratory(session.sub);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/unlock-hatchery") {
        const session = getRequiredSession(req, store);
        const player = store.unlockHatchery(session.sub);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/create-egg") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.createLabEgg(session.sub, body?.dinoId, body?.sex);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/buy-gene") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.buyGene(session.sub, body?.projectId, body?.geneId);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/buy-genotype") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.buyGenotype(session.sub, body?.projectId, body?.genotypeId);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/hatch-egg") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.hatchProject(session.sub, body?.projectId);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/zoo/breed") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.breedDinosaurs(session.sub, body?.motherSpeciesId, body?.fatherSpeciesId);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/market/create-order") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const result = store.createExchangeOrder(session.sub, body?.routeId, body?.resourceType, body?.amount);
        sendJson(req, res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/market/claim-order") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const result = store.claimExchangeOrder(session.sub, body?.orderId);
        sendJson(req, res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/game/spin") {
        const session = getRequiredSession(req, store);
        const result = store.spin(session.sub);
        sendJson(req, res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/game/claim-quest") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const player = store.claimQuest(session.sub, body?.questId);
        sendJson(req, res, 200, { ok: true, player });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/ads/watch") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const result = store.watchAdReward(session.sub, body?.productId, body?.context || {});
        sendJson(req, res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/events/magic-bird/claim") {
        const session = getRequiredSession(req, store);
        const result = store.claimMagicBird(session.sub);
        sendJson(req, res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/payments/create-invoice") {
        const session = getRequiredSession(req, store);
        const body = await readJsonBody(req);
        const intent = store.createPaymentIntent(session.sub, body?.productId, body?.idempotencyKey || null);
        if (TELEGRAM_BOT_TOKEN) {
          const invoicePayload = {
            title: intent.product.title,
            description: intent.product.description,
            payload: intent.paymentId,
            currency: intent.product.currency || "XTR",
            prices: [{ label: intent.product.title, amount: intent.product.priceAmount || intent.product.starsPrice }]
          };

          if (intent.product.kind !== "stars") {
            if (!TELEGRAM_PAYMENT_PROVIDER_TOKEN) {
              throw new HttpError(503, "Fiat payments are not configured on this server yet.");
            }
            invoicePayload.provider_token = TELEGRAM_PAYMENT_PROVIDER_TOKEN;
          }

          const invoiceUrl = await callTelegramBotApi("createInvoiceLink", invoicePayload);

          store.attachInvoiceToPayment(intent.paymentId, {
            invoiceUrl,
            invoiceSlug: extractInvoiceSlug(invoiceUrl),
            rawPayload: {
              mode: intent.product.kind === "stars" ? "telegram_stars" : "telegram_fiat",
              productId: intent.product.id
            }
          });

          sendJson(req, res, 200, {
            ok: true,
            paymentId: intent.paymentId,
            product: intent.product,
            invoiceUrl,
            devMode: false
          });
          return;
        }

        if (!ALLOW_DEV_PAYMENTS) {
          throw new HttpError(503, "Telegram Stars are not configured on this server yet.");
        }

        store.attachInvoiceToPayment(intent.paymentId, {
          invoiceUrl: "",
          invoiceSlug: "dev",
          rawPayload: {
            mode: "dev",
            productId: intent.product.id
          }
        });

        sendJson(req, res, 200, {
          ok: true,
          paymentId: intent.paymentId,
          product: intent.product,
          invoiceUrl: "",
          devMode: true
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/payments/telegram/callback") {
        if (TELEGRAM_WEBHOOK_SECRET) {
          const suppliedSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
          if (suppliedSecret !== TELEGRAM_WEBHOOK_SECRET) {
            throw new HttpError(401, "Invalid Telegram webhook secret.");
          }
        }

        const body = await readJsonBody(req);
        const callback = parsePaymentCallback(body);
        if (!callback) {
          throw new HttpError(400, "Unsupported payment callback payload.");
        }

        if (callback.type === "pre_checkout_query") {
          await answerPreCheckoutQuery(callback.preCheckoutQueryId, true);
          sendJson(req, res, 200, { ok: true, acknowledged: true });
          return;
        }

        const result = store.completePayment(callback);
        sendJson(req, res, 200, { ok: true, ...result });
        return;
      }

      if (url.pathname.startsWith("/api/admin/")) {
        const session = getRequiredSession(req, store);
        if (!store.isAdminUser(session.sub)) {
          throw new HttpError(403, "Admin access is required.");
        }

        if (req.method === "GET" && url.pathname === "/api/admin/players") {
          const search = url.searchParams.get("search") || "";
          const players = store.listPlayers(search);
          sendJson(req, res, 200, { ok: true, players });
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/admin/leaderboard") {
          const limit = Number(url.searchParams.get("limit") || 20);
          const entries = store.getLeaderboard(limit);
          sendJson(req, res, 200, { ok: true, entries });
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/admin/suspicious-clickers") {
          const limit = Number(url.searchParams.get("limit") || 50);
          const players = store.getSuspiciousClickers(limit);
          sendJson(req, res, 200, { ok: true, players });
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/admin/languages") {
          const entries = store.getLanguageUsageStats();
          sendJson(req, res, 200, { ok: true, entries });
          return;
        }

        const playerMatch = url.pathname.match(/^\/api\/admin\/players\/([^/]+)$/);
        if (req.method === "GET" && playerMatch) {
          const telegramUserId = decodeURIComponent(playerMatch[1]);
          const detail = store.getPlayerDetail(telegramUserId);
          sendJson(req, res, 200, { ok: true, ...detail });
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/admin/grants") {
          const body = await readJsonBody(req);
          const player = store.grantResources(session.sub, body);
          sendJson(req, res, 200, { ok: true, player });
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/admin/resets") {
          const body = await readJsonBody(req);
          const player = store.resetPlayer(session.sub, body);
          sendJson(req, res, 200, { ok: true, player });
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/admin/audit-log") {
          const limit = Number(url.searchParams.get("limit") || 50);
          const entries = store.getAuditLog(limit);
          sendJson(req, res, 200, { ok: true, entries });
          return;
        }
      }

      throw new HttpError(404, "Not found.");
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      sendJson(req, res, statusCode, {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected server error."
      });
    }
  };
}

export function createAppServer() {
  const { driver, store } = createGameStateStore();
  return createServer(createRouter({ store, driver }));
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const server = createAppServer();
  server.listen(API_PORT, "127.0.0.1", () => {
    console.log(`Dino API listening on http://127.0.0.1:${API_PORT}`);
  });
}



