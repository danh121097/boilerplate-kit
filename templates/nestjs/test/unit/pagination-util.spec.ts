/**
 * Unit tests for pagination.util — offset + cursor parsing/clamping.
 * Pure functions, no DI needed.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,
  buildCursorMeta,
  buildOffsetMeta,
  parseCursorPagination,
  parseOffsetPagination,
} from "@/common/utils/pagination.util";

describe("parseOffsetPagination", () => {
  describe("page clamping", () => {
    it("page < 1 → 1", () => {
      expect(parseOffsetPagination({ page: "0" }).page).toBe(1);
    });

    it("negative page → 1", () => {
      expect(parseOffsetPagination({ page: "-5" }).page).toBe(1);
    });

    it("non-numeric page → 1", () => {
      expect(parseOffsetPagination({ page: "abc" }).page).toBe(1);
    });

    it("missing page → 1", () => {
      expect(parseOffsetPagination({}).page).toBe(1);
    });

    it("valid page is preserved", () => {
      expect(parseOffsetPagination({ page: "3" }).page).toBe(3);
    });

    it("decimal page is floored", () => {
      expect(parseOffsetPagination({ page: "2.9" }).page).toBe(2);
    });
  });

  describe("limit clamping", () => {
    it("limit > MAX_LIMIT → MAX_LIMIT", () => {
      expect(parseOffsetPagination({ limit: "9999" }).limit).toBe(MAX_LIMIT);
    });

    it("limit < MIN_LIMIT → MIN_LIMIT", () => {
      expect(parseOffsetPagination({ limit: "0" }).limit).toBe(MIN_LIMIT);
    });

    it("non-numeric limit → DEFAULT_LIMIT", () => {
      expect(parseOffsetPagination({ limit: "xyz" }).limit).toBe(DEFAULT_LIMIT);
    });

    it("missing limit → DEFAULT_LIMIT", () => {
      expect(parseOffsetPagination({}).limit).toBe(DEFAULT_LIMIT);
    });

    it("valid limit preserved", () => {
      expect(parseOffsetPagination({ limit: "50" }).limit).toBe(50);
    });

    it("decimal limit is floored", () => {
      expect(parseOffsetPagination({ limit: "10.7" }).limit).toBe(10);
    });
  });

  describe("skip calculation", () => {
    it("skip = (page - 1) * limit", () => {
      const result = parseOffsetPagination({ page: "3", limit: "10" });
      expect(result.skip).toBe(20);
    });

    it("page 1 → skip 0", () => {
      expect(parseOffsetPagination({ page: "1", limit: "20" }).skip).toBe(0);
    });
  });
});

describe("buildOffsetMeta", () => {
  it("computes totalPages and navigation flags", () => {
    const meta = buildOffsetMeta(100, 2, 20);
    expect(meta.total).toBe(100);
    expect(meta.totalPages).toBe(5);
    expect(meta.hasNext).toBe(true);
    expect(meta.hasPrev).toBe(true);
  });

  it("first page: hasPrev false", () => {
    const meta = buildOffsetMeta(50, 1, 10);
    expect(meta.hasPrev).toBe(false);
    expect(meta.hasNext).toBe(true);
  });

  it("last page: hasNext false", () => {
    const meta = buildOffsetMeta(30, 3, 10);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(true);
  });

  it("single page: both flags false", () => {
    const meta = buildOffsetMeta(5, 1, 20);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(false);
  });

  it("empty result → totalPages 0", () => {
    const meta = buildOffsetMeta(0, 1, 20);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNext).toBe(false);
  });
});

describe("parseCursorPagination", () => {
  const VALID_OID = "507f1f77bcf86cd799439011";

  it("valid ObjectId cursor is preserved", () => {
    const result = parseCursorPagination({ cursor: VALID_OID });
    expect(result.cursor).toBe(VALID_OID);
  });

  it("invalid ObjectId cursor → undefined", () => {
    const result = parseCursorPagination({ cursor: "not-an-oid" });
    expect(result.cursor).toBeUndefined();
  });

  it("missing cursor → undefined", () => {
    expect(parseCursorPagination({}).cursor).toBeUndefined();
  });

  it("limit clamped same as offset", () => {
    expect(parseCursorPagination({ limit: "999" }).limit).toBe(MAX_LIMIT);
    expect(parseCursorPagination({ limit: "0" }).limit).toBe(MIN_LIMIT);
  });
});

describe("buildCursorMeta", () => {
  const makeItems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ _id: String(i + 1) }));

  it("hasNext true when rows.length > limit (extra row fetched)", () => {
    const rows = makeItems(11); // fetched limit+1 = 11
    const { items, meta } = buildCursorMeta(rows, 10);
    expect(meta.hasNext).toBe(true);
    expect(items).toHaveLength(10); // extra row dropped
  });

  it("hasNext false on final page", () => {
    const rows = makeItems(5); // only 5 rows returned, limit=10
    const { items, meta } = buildCursorMeta(rows, 10);
    expect(meta.hasNext).toBe(false);
    expect(items).toHaveLength(5);
  });

  it("nextCursor is _id of last kept item when hasNext true", () => {
    const rows = makeItems(11);
    const { meta } = buildCursorMeta(rows, 10);
    expect(meta.nextCursor).toBe("10"); // last of 10 kept items
  });

  it("nextCursor is null on final page", () => {
    const rows = makeItems(3);
    const { meta } = buildCursorMeta(rows, 10);
    expect(meta.nextCursor).toBeNull();
  });

  it("empty result → no next, null cursor", () => {
    const { items, meta } = buildCursorMeta([], 10);
    expect(items).toHaveLength(0);
    expect(meta.hasNext).toBe(false);
    expect(meta.nextCursor).toBeNull();
  });
});
