import { Types } from "mongoose";
import { z } from "zod";
import type {
  CursorMeta,
  CursorParams,
  CursorResult,
  OffsetMeta,
  OffsetParams,
} from "@/types/pagination";

/**
 * Reusable pagination helpers for list endpoints — two equal strategies:
 *   - OFFSET (page/limit): jump-to-page, total count; good for admin lists.
 *   - CURSOR (keyset on _id): stable under inserts, fast at scale; good for feeds.
 *
 * Pure + model-agnostic: no DB calls live here (the only Mongoose touch is
 * `Types.ObjectId.isValid` to validate a cursor). Parsers clamp + default so a
 * junk `page`/`limit` degrades to safe values instead of erroring.
 */

export const DEFAULT_LIMIT = 20;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 100;

/** Query bag as Express delivers it — values arrive as strings (or arrays). */
type Query = Record<string, unknown>;

/** Clamp a raw limit into [MIN_LIMIT..MAX_LIMIT]; non-numeric → DEFAULT_LIMIT. */
function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(n)));
}

/** Coerce a raw page into an integer ≥ 1; zero/negative/non-numeric → 1. */
function toPage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Parse `?page&limit` into `{ page, limit, skip }` for `.skip().limit()`. */
export function parseOffsetPagination(query: Query): OffsetParams {
  const page = toPage(query.page);
  const limit = clampLimit(query.limit);
  return { page, limit, skip: (page - 1) * limit };
}

/** Build offset metadata from the total count and the current page/limit. */
export function buildOffsetMeta(total: number, page: number, limit: number): OffsetMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** Parse `?cursor&limit`; `cursor` is kept only if it is a valid ObjectId. */
export function parseCursorPagination(query: Query): CursorParams {
  const raw = query.cursor;
  const cursor = typeof raw === "string" && Types.ObjectId.isValid(raw) ? raw : undefined;
  return { cursor, limit: clampLimit(query.limit) };
}

/**
 * Turn a `limit + 1` fetch into a trimmed page + cursor meta.
 * Fetch one extra row to detect `hasNext` without a second query, then drop it.
 * `nextCursor` is the `_id` of the last KEPT item (null on the final page).
 * Keyset is valid only for `_id`-sorted lists.
 */
export function buildCursorMeta<T extends { _id: unknown }>(
  rows: T[],
  limit: number,
): CursorResult<T> {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const meta: CursorMeta = {
    limit,
    hasNext,
    nextCursor: hasNext && last ? String(last._id) : null,
  };
  return { items, meta };
}

/**
 * Optional strict query schema — use with a query-validation middleware when a
 * caller wants `400` on bad params instead of the forgiving clamp behavior.
 * Not used by the default list endpoints.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(MIN_LIMIT).max(MAX_LIMIT).optional(),
  cursor: z.string().optional(),
});
