import { makeQueryClient } from "@/services/core/query-client";
import { cache } from "react";

/**
 * One QueryClient per server request, deduped by React `cache` so several
 * prefetches in the same RSC render share the cache that gets dehydrated.
 *
 * Server-only — import from RSCs / async Server Components (alongside the
 * `serverApiGet`-backed data fns), never from client/"use client" code.
 */
export const getServerQueryClient = cache(makeQueryClient);
