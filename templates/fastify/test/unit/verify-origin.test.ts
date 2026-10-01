import { config } from "@/config/environment";
import { installErrorHandlers } from "@/plugins/error-handlers";
import { installSecurityHooks } from "@/plugins/security";
import Fastify from "fastify";

const ALLOWED = "http://localhost:5173";

/** Send one request through the real CSRF hook (route lives outside the HMAC-guarded API prefix). */
async function send(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", headers = {}) {
  const app = Fastify();
  installErrorHandlers(app);
  installSecurityHooks(app);
  app.all("/csrf", async () => ({ ok: true }));
  const res = await app.inject({ method, url: "/csrf", headers });
  await app.close();
  return res;
}

describe("CSRF origin allow-list", () => {
  const original = config.enableCsrf;
  afterEach(() => {
    config.enableCsrf = original;
  });

  it("allow-list contains the origin these tests rely on", () => {
    expect(config.corsOrigins).toContain(ALLOWED);
  });

  it("passes through when CSRF is disabled", async () => {
    config.enableCsrf = false;
    expect((await send("POST", { origin: "https://evil.com" })).statusCode).toBe(200);
  });

  describe("when enabled", () => {
    beforeEach(() => {
      config.enableCsrf = true;
    });

    it("lets safe methods through without an Origin", async () => {
      expect((await send("GET")).statusCode).toBe(200);
    });

    it("allows a mutating request from an allow-listed Origin", async () => {
      expect((await send("POST", { origin: ALLOWED })).statusCode).toBe(200);
    });

    it("rejects a mutating request from a foreign Origin with the 403 envelope", async () => {
      const res = await send("PATCH", { origin: "https://evil.com" });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ errorType: "AUTHORIZATION_ERROR" });
      expect(res.json().message).toMatch(/CSRF/);
    });

    it("allows a mutating request with no Cookie, Origin or Referer (native client)", async () => {
      expect((await send("DELETE")).statusCode).toBe(200);
    });

    it("rejects a mutating request with a Cookie but no Origin and no Referer", async () => {
      const res = await send("DELETE", { cookie: "refreshToken=abc" });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ errorType: "AUTHORIZATION_ERROR" });
    });

    it("rejects a cookie-less request whose Origin is not allow-listed", async () => {
      expect((await send("POST", { origin: "https://evil.com" })).statusCode).toBe(403);
    });

    it("falls back to the Referer origin when Origin is absent", async () => {
      expect((await send("PUT", { referer: `${ALLOWED}/some/page` })).statusCode).toBe(200);
    });

    it("rejects a Referer from a foreign origin", async () => {
      expect((await send("PUT", { referer: "https://evil.com/page" })).statusCode).toBe(403);
    });

    it("rejects an unparseable Referer", async () => {
      expect((await send("POST", { referer: "not a url" })).statusCode).toBe(403);
    });
  });
});
