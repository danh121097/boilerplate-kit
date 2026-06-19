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
    logger.error("MongoDB connection failed", {
      err: error,
      uri: config.mongodbUri,
    });
    process.exit(1);
  }

  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB error", { err });
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
}

/** Close Socket.IO, MongoDB and Redis connections gracefully */
async function gracefulShutdown(): Promise<void> {
  await closeSocket();
  await mongoose.connection.close();
  logger.info("MongoDB connection closed (app shutdown)");
  await disconnectRedis();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
