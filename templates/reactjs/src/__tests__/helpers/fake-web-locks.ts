import { vi } from "vitest";

type LockTask = () => Promise<unknown>;

/**
 * Minimal Web Locks stand-in: runs same-name tasks strictly one after another.
 * Accepts both `request(name, task)` and `request(name, { signal }, task)`; an
 * aborted signal rejects a still-queued request with an `AbortError`, as the
 * real API does. Returns the `request` spy.
 */
export function installFakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const request = vi.fn(
    (name: string, optionsOrTask: { signal?: AbortSignal } | LockTask, maybeTask?: LockTask) => {
      let granted = false;

      const signal = typeof optionsOrTask === "function" ? undefined : optionsOrTask.signal;
      const previous = queues.get(name) ?? Promise.resolve();

      const aborted = new Promise<never>((_, reject) => {
        signal?.addEventListener("abort", () => {
          if (!granted)
            reject(Object.assign(new Error("Lock request aborted"), { name: "AbortError" }));
        });
      });
      const turn = previous.then(() => {
        granted = true;
      });
      const run = (signal ? Promise.race([turn, aborted]) : turn).then(() =>
        typeof optionsOrTask === "function" ? optionsOrTask() : maybeTask!(),
      );
      // The next holder waits for this task to finish (or for our turn if we gave up).
      queues.set(
        name,
        Promise.race([run, signal ? aborted : new Promise(() => {})])
          .catch(() => {})
          .then(() => (granted ? run.catch(() => {}) : turn)),
      );
      return run;
    },
  );
  vi.stubGlobal("navigator", { locks: { request } });
  return request;
}
