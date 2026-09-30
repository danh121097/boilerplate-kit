/** Offset (page/limit) pagination metadata returned alongside a list. */
export interface OffsetMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Cursor (keyset) pagination metadata. `nextCursor` is null on the last page. */
export interface CursorMeta {
  limit: number;
  nextCursor: string | null;
  hasNext: boolean;
}

/** Parsed offset query — ready to feed Mongoose `.skip(skip).limit(limit)`. */
export interface OffsetParams {
  page: number;
  limit: number;
  skip: number;
}

/** Parsed cursor query — `cursor` is a validated ObjectId string or undefined. */
export interface CursorParams {
  cursor: string | undefined;
  limit: number;
}

/** Offset list result envelope (data + meta). */
export interface PaginatedResult<T> {
  data: T[];
  meta: OffsetMeta;
}

/** Cursor list result (trimmed items + meta). */
export interface CursorResult<T> {
  items: T[];
  meta: CursorMeta;
}
