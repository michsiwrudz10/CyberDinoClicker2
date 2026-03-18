import { createPostgresPool, readPostgresSchemaSql, seedAdminUsers, seedShopProducts } from "./lib/postgres.mjs";

const pool = createPostgresPool();

try {
  const schemaSql = await readPostgresSchemaSql();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await seedShopProducts(client);
    await seedAdminUsers(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log("PostgreSQL schema is ready.");
} finally {
  await pool.end();
}
