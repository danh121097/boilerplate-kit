/** A promise with its `resolve` exposed, to hold work open in a test. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

type LockTask = () => Promise<unknown>;

/** Minimal in-order Web Locks stand-in (one queue per lock name); honours an
 * `AbortSignal` while the request is still waiting for the lock. */
export function fakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request: (
      name: string,
      optsOrTask: LockTask | { signal?: AbortSignal },
      maybeTask?: LockTask,
    ) => {
      const task = typeof optsOrTask === "function" ? optsOrTask : maybeTask!;
      const signal = typeof optsOrTask === "function" ? undefined : optsOrTask.signal;
      const run = new Promise<unknown>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("aborted", "AbortError"));
        signal?.addEventListener("abort", onAbort);
        void (queues.get(name) ?? Promise.resolve()).then(() => {
          if (signal?.aborted) return;
          signal?.removeEventListener("abort", onAbort);
          return task().then(resolve, reject);
        });
      });
      queues.set(
        name,
        run.catch(() => {}),
      );
      return run;
    },
  };
}
