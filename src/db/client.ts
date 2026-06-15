import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getEnv } from "../config/env.js";
import { logger } from "../observability/logger.js";

let pool: Pool | undefined;

/** Lazily creates and returns the shared PostgreSQL connection pool. */
export function getPool(): Pool {
  if (!pool) {
    const env = getEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      application_name: env.OTEL_SERVICE_NAME,
    });
    pool.on("error", (error) => {
      logger.error({ err: error }, "Unexpected error on idle PostgreSQL client");
    });
  }
  return pool;
}

/** Runs a parameterized query against the pool. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Runs `fn` inside a transaction, committing on success and rolling back on error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Performs a lightweight `SELECT 1` to verify database connectivity. */
export async function pingDatabase(timeoutMs = 2000): Promise<boolean> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("database ping timed out")), timeoutMs),
  );
  try {
    await Promise.race([getPool().query("SELECT 1"), timeout]);
    return true;
  } catch (error) {
    logger.warn({ err: error }, "Database ping failed");
    return false;
  }
}

/** Closes the pool. Intended for graceful shutdown and tests. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
