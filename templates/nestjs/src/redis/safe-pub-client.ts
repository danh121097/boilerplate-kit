import type { Redis } from "ioredis";

/**
 * Wrap the shared pub client for @socket.io/redis-adapter. The adapter calls
 * `pubClient.publish(...)` fire-and-forget (emit, disconnectSockets), so during a
 * Redis outage its un-awaited rejection would surface as an unhandled rejection and
 * kill the process. The proxy turns a failed publish into a warn log and a 0
 * receiver count; every other property is bound to the real client.
 */
export function createSafePubClient(pub: Redis, warn: (message: string) => void): Redis {
  return new Proxy(pub, {
    get(target, prop): unknown {
      if (prop === "publish") {
        return (...args: Parameters<Redis["publish"]>): Promise<number> =>
          Promise.resolve(target.publish(...args)).catch((err: unknown) => {
            warn(
              `socket adapter publish failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            return 0;
          });
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

const SUBSCRIPTION_METHODS = new Set<PropertyKey>([
  "subscribe",
  "psubscribe",
  "unsubscribe",
  "punsubscribe",
]);

/**
 * Wrap the duplicated subscriber for @socket.io/redis-adapter, which calls
 * (p)subscribe and (p)unsubscribe without awaiting or catching them. Commands
 * queued while the client is still connecting reject with "Connection is closed"
 * when it is disconnected (e.g. shutdown with Redis down) and would be unhandled
 * rejections. The proxy logs those at warn and resolves 0; the raw client stays
 * with the owner for quit()/disconnect().
 */
export function createSafeSubClient(sub: Redis, warn: (message: string) => void): Redis {
  return new Proxy(sub, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== "function") return value;
      const fn = (value as (...a: unknown[]) => unknown).bind(target);
      if (!SUBSCRIPTION_METHODS.has(prop)) return fn;
      return (...args: unknown[]): Promise<unknown> =>
        Promise.resolve(fn(...args)).catch((err: unknown) => {
          warn(
            `socket adapter ${String(prop)} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return 0;
        });
    },
  });
}
