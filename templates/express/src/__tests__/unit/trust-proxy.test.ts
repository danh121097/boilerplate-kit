import { parseTrustProxy } from "@/config/trust-proxy";
import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

describe("parseTrustProxy", () => {
  it("returns undefined when unset or blank (trust nothing)", () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy("  ")).toBeUndefined();
  });

  it("parses booleans and hop counts", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("accepts a comma-separated list of IPs, subnets and named ranges", () => {
    expect(parseTrustProxy("10.0.0.0/8, 127.0.0.1,::1,fc00::/7")).toBe(
      "10.0.0.0/8,127.0.0.1,::1,fc00::/7",
    );
    expect(parseTrustProxy("loopback")).toBe("loopback");
  });

  it.each(["yes", "10.0.0.0/33", "1.2.3.4/8/9", "1.2.3.4,nope", "fc00::/129"])(
    "rejects %s",
    (raw) => {
      expect(() => parseTrustProxy(raw)).toThrow(/Invalid TRUST_PROXY/);
    },
  );
});

describe("app trust proxy wiring", () => {
  // Re-importing the app re-registers Mongoose models, so clear them between imports.
  const freshApp = async () => {
    mongoose.deleteModel(/.*/);
    vi.resetModules();
    return (await import("@/app")).default;
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    mongoose.deleteModel(/.*/);
    vi.resetModules();
  });

  it("does not trust proxies by default", async () => {
    const app = await freshApp();
    expect(app.get("trust proxy")).toBe(false);
  });

  it("applies TRUST_PROXY to the Express app", async () => {
    vi.stubEnv("TRUST_PROXY", "2");
    const app = await freshApp();
    expect(app.get("trust proxy")).toBe(2);
  });
});
