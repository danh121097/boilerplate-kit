import {
  closeServer,
  listenOnLoopback,
  portOf,
  TEST_HOST,
} from "@/__tests__/helpers/loopback-server";
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

describe("loopback test server", () => {
  it("is already listening on 127.0.0.1 and supertest reuses it instead of binding again", async () => {
    const app = express();
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });
    const server = await listenOnLoopback(app);
    try {
      expect(server.address()).toMatchObject({ address: TEST_HOST });
      const port = portOf(server);

      const res = await request(server).get("/");
      expect(res.status).toBe(200);
      // No per-request rebind: the same server still holds the same port.
      expect(portOf(server)).toBe(port);
      expect(res.request.url).toContain(`${TEST_HOST}:${port}`);
    } finally {
      await closeServer(server);
    }
  });
});
