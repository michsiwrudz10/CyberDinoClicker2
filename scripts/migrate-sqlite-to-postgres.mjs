import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPostgresPool, readPostgresSchemaSql, seedAdminUsers, seedShopProducts } from "./lib/postgres.mjs";

function resolveSqliteFile() {
  const explicit = String(process.env.SQLITE_DB_FILE || process.env.GAME_DB_FILE || "").trim();
  if (explicit) return explicit;

  const backendDbPath = resolve(process.cwd(), "backend", "data", "dino.sqlite");
  const legacyDbPath = resolve(process.cwd(), "server", "data", "dino.sqlite");
  return existsSync(backendDbPath) || !existsSync(legacyDbPath) ? backendDbPath : legacyDbPath;
}

const SQLITE_TABLES = [
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

function mapValue(table, column, value) {
  if (value === undefined || value === null) return null;
  if (table.jsonColumns?.has(column)) return JSON.stringify(JSON.parse(String(value || "{}")));
  if (table.booleanColumns?.has(column)) return Number(value) > 0;
  return value;
}

function buildInsertSql(table) {
  const columnList = table.columns.join(", ");
  const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(", ");
  return `INSERT INTO ${table.name} (${columnList}) VALUES (${placeholders})`;
}

const sqliteFile = resolveSqliteFile();
if (!existsSync(sqliteFile)) {
  throw new Error(`SQLite source file not found: ${sqliteFile}`);
}

const sqlite = new DatabaseSync(sqliteFile, { readOnly: true });
const pool = createPostgresPool();

try {
  const schemaSql = await readPostgresSchemaSql();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
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

    for (const table of SQLITE_TABLES) {
      const rows = sqlite.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all();
      if (!rows.length) continue;

      const sql = buildInsertSql(table);
      for (const row of rows) {
        const values = table.columns.map((column) => mapValue(table, column, row[column]));
        await client.query(sql, values);
      }
    }

    await seedShopProducts(client);
    await seedAdminUsers(client);
    await client.query("COMMIT");
    console.log(`Migrated SQLite data from ${sqliteFile} to PostgreSQL.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  sqlite.close();
  await pool.end();
}
