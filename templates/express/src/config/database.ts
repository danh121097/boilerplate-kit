import { config } from "@/config/environment";
import { disconnectRedis } from "@/config/redis";
import { closeSocket } from "@/socket";
import { logger } from "@/utils/logger";
import mongoose from "mongoose";

/** Connect to MongoDB with event logging and graceful shutdown */
export async function connectDatabase(): Promise<void> {
  try {
    if (!config.isProduction) mongoose.set("debug", true);
    await mongoose.connect(config.mongodbUri);
    logger.info("MongoDB connected successfully");
  } catch (error) {
    // Never log the connection string: it carries credentials.
    logger.error("MongoDB connection failed", { err: error });
    process.exit(1);
  }

  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB error", { err });
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
}

/** Longest a shutdown may take before the process exits anyway (under a typical 30s SIGKILL grace). */
const SHUTDOWN_TIMEOUT_MS = 10_000;

let shuttingDown = false;

/** Run one shutdown step; a failure is logged so it cannot skip the remaining steps. Returns false on failure. */
async function closeStep(name: string, step: () => Promise<unknown>): Promise<boolean> {
  try {
    await step();
    return true;
  } catch (err) {
    logger.warn(`Shutdown step failed: ${name}`, { err });
    return false;
  }
}

/**
 * Close Socket.IO, MongoDB and Redis connections (best effort), then exit: 0 when every
 * step closed cleanly, 1 when one failed or the whole shutdown exceeded SHUTDOWN_TIMEOUT_MS.
 * A second signal while shutting down is ignored.
 */
async function gracefulShutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  // Kept referenced so a step hanging on a handle-less promise still ends in exit 1.
  const deadline = setTimeout(() => {
    logger.error(`Shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms, exiting`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  const results = [
    await closeStep("socket", closeSocket),
    await closeStep("mongodb", async () => {
      await mongoose.connection.close();
      logger.info("MongoDB connection closed (app shutdown)");
    }),
    await closeStep("redis", disconnectRedis),
  ];
  clearTimeout(deadline);
  process.exit(results.every(Boolean) ? 0 : 1);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
