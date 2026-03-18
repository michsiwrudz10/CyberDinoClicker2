import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function createEmptyDatabase() {
  return {
    version: 1,
    players: {}
  };
}

export class JsonGameStateStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    this.writeChain = Promise.resolve();
  }

  async readDatabase() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return createEmptyDatabase();
      }

      throw error;
    }
  }

  async writeDatabase(database) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(database, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }

  async get(profileId) {
    const database = await this.readDatabase();
    return database.players?.[profileId] ?? null;
  }

  async save(profileId, state) {
    this.writeChain = this.writeChain.catch(() => {}).then(async () => {
      const database = await this.readDatabase();
      const existing = database.players?.[profileId];
      const now = new Date().toISOString();

      const record = {
        profileId,
        state,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };

      database.version = 1;
      database.players = database.players || {};
      database.players[profileId] = record;
      await this.writeDatabase(database);
      return record;
    });

    return this.writeChain;
  }
}
