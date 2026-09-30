/**
 * parseDurationSeconds: the single parser behind cookie maxAge, DB expiry and JWT expiry.
 */
import { describe, expect, it } from "vitest";

import { parseDurationSeconds } from "@/common/utils/duration.util";

describe("parseDurationSeconds", () => {
  it.each([
    ["30s", 30],
    ["15m", 900],
    ["2h", 7200],
    ["7d", 604800],
    [" 15m ", 900],
  ])("parses %j to %i seconds", (raw, seconds) => {
    expect(parseDurationSeconds(raw)).toBe(seconds);
  });

  it.each(["", "900", "15", "0s", "-5m", "1.5h", "5w", "m15"])("rejects %j", (raw) => {
    expect(() => parseDurationSeconds(raw, "JWT_ACCESS_EXPIRY")).toThrow(/JWT_ACCESS_EXPIRY/);
  });
});
