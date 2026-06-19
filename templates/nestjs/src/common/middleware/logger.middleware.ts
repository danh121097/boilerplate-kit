import { AppLogger } from "@/common/logger/app-logger.service";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * HTTP access-log middleware — morgan parity without adding the morgan dep.
 *
 * - Prod: "combined" style  →  :remote-addr - :method :url HTTP/:version :status :res[content-length] ":referrer" ":user-agent"
 * - Dev:  "dev" style       →  :method :url :status :response-time ms - :res[content-length]
 * - Skipped entirely when NODE_ENV=test (AppLogger is already silent in test, but
 *   we skip at the middleware level too so no "finish" listener is attached).
 *
 * Piped through AppLogger.log so the output shares the same structured stream.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly isTest = process.env.NODE_ENV === "test";
  private readonly isProd = process.env.NODE_ENV === "production";

  constructor(private readonly logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (this.isTest) {
      next();
      return;
    }

    const startAt = process.hrtime();

    res.on("finish", () => {
      const diff = process.hrtime(startAt);
      const responseTimeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(3);
      const contentLength = res.getHeader("content-length") ?? "-";
      const status = res.statusCode;
      const method = req.method;
      const url = req.originalUrl ?? req.url;
      const httpVersion = `${req.httpVersionMajor}.${req.httpVersionMinor}`;

      let line: string;
      if (this.isProd) {
        const remoteAddr = req.ip ?? req.socket.remoteAddress ?? "-";
        const referrer = req.headers.referer ?? req.headers.referrer ?? "-";
        const userAgent = req.headers["user-agent"] ?? "-";
        line = `${remoteAddr} - ${method} ${url} HTTP/${httpVersion} ${status} ${contentLength} "${referrer}" "${userAgent}"`;
      } else {
        line = `${method} ${url} ${status} ${responseTimeMs} ms - ${contentLength}`;
      }

      this.logger.log(line, "HTTP");
    });

    next();
  }
}
