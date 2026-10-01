import { AppError } from "@/types";
import { verifyHmac } from "@/utils/hmac";
import { NextFunction, Request, Response } from "express";

/**
 * Verify the HMAC signature on the `sig` + `ctime` headers. The signed string is
 *   [method, contentType, ctime, path, ""].join("\n")
 * and the signature is Base64 — both must match the client exactly. Rejections use
 * `HMAC_ERROR` (still 401) so clients can tell a bad signature or clock skew from a
 * bad session and do not discard a valid session.
 */
export function verifyHmacRequest(req: Request, _res: Response, next: NextFunction): void {
  const sig = req.headers["sig"] as string | undefined;
  const ctime = req.headers["ctime"] as string | undefined;

  if (!sig || !ctime) {
    throw new AppError({
      message: "HMAC signature and timestamp headers are required!",
      statusCode: 401,
      errorType: "HMAC_ERROR",
    });
  }

  const reason = verifyHmac({
    method: req.method,
    // Client signs the raw Content-Type it sends (empty when none is set) — do
    // NOT default or strip, or the signatures won't match.
    contentType: (req.headers["content-type"] as string) || "",
    // Client signs config.url (path after baseURL: no /api/v1 prefix, no query).
    // req.url here is already prefix-stripped by the app.use(apiPrefix, ...) mount.
    path: req.url.split("?")[0],
    ctime,
    sig,
  });

  if (reason) {
    throw new AppError({
      message: `HMAC verification failed: ${reason}!`,
      statusCode: 401,
      errorType: "HMAC_ERROR",
    });
  }

  next();
}
