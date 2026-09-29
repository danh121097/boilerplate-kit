import { AppException } from "@/common/exceptions/app.exception";
import { AppConfigService } from "@/config/app-config.service";
import type { Request } from "express";

/** Methods that carry a body and can trigger CSRF. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Resolve Origin header, falling back to the origin part of Referer. */
function resolveOrigin(req: Request): string | undefined {
  const origin = req.headers.origin as string | undefined;
  if (origin) return origin;
  const referer = req.headers.referer as string | undefined;
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Origin/CSRF check: when enableCsrf is on, mutating requests must come from an
 * allow-listed origin (Origin header, else Referer). Throws 403 otherwise.
 */
export function assertAllowedOrigin(
  req: Request,
  config: Pick<AppConfigService, "enableCsrf" | "corsOrigins">,
): void {
  if (!config.enableCsrf) return;
  if (!MUTATING_METHODS.has(req.method)) return;

  const origin = resolveOrigin(req);
  if (!origin || !config.corsOrigins.includes(origin)) {
    throw new AppException({
      message: "CSRF: request origin is not allowed!",
      statusCode: 403,
      errorType: "AUTHORIZATION_ERROR",
    });
  }
}
