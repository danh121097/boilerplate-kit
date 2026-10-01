/**
 * HttpExceptionFilter — only Nest's own router 404 (`Cannot <METHOD> <url>`) is
 * rewritten to "Resource not found!"; a NotFoundException a handler throws keeps
 * its message.
 */
import { describe, expect, it, vi } from "vitest";

import { HttpExceptionFilter } from "@/common/filters/http-exception.filter";
import { AppLogger } from "@/common/logger/app-logger.service";
import { ArgumentsHost, NotFoundException } from "@nestjs/common";

function run(exception: unknown): Record<string, unknown> {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const req = { method: "GET", url: "/nope", originalUrl: "/nope" };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  const logger = { error: vi.fn(), warn: vi.fn() } as unknown as AppLogger;
  new HttpExceptionFilter(logger).catch(exception, host);
  return res.json.mock.calls[0][0];
}

describe("HttpExceptionFilter — router 404", () => {
  it("rewrites the router's Cannot GET message", () => {
    const body = run(new NotFoundException("Cannot GET /nope"));
    expect(body).toMatchObject({ errorType: "NOT_FOUND", message: "Resource not found!" });
  });

  it.each(["Widget not found", "Cannot GET /other", "Cannot POST /nope"])(
    "keeps a handler-thrown message: %s",
    (message) => {
      expect(run(new NotFoundException(message))).toMatchObject({
        errorType: "NOT_FOUND",
        message,
      });
    },
  );
});
