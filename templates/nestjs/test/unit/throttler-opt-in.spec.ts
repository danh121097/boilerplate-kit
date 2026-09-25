/**
 * skipUnlessOptedIn reads the metadata key @Throttle() writes (mirrored as a
 * string because @nestjs/throttler does not export it). If an upgrade renames
 * that key, opted-in routes would silently be skipped — this spec fails first.
 */
import { describe, expect, it } from "vitest";

import { skipUnlessOptedIn } from "@/common/throttler/throttler.module";
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
