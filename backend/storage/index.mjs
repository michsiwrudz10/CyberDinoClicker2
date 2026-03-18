import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresGameStore } from "./postgresGameStore.mjs";
import { SQLiteGameStore } from "./sqliteGameStore.mjs";

function getAdminIds() {
  return String(process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createGameStateStore() {
  const configuredDriver = (process.env.STORAGE_DRIVER || "").toLowerCase();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const inferredDriver = databaseUrl && !databaseUrl.toLowerCase().startsWith("file:")
    ? "postgres"
    : "sqlite";
  const driver = configuredDriver || inferredDriver;

  const backendDbPath = resolve(process.cwd(), "backend", "data", "dino.sqlite");
  const legacyDbPath = resolve(process.cwd(), "server", "data", "dino.sqlite");
  let filePath = process.env.GAME_DB_FILE || (existsSync(backendDbPath) || !existsSync(legacyDbPath) ? backendDbPath : legacyDbPath);

  if (driver === "postgres") {
    if (!databaseUrl) {
      throw new Error("STORAGE_DRIVER=postgres requires DATABASE_URL.");
    }

    return {
      driver,
      store: new PostgresGameStore(databaseUrl, {
        adminIds: getAdminIds(),
        cacheFilePath: resolve(process.cwd(), "backend", "data", "postgres-runtime-cache.sqlite")
      })
    };
  }

  if (driver !== "sqlite") {
    throw new Error(`Unsupported STORAGE_DRIVER "${driver}". Supported drivers: sqlite, postgres.`);
  }

  if (databaseUrl) {
    if (!databaseUrl.toLowerCase().startsWith("file:")) {
      throw new Error(`DATABASE_URL "${databaseUrl}" looks like PostgreSQL. Set STORAGE_DRIVER=postgres or leave STORAGE_DRIVER empty to auto-detect.`);
    }

    filePath = fileURLToPath(databaseUrl);
  }

  return {
    driver,
    store: new SQLiteGameStore(filePath, {
      adminIds: getAdminIds()
    })
  };
}
