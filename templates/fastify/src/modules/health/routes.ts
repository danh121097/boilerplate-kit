import { getRedis } from "@/config/redis";
import { isRedisReady } from "@/utils/redis-ready";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import mongoose from "mongoose";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
  uptime: z.number(),
  database: z.string(),
  redis: z.string(),
});

async function redisStatus(): Promise<string> {
  const client = getRedis();
  if (!client) return "disabled";
  if (!isRedisReady(client)) return "down";
  try {
    await client.ping();
    return "up";
  } catch {
    return "down";
  }
}

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Check service, MongoDB, and Redis status",
        response: { 200: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const dbState = new Map<number, string>([
        [0, "disconnected"],
        [1, "connected"],
        [2, "connecting"],
        [3, "disconnecting"],
      ]);
      return reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbState.get(mongoose.connection.readyState) ?? "unknown",
        redis: await redisStatus(),
      });
    },
  );
};

export default healthRoutes;
