import {
  parseOffsetPagination,
  buildOffsetMeta,
  parseCursorPagination,
  buildCursorMeta,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "@/utils/pagination";
import { Types } from "mongoose";
import { describe, it, expect } from "vitest";

describe("parseOffsetPagination", () => {
  it("defaults to page 1 / DEFAULT_LIMIT / skip 0 when no params", () => {
    expect(parseOffsetPagination({})).toEqual({ page: 1, limit: DEFAULT_LIMIT, skip: 0 });
  });

  it("parses string query values and computes skip", () => {
    expect(parseOffsetPagination({ page: "3", limit: "20" })).toEqual({
      page: 3,
      limit: 20,
      skip: 40,
    });
  });

  it("clamps limit above MAX down to MAX", () => {
    expect(parseOffsetPagination({ limit: "9999" }).limit).toBe(MAX_LIMIT);
  });

  it("clamps limit below 1 up to 1", () => {
    expect(parseOffsetPagination({ limit: "0" }).limit).toBe(1);
    expect(parseOffsetPagination({ limit: "-5" }).limit).toBe(1);
  });

  it("falls back to DEFAULT_LIMIT on non-numeric limit", () => {
    expect(parseOffsetPagination({ limit: "abc" }).limit).toBe(DEFAULT_LIMIT);
  });

  it("floors page to 1 for zero / negative / non-numeric", () => {
    expect(parseOffsetPagination({ page: "0" }).page).toBe(1);
    expect(parseOffsetPagination({ page: "-3" }).page).toBe(1);
    expect(parseOffsetPagination({ page: "abc" }).page).toBe(1);
  });
});

describe("buildOffsetMeta", () => {
  it("empty result set → totalPages 0, no next/prev", () => {
    expect(buildOffsetMeta(0, 1, 20)).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });

  it("middle page has both next and prev", () => {
    expect(buildOffsetMeta(137, 2, 20)).toEqual({
      page: 2,
      limit: 20,
      total: 137,
      totalPages: 7,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("last page has prev but no next", () => {
    const meta = buildOffsetMeta(40, 2, 20);
    expect(meta.totalPages).toBe(2);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(true);
  });

  it("single full page has neither next nor prev", () => {
    const meta = buildOffsetMeta(20, 1, 20);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(false);
  });
});

describe("parseCursorPagination", () => {
  it("returns undefined cursor when absent", () => {
    expect(parseCursorPagination({})).toEqual({ cursor: undefined, limit: DEFAULT_LIMIT });
  });

  it("returns undefined for an invalid ObjectId cursor", () => {
    expect(parseCursorPagination({ cursor: "not-an-id" }).cursor).toBeUndefined();
  });

  it("passes a valid ObjectId cursor through", () => {
    const id = new Types.ObjectId().toString();
    expect(parseCursorPagination({ cursor: id }).cursor).toBe(id);
  });

  it("clamps limit like the offset parser", () => {
    expect(parseCursorPagination({ limit: "9999" }).limit).toBe(MAX_LIMIT);
  });
});

describe("buildCursorMeta", () => {
  const makeItems = (n: number) => Array.from({ length: n }, () => ({ _id: new Types.ObjectId() }));

  it("limit+1 rows → hasNext true, trimmed to limit, nextCursor = last kept id", () => {
    const rows = makeItems(21); // caller fetched limit (20) + 1
    const { items, meta } = buildCursorMeta(rows, 20);
    expect(items).toHaveLength(20);
    expect(meta.hasNext).toBe(true);
    expect(meta.limit).toBe(20);
    expect(meta.nextCursor).toBe(String(items[19]._id));
  });

  it("≤ limit rows → hasNext false, nextCursor null, items untouched", () => {
    const rows = makeItems(12);
    const { items, meta } = buildCursorMeta(rows, 20);
    expect(items).toHaveLength(12);
    expect(meta.hasNext).toBe(false);
    expect(meta.nextCursor).toBeNull();
  });
});
