import { timeoutManager } from "@tanstack/react-query";

/**
 * Query's cache garbage-collection timers (set whenever a QueryClient holds an
 * entry nobody observes) would keep a jest worker alive after its suite ends
 * ("worker failed to exit gracefully"). Unref them so a test that forgets
 * `queryClient.clear()` cannot leak the worker; nothing waits on a gc timer.
 */
type Unrefable = { unref?: () => void };

timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => {
    const id = globalThis.setTimeout(callback, delay) as unknown as Unrefable;
    id.unref?.();
    return id as never;
  },
  clearTimeout: (id) => globalThis.clearTimeout(id as never),
  setInterval: (callback, delay) => {
    const id = globalThis.setInterval(callback, delay) as unknown as Unrefable;
    id.unref?.();
    return id as never;
  },
  clearInterval: (id) => globalThis.clearInterval(id as never),
});
