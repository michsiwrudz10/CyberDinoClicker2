import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const nodeBinary = process.execPath;
const serverEntry = resolve(rootDir, "backend", "index.mjs");
const viteEntry = resolve(rootDir, "node_modules", "vite", "bin", "vite.js");
const backendDbPath = resolve(rootDir, "backend", "data", "dino.sqlite");
const legacyDbPath = resolve(rootDir, "server", "data", "dino.sqlite");
const defaultDbPath = existsSync(backendDbPath) || !existsSync(legacyDbPath) ? backendDbPath : legacyDbPath;
const children = [];
let shuttingDown = false;

function spawnProcess(name, args, extraEnv = {}) {
  const child = spawn(nodeBinary, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      API_PORT: process.env.API_PORT || "8787",
      STORAGE_DRIVER: process.env.STORAGE_DRIVER || "sqlite",
      GAME_DB_FILE: process.env.GAME_DB_FILE || defaultDbPath,
      ALLOW_DEV_AUTH: process.env.ALLOW_DEV_AUTH || "1",
      ALLOW_DEV_PAYMENTS: process.env.ALLOW_DEV_PAYMENTS || "1",
      ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS || process.env.VITE_DEV_TELEGRAM_ID || "700000001",
      VITE_DEV_TELEGRAM_ID: process.env.VITE_DEV_TELEGRAM_ID || "700000001",
      VITE_DEV_TELEGRAM_USERNAME: process.env.VITE_DEV_TELEGRAM_USERNAME || "dinomeat_admin",
      VITE_DEV_TELEGRAM_FIRST_NAME: process.env.VITE_DEV_TELEGRAM_FIRST_NAME || "Dino",
      VITE_DEV_TELEGRAM_LAST_NAME: process.env.VITE_DEV_TELEGRAM_LAST_NAME || "Admin",
      ...extraEnv
    },
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`[${name}] exited with ${signal || code || 0}`);
    shutdown(code || 0);
  });

  children.push(child);
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(exitCode), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

spawnProcess("api", [serverEntry]);
spawnProcess("web", [viteEntry]);
