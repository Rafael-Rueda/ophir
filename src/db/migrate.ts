import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closePool, getPool } from "./client.js";
import { logger } from "../observability/logger.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Applies pending SQL migrations in lexical order. Each migration runs inside a
 * transaction and is recorded in `schema_migrations` so it runs at most once.
 */
export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
    if (existing.rows.length > 0) {
      skipped.push(file);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
      logger.info({ migration: file }, "Applied migration");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error({ err: error, migration: file }, "Migration failed");
      throw error;
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}

// Run directly via `npm run db:migrate`.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runMigrations()
    .then((result) => {
      logger.info(result, "Migrations complete");
    })
    .catch((error) => {
      logger.error({ err: error }, "Migration run failed");
      process.exitCode = 1;
    })
    .finally(() => {
      void closePool();
    });
}
