/**
 * Per-message log throttle. A dead dependency makes its client emit the same error on
 * every reconnect attempt; `shouldLog(message)` is true at most once per interval for
 * each distinct message, so a distinct failure still surfaces immediately. At most
 * `MAX_THROTTLE_KEYS` messages are remembered; the least recently logged is evicted.
 */
const MAX_THROTTLE_KEYS = 100;

export function createLogThrottle(intervalMs: number): (message: string) => boolean {
  const lastLoggedAt = new Map<string, number>();
  return (message) => {
    const now = Date.now();
    const last = lastLoggedAt.get(message);
    if (last !== undefined && now - last < intervalMs) return false;
    lastLoggedAt.delete(message);
    lastLoggedAt.set(message, now);
    if (lastLoggedAt.size > MAX_THROTTLE_KEYS) {
      lastLoggedAt.delete(lastLoggedAt.keys().next().value as string);
    }
    return true;
  };
}
