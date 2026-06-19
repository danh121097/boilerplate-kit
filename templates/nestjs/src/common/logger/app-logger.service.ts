import { Injectable, LoggerService } from "@nestjs/common";

/**
 * Injectable structured logger — ported from express utils/logger.ts.
 *
 * Levels: debug < info < warn < error, filtered by LOG_LEVEL env var.
 * Default threshold: debug in dev/test, info in prod (matches express behavior).
 * Silent when NODE_ENV=test (keeps test output clean).
 * Dev: colored single-line to TTY. Prod: one-line JSON per record.
 * Sensitive keys in meta are redacted (password/token/secret/cookie/authorization/credential).
 * warn + error → stderr; debug + info → stdout.
 *
 * Reads NODE_ENV/LOG_LEVEL directly from process.env — no AppConfigService dependency
 * to avoid a circular dep (AppConfigService → keys.ts → logger → AppConfigService).
 * Implements NestJS LoggerService so it can be passed to NestFactory.create().
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMeta = Record<string, unknown>;

const WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PRODUCTION = NODE_ENV === "production";
const IS_TEST = NODE_ENV === "test";

function threshold(): number {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in WEIGHT) return WEIGHT[env];
  return IS_PRODUCTION ? WEIGHT.info : WEIGHT.debug;
}

const SENSITIVE = /pass(word)?|token|secret|cookie|authorization|credential/i;

/** Redact sensitive keys and serialize Error values. */
export function serializeMeta(meta: LogMeta): LogMeta {
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE.test(key)) {
      out[key] = "[REDACTED]";
    } else if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message, stack: value.stack };
    } else {
      out[key] = value;
    }
  }
  return out;
}

const COLOR: Record<LogLevel, string> = {
  debug: "\x1b[90m", // grey
  info: "\x1b[36m",  // cyan
  warn: "\x1b[33m",  // yellow
  error: "\x1b[31m", // red
};
const TIME_COLOR = "\x1b[32m"; // green
const RESET = "\x1b[0m";

function emit(level: LogLevel, msg: string, meta?: LogMeta): void {
  if (IS_TEST || WEIGHT[level] < threshold()) return;

  const time = new Date().toISOString();
  const safe = meta ? serializeMeta(meta) : undefined;
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;

  if (IS_PRODUCTION) {
    stream.write(JSON.stringify({ time, level, msg, ...(safe && { meta: safe }) }) + "\n");
    return;
  }

  const tag = level.toUpperCase().padEnd(5);
  const isTty = (stream as NodeJS.WriteStream & { isTTY?: boolean }).isTTY ?? false;
  const stamp = isTty ? `${TIME_COLOR}${time}${RESET}` : time;
  const colored = isTty ? `${COLOR[level]}${tag}${RESET}` : tag;
  const tail = safe ? ` ${JSON.stringify(safe)}` : "";
  stream.write(`${stamp} ${colored} ${msg}${tail}\n`);
}

/**
 * Injectable AppLogger implementing NestJS LoggerService.
 * The optional `context` param (provided by Nest internals) is appended to messages.
 */
@Injectable()
export class AppLogger implements LoggerService {
  debug(message: string, context?: string): void {
    emit("debug", context ? `[${context}] ${message}` : message);
  }

  log(message: string, context?: string): void {
    emit("info", context ? `[${context}] ${message}` : message);
  }

  warn(message: string, context?: string): void {
    emit("warn", context ? `[${context}] ${message}` : message);
  }

  error(message: string, trace?: string, context?: string): void {
    const meta: LogMeta | undefined = trace ? { stack: trace } : undefined;
    emit("error", context ? `[${context}] ${message}` : message, meta);
  }

  verbose(message: string, context?: string): void {
    emit("debug", context ? `[${context}] ${message}` : message);
  }
}
