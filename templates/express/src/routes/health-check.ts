import { getRedis } from "@/config/redis";
import { isRedisReady } from "@/utils/redis-ready";
import { Request, Response } from "express";
import { z } from "zod";
import type { RouteGroup } from "@/types/routing";
import mongoose from "mongoose";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
  uptime: z.number(),
  database: z.string(),
  redis: z.string(),
});

/** Report Redis liveness: 'disabled' when off, else 'up'/'down' by PING. */
async function getRedisStatus(): Promise<string> {
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

/** GET /health — server, database and Redis status */
async function healthCheck(_req: Request, res: Response): Promise<void> {
  const dbStateMap = new Map<number, string>([
    [0, "disconnected"],
    [1, "connected"],
    [2, "connecting"],
    [3, "disconnecting"],
  ]);

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStateMap.get(mongoose.connection.readyState) ?? "unknown",
    redis: await getRedisStatus(),
  });
}

const healthGroup: RouteGroup = {
  prefix: "",
  routes: [
    {
      method: "get",
      path: "/health",
      documentation: {
        summary: "Check service, MongoDB, and Redis status",
        tags: ["health"],
        responses: {
          "200": "Service health status",
          "401": "Valid HMAC signature headers are required",
          "429": "Too many requests",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "200": healthResponseSchema },
      },
      handler: healthCheck,
    },
  ],
};

export default healthGroup;
