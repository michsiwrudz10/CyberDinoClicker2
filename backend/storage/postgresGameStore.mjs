import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { DEFAULT_STORE_PRODUCTS } from "../../shared/game-content.mjs";
import { SQLiteGameStore } from "./sqliteGameStore.mjs";

const ADVISORY_LOCK_KEY = 582144901;

const TABLES = [
  {
    name: "players",
    columns: [
      "telegram_user_id",
      "username",
      "first_name",
      "last_name",
      "language_code",
      "referral_code",
      "referred_by_telegram_user_id",
      "referred_by_code",
      "referred_at",
      "created_at",
      "updated_at",
      "last_seen_at"
    ]
  },
  {
    name: "player_state",
    columns: [
      "telegram_user_id",
      "meat",
      "click_power",
      "click_upgrades",
      "ferns",
      "total_purchases",
      "fortune_points",
      "free_spins",
      "spin_index",
      "lifetime_clicks",
      "gems",
      "ticket_price",
      "loyal_visitors",
      "laboratory_unlocked",
      "laboratory_unlocked_at",
      "hatchery_unlocked",
      "hatchery_unlocked_at",
      "dino_genes_json",
      "lab_projects_json",
      "modified_dinos_json",
      "zoo_history_json",
      "ad_boosts_json",
      "pending_ad_bonus_json",
      "ad_views_count",
      "magic_bird_last_claimed_at",
      "magic_bird_claim_count",
      "referral_successful_invites",
      "referral_pending_invites",
      "claimed_invite_milestones_json",
      "click_chain_started_at",
      "last_click_at",
      "suspicious_click_flagged_at",
      "suspicious_click_chain_seconds",
      "last_passive_at",
      "created_at",
      "updated_at"
    ],
    jsonColumns: new Set([
      "dino_genes_json",
      "lab_projects_json",
      "modified_dinos_json",
      "zoo_history_json",
      "ad_boosts_json",
      "pending_ad_bonus_json",
      "claimed_invite_milestones_json"
    ]),
    booleanColumns: new Set(["laboratory_unlocked", "hatchery_unlocked"])
  },
  {
    name: "player_inventory",
    columns: ["telegram_user_id", "item_id", "quantity", "updated_at"]
  },
  {
    name: "player_dino_progress",
    columns: ["telegram_user_id", "dino_id", "first_acquired_at", "last_acquired_at", "instances_json", "updated_at"],
    jsonColumns: new Set(["instances_json"])
  },
  {
    name: "player_quests",
    columns: ["telegram_user_id", "quest_id", "type", "title_template", "title", "level", "target", "progress", "reward_json", "link", "sort_order", "updated_at"],
    jsonColumns: new Set(["reward_json"])
  },
  {
    name: "shop_products",
    columns: ["product_id", "kind", "title", "description", "reward_type", "reward_amount", "stars_price", "currency", "price_label", "placement", "highlight_text", "active", "updated_at"],
    booleanColumns: new Set(["active"])
  },
  {
    name: "telegram_payments",
    columns: ["payment_id", "telegram_user_id", "product_id", "status", "invoice_url", "invoice_slug", "external_charge_id", "idempotency_key", "reward_type", "reward_amount", "stars_price", "raw_payload", "granted_at", "created_at", "updated_at"],
    jsonColumns: new Set(["raw_payload"])
  },
  {
    name: "transactions",
    columns: ["transaction_id", "telegram_user_id", "type", "amount_meat", "amount_gems", "amount_ferns", "amount_free_spins", "amount_fortune_points", "item_id", "item_count", "source", "metadata_json", "idempotency_key", "created_at"],
    jsonColumns: new Set(["metadata_json"])
  },
  {
    name: "admin_users",
    columns: ["telegram_user_id", "created_at"]
  },
  {
    name: "admin_audit_log",
    columns: ["audit_id", "admin_telegram_user_id", "target_telegram_user_id", "action", "metadata_json", "created_at"],
    jsonColumns: new Set(["metadata_json"])
  },
  {
    name: "player_exchange_orders",
    columns: ["order_id", "telegram_user_id", "route_id", "route_name", "route_description", "image_key", "resource_type", "resource_amount", "gem_reward", "duration_hours", "created_at", "ready_at", "claimed_at", "updated_at"]
  }
];

const SQLITE_CLEAR_ORDER = [...TABLES].reverse().map((table) => table.name);

function shouldUseSsl(connectionString) {
  const lower = String(connectionString || "").toLowerCase();
  return lower.includes("sslmode=require") || lower.includes("neon.tech");
}

function normalizeAdminIds(adminIds = []) {
  return [...new Set(
    adminIds
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function toSqliteValue(table, column, value) {
  if (value === undefined || value === null) return null;
  if (table.jsonColumns?.has(column)) return JSON.stringify(value);
  if (table.booleanColumns?.has(column)) return value ? 1 : 0;
  return value;
}

function toPostgresValue(table, column, value) {
  if (value === undefined || value === null) return null;
  if (table.jsonColumns?.has(column)) return JSON.stringify(JSON.parse(String(value || "{}")));
  if (table.booleanColumns?.has(column)) return Number(value) > 0;
  return value;
}

function buildInsertSql(table, placeholderPrefix = "$") {
  const columnList = table.columns.join(", ");
  const placeholders = placeholderPrefix === "?"
    ? table.columns.map(() => "?").join(", ")
    : table.columns.map((_, index) => `${placeholderPrefix}${index + 1}`).join(", ");
  return `INSERT INTO ${table.name} (${columnList}) VALUES (${placeholders})`;
}

async function readSchemaSql() {
  return readFile(resolve(process.cwd(), "backend", "db", "schema.sql"), "utf8");
}

export class PostgresGameStore {
  constructor(databaseUrl, options = {}) {
    this.databaseUrl = String(databaseUrl || "").trim();
    this.adminIds = normalizeAdminIds(options.adminIds || []);
    this.cacheFilePath = options.cacheFilePath || resolve(process.cwd(), "backend", "data", "postgres-runtime-cache.sqlite");
    this.pool = new Pool({
      connectionString: this.databaseUrl,
      ssl: shouldUseSsl(this.databaseUrl)
        ? { rejectUnauthorized: false }
        : undefined
    });
    this.sqliteStore = new SQLiteGameStore(this.cacheFilePath, {
      adminIds: this.adminIds
    });
    this.readyPromise = null;
    this.hydrationPromise = null;
    this.cacheHydrated = false;
    this.queue = Promise.resolve();
    this.persistTimer = null;
    this.persistQueued = false;
    this.persistInFlight = false;
    this.persistPromise = Promise.resolve();
  }

  async initialize() {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(await readSchemaSql());
      await this.seedShopProducts(client);
      await this.seedAdminUsers(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureReady() {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize();
    }
    return this.readyPromise;
  }

  async ensureHydrated(force = false) {
    if (!force && this.cacheHydrated) {
      return;
    }

    if (!force && this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = (async () => {
      await this.ensureReady();
      const client = await this.pool.connect();

      try {
        await this.syncPostgresToSqlite(client);
        this.cacheHydrated = true;
      } finally {
        client.release();
        this.hydrationPromise = null;
      }
    })();

    return this.hydrationPromise;
  }

  enqueue(task) {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  schedulePersist(delayMs = 200) {
    this.persistQueued = true;
    if (this.persistTimer) return this.persistPromise;

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushPersistQueue().catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));

    this.persistTimer.unref?.();
    return this.persistPromise;
  }

  async flushPersistQueue(force = false) {
    if (!force && !this.persistQueued && !this.persistInFlight) {
      return this.persistPromise;
    }

    if (this.persistInFlight) {
      return this.persistPromise;
    }

    this.persistQueued = false;
    this.persistInFlight = true;

    this.persistPromise = (async () => {
      await this.ensureReady();
      const client = await this.pool.connect();

      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
        await this.syncSqliteToPostgres(client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    })();

    try {
      return await this.persistPromise;
    } finally {
      this.persistInFlight = false;
      if (this.persistQueued) {
        this.schedulePersist(0);
      }
    }
  }

  async seedShopProducts(client) {
    for (const product of DEFAULT_STORE_PRODUCTS) {
      await client.query(`
        INSERT INTO shop_products (
          product_id, kind, title, description, reward_type, reward_amount, stars_price, currency, price_label, placement, highlight_text, active, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (product_id) DO UPDATE SET
          kind = EXCLUDED.kind,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          reward_type = EXCLUDED.reward_type,
          reward_amount = EXCLUDED.reward_amount,
          stars_price = EXCLUDED.stars_price,
          currency = EXCLUDED.currency,
          price_label = EXCLUDED.price_label,
          placement = EXCLUDED.placement,
          highlight_text = EXCLUDED.highlight_text,
          active = EXCLUDED.active,
          updated_at = EXCLUDED.updated_at
      `, [
        product.id,
        product.kind || "stars",
        product.title,
        product.description,
        product.rewardType,
        product.rewardAmount,
        product.starsPrice,
        product.currency || "XTR",
        product.priceLabel || "",
        product.placement || "shop",
        product.highlightText || "",
        product.active !== false,
        new Date().toISOString()
      ]);
    }
  }

  async seedAdminUsers(client) {
    for (const adminId of this.adminIds) {
      await client.query(`
        INSERT INTO admin_users (telegram_user_id, created_at)
        SELECT telegram_user_id, $2
        FROM players
        WHERE telegram_user_id = $1
        ON CONFLICT (telegram_user_id) DO NOTHING
      `, [adminId, new Date().toISOString()]);
    }
  }

  resetLocalSqlite() {
    const db = this.sqliteStore.db;
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN;");
    try {
      for (const tableName of SQLITE_CLEAR_ORDER) {
        db.exec(`DELETE FROM ${tableName};`);
      }
      db.exec("DELETE FROM sqlite_sequence;");
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  async syncPostgresToSqlite(client) {
    this.resetLocalSqlite();
    const db = this.sqliteStore.db;
    db.exec("BEGIN;");

    try {
      for (const table of TABLES) {
        const rows = (await client.query(`SELECT ${table.columns.join(", ")} FROM ${table.name}`)).rows;
        if (!rows.length) continue;

        const statement = db.prepare(buildInsertSql(table, "?"));
        for (const row of rows) {
          const values = table.columns.map((column) => toSqliteValue(table, column, row[column]));
          statement.run(...values);
        }
      }

      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }

  async syncSqliteToPostgres(client) {
    await client.query(`
      TRUNCATE TABLE
        admin_audit_log,
        admin_users,
        transactions,
        telegram_payments,
        player_exchange_orders,
        player_quests,
        player_dino_progress,
        player_inventory,
        player_state,
        shop_products,
        players
      RESTART IDENTITY
      CASCADE
    `);

    const db = this.sqliteStore.db;

    for (const table of TABLES) {
      const rows = db.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all();
      if (!rows.length) continue;

      const sql = buildInsertSql(table, "$");
      for (const row of rows) {
        const values = table.columns.map((column) => toPostgresValue(table, column, row[column]));
        await client.query(sql, values);
      }
    }

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('transactions', 'transaction_id'),
        COALESCE((SELECT MAX(transaction_id) FROM transactions), 1),
        (SELECT COUNT(*) > 0 FROM transactions)
      )
    `);
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('admin_audit_log', 'audit_id'),
        COALESCE((SELECT MAX(audit_id) FROM admin_audit_log), 1),
        (SELECT COUNT(*) > 0 FROM admin_audit_log)
      )
    `);
  }

  async withStore(callback, { write = false, persistMode = "immediate", forceHydrate = false } = {}) {
    return this.enqueue(async () => {
      await this.ensureReady();
      await this.ensureHydrated(forceHydrate);

      try {
        const result = callback(this.sqliteStore);

        if (write) {
          if (persistMode === "background") {
            this.schedulePersist();
          } else {
            this.persistQueued = true;
            await this.flushPersistQueue(true);
          }
        }

        return result;
      } catch (error) {
        throw error;
      }
    });
  }

  getPlayerRow(telegramUserId) {
    return this.withStore((store) => store.getPlayerRow(telegramUserId));
  }

  ensurePlayer(telegramUser, incomingReferralCode = "") {
    return this.withStore((store) => store.ensurePlayer(telegramUser, incomingReferralCode), { write: true, persistMode: "immediate" });
  }

  setPlayerLanguage(telegramUserId, languageCode) {
    return this.withStore((store) => store.setPlayerLanguage(telegramUserId, languageCode), { write: true, persistMode: "background" });
  }

  getLanguageUsageStats() {
    return this.withStore((store) => store.getLanguageUsageStats());
  }

  isAdminUser(telegramUserId) {
    return this.withStore((store) => store.isAdminUser(telegramUserId));
  }

  getPlayerSnapshot(telegramUserId) {
    return this.withStore((store) => store.getPlayerSnapshot(telegramUserId), { write: true, persistMode: "background" });
  }

  tap(telegramUserId, count = 1) {
    return this.withStore((store) => store.tap(telegramUserId, count), { write: true, persistMode: "background" });
  }

  upgradeClick(telegramUserId) {
    return this.withStore((store) => store.upgradeClick(telegramUserId), { write: true, persistMode: "background" });
  }

  purchaseDino(telegramUserId, itemId, requestedSex = "") {
    return this.withStore((store) => store.purchaseDino(telegramUserId, itemId, requestedSex), { write: true, persistMode: "background" });
  }

  setTicketPrice(telegramUserId, ticketPrice) {
    return this.withStore((store) => store.setTicketPrice(telegramUserId, ticketPrice), { write: true, persistMode: "background" });
  }

  buyLaboratory(telegramUserId) {
    return this.withStore((store) => store.buyLaboratory(telegramUserId), { write: true, persistMode: "background" });
  }

  unlockHatchery(telegramUserId) {
    return this.withStore((store) => store.unlockHatchery(telegramUserId), { write: true, persistMode: "background" });
  }

  createLabEgg(telegramUserId, dinoId, requestedSex = "") {
    return this.withStore((store) => store.createLabEgg(telegramUserId, dinoId, requestedSex), { write: true, persistMode: "background" });
  }

  buyGene(telegramUserId, projectId, geneId) {
    return this.withStore((store) => store.buyGene(telegramUserId, projectId, geneId), { write: true, persistMode: "background" });
  }

  buyGenotype(telegramUserId, projectId, genotypeId) {
    return this.withStore((store) => store.buyGenotype(telegramUserId, projectId, genotypeId), { write: true, persistMode: "background" });
  }

  breedDinosaurs(telegramUserId, motherSpeciesId, fatherSpeciesId) {
    return this.withStore((store) => store.breedDinosaurs(telegramUserId, motherSpeciesId, fatherSpeciesId), { write: true, persistMode: "background" });
  }

  hatchProject(telegramUserId, projectId) {
    return this.withStore((store) => store.hatchProject(telegramUserId, projectId), { write: true, persistMode: "background" });
  }

  createExchangeOrder(telegramUserId, routeId, resourceType, amount) {
    return this.withStore((store) => store.createExchangeOrder(telegramUserId, routeId, resourceType, amount), { write: true, persistMode: "background" });
  }

  claimExchangeOrder(telegramUserId, orderId) {
    return this.withStore((store) => store.claimExchangeOrder(telegramUserId, orderId), { write: true, persistMode: "background" });
  }

  spin(telegramUserId, multiplier = 1) {
    return this.withStore((store) => store.spin(telegramUserId, multiplier), { write: true, persistMode: "background" });
  }

  claimQuest(telegramUserId, questId) {
    return this.withStore((store) => store.claimQuest(telegramUserId, questId), { write: true, persistMode: "background" });
  }

  watchAdReward(telegramUserId, productId, context = {}) {
    return this.withStore((store) => store.watchAdReward(telegramUserId, productId, context), { write: true, persistMode: "background" });
  }

  claimMagicBird(telegramUserId) {
    return this.withStore((store) => store.claimMagicBird(telegramUserId), { write: true, persistMode: "background" });
  }

  createPaymentIntent(telegramUserId, productId, idempotencyKey = null) {
    return this.withStore((store) => store.createPaymentIntent(telegramUserId, productId, idempotencyKey), { write: true, persistMode: "immediate" });
  }

  attachInvoiceToPayment(paymentId, invoiceData = {}) {
    return this.withStore((store) => store.attachInvoiceToPayment(paymentId, invoiceData), { write: true, persistMode: "immediate" });
  }

  completePayment(callbackPayload = {}) {
    return this.withStore((store) => store.completePayment(callbackPayload), { write: true, persistMode: "immediate" });
  }

  listPlayers(search = "", limit) {
    return this.withStore((store) => store.listPlayers(search, limit));
  }

  getPlayerDetail(telegramUserId) {
    return this.withStore((store) => store.getPlayerDetail(telegramUserId), { write: true, persistMode: "background" });
  }

  getSuspiciousClickers(limit) {
    return this.withStore((store) => store.getSuspiciousClickers(limit));
  }

  getLeaderboard(limit = 20) {
    return this.withStore((store) => store.getLeaderboard(limit));
  }

  grantResources(adminTelegramUserId, payload = {}) {
    return this.withStore((store) => store.grantResources(adminTelegramUserId, payload), { write: true, persistMode: "immediate" });
  }

  resetPlayer(adminTelegramUserId, payload = {}) {
    return this.withStore((store) => store.resetPlayer(adminTelegramUserId, payload), { write: true, persistMode: "immediate" });
  }

  getAuditLog(limit) {
    return this.withStore((store) => store.getAuditLog(limit));
  }
}
