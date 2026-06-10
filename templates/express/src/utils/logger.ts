/**
 * Tiny dependency-free structured logger.
 *
 * - Levels: debug < info < warn < error, filtered by `LOG_LEVEL`
 *   (default: debug in dev, info in prod).
 * - Dev: human-readable, colored lines on a TTY. Prod: one-line JSON per record
 *   (ready for Datadog/Loki/CloudWatch ingestion).
 * - Secrets in the metadata object are redacted, and Error values are serialized
 *   (message + stack) — `JSON.stringify(new Error())` would otherwise drop them.
 * - Silent during tests so the suite output stays clean.
 *
 * Usage: `logger.info('Server started', { port })` / `logger.error('DB failed', { err })`.
 *
 * Reads NODE_ENV directly (not the `config` module) so this low-level logger has
 * no dependency on config — config imports keys.ts which logs, which would cycle.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMeta = Record<string, unknown>;

const WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";
const IS_TEST = NODE_ENV === "test";

const threshold = (): number => {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in WEIGHT) return WEIGHT[env];
  return IS_PRODUCTION ? WEIGHT.info : WEIGHT.debug;
};

const SENSITIVE = /pass(word)?|token|secret|cookie|authorization|credential/i;

/** Redact sensitive keys and serialize Error values. Exported for tests. */
export function serializeMeta(meta: LogMeta): LogMeta {
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE.test(key)) out[key] = "[REDACTED]";
    else if (value instanceof Error)
      out[key] = { name: value.name, message: value.message, stack: value.stack };
    else out[key] = value;
  }
  return out;
}

const COLOR: Record<LogLevel, string> = {
  debug: "\x1b[90m", // grey
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const TIME_COLOR = "\x1b[32m"; // green — timestamp (distinct from the level colors above)
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
  const isTty = stream.isTTY;
  const stamp = isTty ? `${TIME_COLOR}${time}${RESET}` : time;
  const colored = isTty ? `${COLOR[level]}${tag}${RESET}` : tag;
  const tail = safe ? ` ${JSON.stringify(safe)}` : "";
  stream.write(`${stamp} ${colored} ${msg}${tail}\n`);
}

export const logger = {
  debug: (msg: string, meta?: LogMeta): void => emit("debug", msg, meta),
  info: (msg: string, meta?: LogMeta): void => emit("info", msg, meta),
  warn: (msg: string, meta?: LogMeta): void => emit("warn", msg, meta),
  error: (msg: string, meta?: LogMeta): void => emit("error", msg, meta),
};
