import { parseTrustProxy } from "@/config/trust-proxy";
import mongoose from "mongoose";

describe("parseTrustProxy", () => {
  it("returns undefined when unset or blank (trust nothing)", () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy("  ")).toBeUndefined();
  });

  it("parses booleans", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("accepts a comma-separated list of IPs, subnets and named ranges", () => {
    expect(parseTrustProxy("10.0.0.0/8, 127.0.0.1,::1,fc00::/7")).toEqual([
      "10.0.0.0/8",
      "127.0.0.1",
      "::1",
      "fc00::/7",
    ]);
    expect(parseTrustProxy("loopback")).toEqual(["loopback"]);
  });

  // Hop counts ("2") are rejected on purpose: Fastify 5 would let a direct client spoof them.
  it.each(["yes", "2", "10.0.0.0/33", "1.2.3.4/8/9", "1.2.3.4,nope", "fc00::/129"])(
    "rejects %s",
    (raw) => {
      expect(() => parseTrustProxy(raw)).toThrow(/Invalid TRUST_PROXY/);
    },
  );
});

describe("app trust proxy wiring", () => {
  /** Client IP the app reports for a request from 127.0.0.1 carrying `x-forwarded-for`. */
  async function reportedIp(trustProxy?: string): Promise<string> {
    // Re-importing the app re-registers Mongoose models, so clear them first.
    mongoose.deleteModel(/.*/);
    vi.resetModules();
    if (trustProxy !== undefined) vi.stubEnv("TRUST_PROXY", trustProxy);
    const { buildApp } = await import("@/app");
    const app = buildApp({ sockets: false });
    app.get("/ip", async (request) => request.ip);
    const res = await app.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    await app.close();
    return res.body;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    mongoose.deleteModel(/.*/);
    vi.resetModules();
  });

  it("does not trust proxies by default", async () => {
    expect(await reportedIp()).toBe("127.0.0.1");
  });

  it("applies TRUST_PROXY to the Fastify app", async () => {
    expect(await reportedIp("loopback")).toBe("203.0.113.9");
  });
});
