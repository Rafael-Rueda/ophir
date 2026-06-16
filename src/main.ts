import { buildApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { closePool } from "./db/client.js";
import { logger } from "./observability/logger.js";
import { createAdmin } from "./auth/admin-auth.service.js";
import {
  seedDefaultIntegrations,
  startHealthProbeScheduler,
} from "./integrations/integration-health.service.js";

async function main(): Promise<void> {
  const env = getEnv();
  const app = await buildApp();

  // Optionally create the first admin from env (handy for container deploys).
  if (env.BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_ADMIN_PASSWORD) {
    try {
      await createAdmin({
        email: env.BOOTSTRAP_ADMIN_EMAIL,
        password: env.BOOTSTRAP_ADMIN_PASSWORD,
        displayName: env.BOOTSTRAP_ADMIN_NAME ?? "Admin",
      });
      app.log.info({ email: env.BOOTSTRAP_ADMIN_EMAIL }, "Bootstrap admin created");
    } catch {
      app.log.info("Bootstrap admin already exists or was not created");
    }
  }

  // Ensure default integrations exist, then start background health probing.
  try {
    await seedDefaultIntegrations();
    startHealthProbeScheduler();
  } catch (error) {
    app.log.warn({ err: error }, "Integration bootstrap failed; continuing without probes");
  }

  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(`Ophir listening on http://${env.HOST}:${env.PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down Ophir");
    try {
      await app.close();
      await closePool();
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal startup error");
  process.exit(1);
});
