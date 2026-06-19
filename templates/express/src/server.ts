import { connectDatabase } from "@/config/database";
import { config } from "@/config/environment";
import { connectRedis } from "@/config/redis";
import { logger } from "@/utils/logger";
import { createServer } from "http";

/** Bootstrap server: connect DB and Redis, attach Socket.IO, then listen */
const startServer = async (): Promise<void> => {
  await connectDatabase();
  connectRedis();
  // Import app + socket AFTER Redis connects so the rate-limit store and the
  // Socket.IO Redis adapter see the live client (modules read it at import time).
  const { default: app } = await import("@/app");
  const { initSocket } = await import("@/socket");

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    logger.info("Server running", { port: config.port, env: config.nodeEnv });
  });
};

startServer().catch((err) => {
  logger.error("Failed to start server", { err });
  process.exit(1);
});
