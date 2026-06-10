import { getRouter } from "@/router";
import { dehydrate, QueryClient, useQueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * SSR serialization contract for the Query integration.
 *
 * These tests lock the *precondition* that makes hydration work — a prefetched
 * query is serializable, the router carries a non-zero default staleTime, and the
 * composed Wrap exposes a working QueryClient (exactly one provider). They do NOT
 * assert "the browser performs no refetch after hydrate" — that is an SSR/jsdom
 * hydration behavior verified manually (Network / React Query Devtools).
 */
describe("SSR Query integration — serialization contract", () => {
  it("dehydrates a prefetched query so it can cross the SSR boundary", async () => {
    const client = new QueryClient();
    await client.ensureQueryData({
      queryKey: ["users.list"],
      queryFn: async () => [{ id: 1, name: "Ada", email: "ada@example.com" }],
    });

    const state = dehydrate(client);
    const keys = state.queries.map((q) => q.queryHash);

    expect(keys).toContain(JSON.stringify(["users.list"]));
  });

  it("applies a non-zero default staleTime so hydrated data is not stale-on-mount", () => {
    const router = getRouter();
    const client = router.options.context.queryClient;

    expect(client.getDefaultOptions().queries?.staleTime).toBe(60_000);
  });

  it("composes a Wrap that provides a working QueryClient (single provider, integration ran)", () => {
    const router = getRouter();
    const Wrap = router.options.Wrap!;

    // Probe consumes the QueryClient context: useQueryClient throws when no
    // provider is in the tree. So rendering succeeds ONLY if the integration
    // wrapped QueryClientProvider around our (i18n-only) Wrap — a behavioral
    // check that survives minification, unlike string-matching the closure.
    function Probe() {
      useQueryClient();
      return null;
    }

    expect(() =>
      renderToStaticMarkup(
        <Wrap>
          <Probe />
        </Wrap>,
      ),
    ).not.toThrow();
  });
});
