import { config } from "@/config/environment";
import { logger } from "@/utils/logger";
import mongoose from "mongoose";

/** Connect to MongoDB without logging connection strings or credentials. */
export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri);
    logger.info("MongoDB connected successfully");
  } catch (error) {
    const details =
      error instanceof Error
        ? { name: error.name, code: "code" in error ? error.code : undefined }
        : {};
    logger.error("MongoDB connection failed", details);
    throw error;
  }

  mongoose.connection.on("error", (error) => {
    logger.error("MongoDB connection error", {
      name: error.name,
      code: "code" in error ? error.code : undefined,
    });
  });
  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
