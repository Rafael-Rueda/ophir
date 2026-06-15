/**
 * Creates a local admin user.
 *
 * Usage:
 *   npm run admin:create -- <email> <password> [displayName]
 * or set BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_NAME.
 *
 * Runs pending migrations first so the schema exists.
 */
import { getEnv } from "../src/config/env.js";
import { createAdmin } from "../src/auth/admin-auth.service.js";
import { runMigrations } from "../src/db/migrate.js";
import { closePool } from "../src/db/client.js";
import { logger } from "../src/observability/logger.js";

async function main(): Promise<void> {
  const env = getEnv();
  const email = process.argv[2] ?? env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.argv[3] ?? env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName = process.argv[4] ?? env.BOOTSTRAP_ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    logger.error(
      "Provide email and password as arguments or via BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD",
    );
    process.exitCode = 1;
    return;
  }

  if (password.length < 12) {
    logger.error("Admin password must be at least 12 characters long");
    process.exitCode = 1;
    return;
  }

  await runMigrations();
  const admin = await createAdmin({ email, displayName, password });
  logger.info({ id: admin.id, email: admin.email }, "Admin user created");
}

main()
  .catch((error) => {
    logger.error({ err: error }, "Failed to create admin user");
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
