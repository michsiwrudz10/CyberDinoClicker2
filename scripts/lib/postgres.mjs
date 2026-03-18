import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { Pool } from "pg";
import { DEFAULT_STORE_PRODUCTS } from "../../shared/game-content.mjs";

export function getDatabaseUrl() {
  const value = String(process.env.DATABASE_URL || "").trim();
  if (!value) {
    throw new Error("DATABASE_URL is missing. Paste the Neon connection string into your environment first.");
  }
  return value;
}

function shouldUseSsl(connectionString) {
  const lower = String(connectionString || "").toLowerCase();
  return lower.includes("sslmode=require") || lower.includes("neon.tech");
}

export function createPostgresPool() {
  const connectionString = getDatabaseUrl();
  return new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString)
      ? { rejectUnauthorized: false }
      : undefined
  });
}

export async function readPostgresSchemaSql() {
  const schemaPath = resolve(process.cwd(), "backend", "db", "schema.sql");
  return readFile(schemaPath, "utf8");
}

export function getAdminIds() {
  return String(process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function seedShopProducts(client) {
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

export async function seedAdminUsers(client) {
  const adminIds = getAdminIds();

  for (const adminId of adminIds) {
    await client.query(`
      INSERT INTO admin_users (telegram_user_id, created_at)
      SELECT telegram_user_id, $2
      FROM players
      WHERE telegram_user_id = $1
      ON CONFLICT (telegram_user_id) DO NOTHING
    `, [adminId, new Date().toISOString()]);
  }
}
