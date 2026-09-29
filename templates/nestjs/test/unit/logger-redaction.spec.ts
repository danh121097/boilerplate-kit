import { serializeMeta } from "@/common/logger/app-logger.service";
import { describe, expect, it } from "vitest";

describe("serializeMeta redaction", () => {
  it.each(["password", "accessToken", "cookie", "mongoUrl", "redisUrl", "SENTRY_DSN"])(
    "redacts %s",
    (key) => {
      expect(serializeMeta({ [key]: "secret-value" })[key]).toBe("[REDACTED]");
    },
  );

  it("keeps ordinary keys", () => {
    expect(serializeMeta({ userId: "1", urlPath: "/x" })).toEqual({ userId: "1", urlPath: "/x" });
  });
});
