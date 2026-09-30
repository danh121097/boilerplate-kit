import { AppException } from "@/common/exceptions/app.exception";
import { AppConfigService } from "@/config/app-config.service";
import type { Request } from "express";

/** Read-only methods exempt from the check; every other method must pass it. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
 * Origin/CSRF check: when enableCsrf is on, every non-safe request must come from an
 * allow-listed origin (Origin header, else Referer). Throws 403 otherwise.
 */
export function assertAllowedOrigin(
  req: Request,
  config: Pick<AppConfigService, "enableCsrf" | "corsOrigins">,
): void {
  if (!config.enableCsrf) return;
  if (SAFE_METHODS.has(req.method)) return;

  const origin = resolveOrigin(req);
  if (!origin || !config.corsOrigins.includes(origin)) {
    throw new AppException({
      message: "CSRF: request origin is not allowed!",
      statusCode: 403,
      errorType: "AUTHORIZATION_ERROR",
    });
  }
}
