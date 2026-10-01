import { config } from "@/config/environment";
import { afterAll, beforeAll } from "vitest";

/**
 * The limiters skip every request while config.isTest is set. Register this in a
 * suite to run its requests through the real limiters; the flag is restored after.
 * Limiter counters live in module memory for the whole test file, so keep the
 * suite's total request count under the global 100/min cap.
 */
export function enableRateLimits(): void {
  let original: boolean;
  beforeAll(() => {
    original = config.isTest;
    config.isTest = false;
  });
  afterAll(() => {
    config.isTest = original;
  });
}
