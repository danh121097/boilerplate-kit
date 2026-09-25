import { resetQueriesToSignedOut } from "@/services/core";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `resetQueriesToSignedOut` against a live observer — the same `QueryObserver` the
 * layout header's `useSessionQuery()` holds for the app's lifetime. Ending a
 * session must drop the user without detaching that observer, so the next
 * login (which invalidates `auth.me`) reaches the header again.
 */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function observeSession(queryClient: QueryClient, fetchMe: () => Promise<unknown>) {
  const observer = new QueryObserver(queryClient, {
    queryKey: ["auth.me"],
    queryFn: fetchMe,
    staleTime: Infinity,
  });
  const seen: unknown[] = [];
  const unsubscribe = observer.subscribe((result) => seen.push(result.data));
  return { observer, seen, unsubscribe };
}

describe("resetQueriesToSignedOut with a mounted session observer", () => {
  const queryClient = new QueryClient();

  afterEach(() => queryClient.clear());

  it("logout then login in the same tab: the header sees null, then the new user", async () => {
    let user: unknown = { _id: "u1" };
    const fetchMe = vi.fn(async () => user);
    const header = observeSession(queryClient, fetchMe);
    await flush();
    expect(header.observer.getCurrentResult().data).toEqual({ _id: "u1" });

    resetQueriesToSignedOut(queryClient, "auth.me"); // logout settled
    expect(header.observer.getCurrentResult().data).toBeNull();

    user = { _id: "u2" }; // login succeeds → the mutation invalidates auth.me
    await queryClient.invalidateQueries({ queryKey: ["auth.me"] });

    expect(fetchMe).toHaveBeenCalledTimes(2);
    expect(header.observer.getCurrentResult().data).toEqual({ _id: "u2" });
    expect(header.seen.at(-1)).toEqual({ _id: "u2" });
    header.unsubscribe();
  });

  it("drops observed page data without detaching it, and removes unobserved data", async () => {
    const fetchList = vi.fn(async () => ({ data: ["page"] }));
    const list = new QueryObserver(queryClient, {
      queryKey: ["users.list"],
      queryFn: fetchList,
      staleTime: Infinity,
    });
    const unsubscribe = list.subscribe(() => {});
    await flush();
    queryClient.setQueryData(["users.detail"], { _id: "x" });

    resetQueriesToSignedOut(queryClient, "auth.me");

    expect(list.getCurrentResult().data).toBeUndefined();
    expect(fetchList).toHaveBeenCalledTimes(1); // no refetch for the ended session
    expect(queryClient.getQueryCache().find({ queryKey: ["users.detail"] })).toBeUndefined();

    await queryClient.invalidateQueries({ queryKey: ["users.list"] }); // next login
    expect(fetchList).toHaveBeenCalledTimes(2);
    expect(list.getCurrentResult().data).toEqual({ data: ["page"] });
    unsubscribe();
  });

  it("cancels an in-flight fetch so the old user's response never lands", async () => {
    let resolveMe!: (user: unknown) => void;
    const fetchMe = vi.fn(() => new Promise((resolve) => (resolveMe = resolve)));
    const header = observeSession(queryClient, fetchMe);
    await flush();
    expect(fetchMe).toHaveBeenCalledTimes(1);

    resetQueriesToSignedOut(queryClient, "auth.me");
    resolveMe({ _id: "u1" });
    await flush();

    expect(header.observer.getCurrentResult().data).toBeNull();
    header.unsubscribe();
  });

  it("seeds a null session even when nothing observes it", () => {
    queryClient.setQueryData(["auth.me"], { _id: "u1" });
    resetQueriesToSignedOut(queryClient, "auth.me");
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
  });
});
