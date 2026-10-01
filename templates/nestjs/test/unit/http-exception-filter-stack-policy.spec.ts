/**
 * HttpExceptionFilter — the stack trace reaches the response body only when
 * NODE_ENV is "development" and the status is 5xx (fastify policy).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppException } from "@/common/exceptions/app.exception";
import { HttpExceptionFilter } from "@/common/filters/http-exception.filter";
import { AppLogger } from "@/common/logger/app-logger.service";
import { ArgumentsHost } from "@nestjs/common";

function run(exception: unknown): Record<string, unknown> {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: "GET", url: "/x" }),
    }),
  } as unknown as ArgumentsHost;
  const logger = { error: vi.fn(), warn: vi.fn() } as unknown as AppLogger;
  new HttpExceptionFilter(logger).catch(exception, host);
  return res.json.mock.calls[0][0];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HttpExceptionFilter — stack policy", () => {
  it.each([
    { env: "development", status: 500, hasStack: true },
    { env: "development", status: 400, hasStack: false },
    { env: "test", status: 500, hasStack: false },
    { env: "production", status: 500, hasStack: false },
  ])("NODE_ENV=$env, status $status → stack in body: $hasStack", ({ env, status, hasStack }) => {
    vi.stubEnv("NODE_ENV", env);
    const body = run(new AppException({ message: "boom", statusCode: status }));
    expect("stack" in body).toBe(hasStack);
  });

  it("includes the stack for an unexpected non-HTTP error in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(run(new Error("boom"))).toHaveProperty("stack");
  });
});
