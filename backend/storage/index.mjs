import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SQLiteGameStore } from "./sqliteGameStore.mjs";

function getAdminIds() {
  return String(process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createGameStateStore() {
  const driver = (process.env.STORAGE_DRIVER || "sqlite").toLowerCase();

  if (driver !== "sqlite") {
    throw new Error(`Unsupported STORAGE_DRIVER "${driver}". This build expects the SQLite game store.`);
  }

  const backendDbPath = resolve(process.cwd(), "backend", "data", "dino.sqlite");
  const legacyDbPath = resolve(process.cwd(), "server", "data", "dino.sqlite");
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  let filePath = process.env.GAME_DB_FILE || (existsSync(backendDbPath) || !existsSync(legacyDbPath) ? backendDbPath : legacyDbPath);

  if (databaseUrl) {
    if (!databaseUrl.toLowerCase().startsWith("file:")) {
      throw new Error(`Unsupported DATABASE_URL "${databaseUrl}". The current server runtime supports SQLite file URLs, e.g. file:/var/data/dino.sqlite`);
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
