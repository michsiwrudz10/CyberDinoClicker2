import { createPostgresPool } from "./lib/postgres.mjs";

const pool = createPostgresPool();

try {
  const result = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      version() AS server_version
  `);

  const row = result.rows[0] || {};
  console.log(`Connected to PostgreSQL database: ${row.database_name}`);
  console.log(`Database user: ${row.database_user}`);
  console.log(String(row.server_version || "").split("\n")[0]);
} finally {
  await pool.end();
}
