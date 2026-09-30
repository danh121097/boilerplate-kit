import { buildApp } from "@/app";
import { connectDatabase, disconnectDatabase } from "@/config/database";
import { connectRedis, disconnectRedis } from "@/config/redis";
import { logger } from "@/utils/logger";

async function startServer(): Promise<void> {
  await connectDatabase();
  connectRedis();
  const app = buildApp();

  try {
    await app.listen({ host: "0.0.0.0", port: config.port });
  } catch (error) {
    await app.close().catch(() => undefined);
    await disconnectDatabase().catch(() => undefined);
    await disconnectRedis().catch(() => undefined);
    throw error;
  }

  logger.info("Server running", { port: config.port, env: config.nodeEnv });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Graceful shutdown started", { signal });
    const timer = setTimeout(() => {
      logger.error("Graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    timer.unref();

    try {
      await app.close();
      await disconnectDatabase();
      await disconnectRedis();
      clearTimeout(timer);
      process.exitCode = 0;
    } catch {
      clearTimeout(timer);
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

import { config } from "@/config/environment";

startServer().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  logger.error("Failed to start server", { name });
  process.exitCode = 1;
});
