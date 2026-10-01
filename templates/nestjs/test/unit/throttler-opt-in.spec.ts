/**
 * skipUnlessOptedIn reads the metadata key @Throttle() writes (mirrored as a
 * string because @nestjs/throttler does not export it). If an upgrade renames
 * that key, opted-in routes would silently be skipped — this spec fails first.
 */
import { describe, expect, it } from "vitest";

import { AppThrottlerGuard, skipUnlessOptedIn } from "@/common/throttler/throttler.module";
import { ExecutionContext } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

class FixtureController {
  @Throttle({ auth: { limit: 1, ttl: 1 } })
  optedIn(): void {}

  plain(): void {}
}

function contextFor(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => FixtureController,
  } as unknown as ExecutionContext;
}

describe("skipUnlessOptedIn", () => {
  const skipAuth = skipUnlessOptedIn("auth");

  it("does not skip a handler that opts in via @Throttle", () => {
    expect(skipAuth(contextFor(FixtureController.prototype.optedIn))).toBe(false);
  });

  it("skips an undecorated handler", () => {
    expect(skipAuth(contextFor(FixtureController.prototype.plain))).toBe(true);
  });

  it("skips a handler opted in to a different throttler", () => {
    expect(skipUnlessOptedIn("login")(contextFor(FixtureController.prototype.optedIn))).toBe(true);
  });
});

describe("AppThrottlerGuard.generateKey", () => {
  const guard = Object.create(AppThrottlerGuard.prototype) as {
    generateKey: (context: ExecutionContext, tracker: string, name: string) => string;
  };

  it("keys by throttler name and client only, so counters are shared across routes", () => {
    const key = (handler: () => void, name: string) =>
      guard.generateKey(contextFor(handler), "10.0.0.1", name);

    expect(key(FixtureController.prototype.optedIn, "auth")).toBe("auth:10.0.0.1");
    expect(key(FixtureController.prototype.plain, "auth")).toBe(
      key(FixtureController.prototype.optedIn, "auth"),
    );
  });

  it("keeps throttler names and clients apart", () => {
    const ctx = contextFor(FixtureController.prototype.plain);
    expect(guard.generateKey(ctx, "10.0.0.1", "auth")).not.toBe(
      guard.generateKey(ctx, "10.0.0.1", "login"),
    );
    expect(guard.generateKey(ctx, "10.0.0.1", "auth")).not.toBe(
      guard.generateKey(ctx, "10.0.0.2", "auth"),
    );
  });
});
