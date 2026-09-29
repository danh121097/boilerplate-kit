const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/**
 * Parse a duration like `15m`, `30s`, `2h`, `7d` to seconds. Only `<positive int><s|m|h|d>`
 * is accepted: bare numbers (jsonwebtoken reads them as milliseconds), other units, zero and
 * negatives all throw, so cookie lifetimes and token expiries can never disagree.
 */
export function parseDurationSeconds(raw: string, name = "duration"): number {
  const match = /^(\d+)([smhd])$/.exec(raw.trim());
  const seconds = match
    ? parseInt(match[1], 10) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS]
    : 0;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      `Invalid ${name} "${raw}": use a positive number followed by s, m, h or d (e.g. 15m, 7d)`,
    );
  }
  return seconds;
}
