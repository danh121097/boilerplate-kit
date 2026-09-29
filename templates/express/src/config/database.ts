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

/** Run one shutdown step; a failure is logged so it cannot skip the remaining steps. */
async function closeStep(name: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn(`Shutdown step failed: ${name}`, { err });
  }
}

/** Close Socket.IO, MongoDB and Redis connections gracefully (best effort, then exit) */
async function gracefulShutdown(): Promise<void> {
  await closeStep("socket", closeSocket);
  await closeStep("mongodb", async () => {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed (app shutdown)");
  });
  await closeStep("redis", disconnectRedis);
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
