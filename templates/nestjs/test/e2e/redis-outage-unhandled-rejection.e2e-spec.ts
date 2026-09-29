/**
 * Redis outage must not crash the process. @socket.io/redis-adapter publishes
 * fire-and-forget, so a rejected publish (real ioredis pointed at a dead port, no
 * offline queue) used to surface as an unhandled rejection. This drives the real
 * adapter and real ioredis and listens for unhandledRejection.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SocketIoAdapter } from "@/modules/realtime/socket-io.adapter";
import { INestApplication } from "@nestjs/common";
import IORedis from "ioredis";
import type { Server } from "socket.io";
import { createTestApp } from "../helpers/create-test-app";

let app: INestApplication;
let pub: IORedis;
let adapter: SocketIoAdapter;
let io: Server;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};

beforeAll(async () => {
  process.on("unhandledRejection", onUnhandled);
  app = await createTestApp();
  pub = new IORedis("redis://127.0.0.1:1", {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    commandTimeout: 1000,
    lazyConnect: true,
  });
  pub.on("error", () => undefined);
  await pub.connect().catch(() => undefined);
  adapter = new SocketIoAdapter(app, pub);
  io = adapter.createIOServer(0) as Server;
}, 30_000);

afterAll(async () => {
  process.off("unhandledRejection", onUnhandled);
  await adapter.close(io);
  pub.disconnect();
  await app.close();
});

describe("Redis adapter during an outage", () => {
  it("emit and disconnectSockets through the adapter raise no unhandled rejection", async () => {
    expect(pub.status).not.toBe("ready");
    io.to("user:1").emit("ping");
    io.emit("ping");
    void io.in("user:1").disconnectSockets(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(unhandled).toEqual([]);
  });
});
