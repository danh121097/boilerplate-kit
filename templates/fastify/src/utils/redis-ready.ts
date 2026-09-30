/**
 * True only when the ioredis client can serve commands right now. During an outage
 * (connecting / reconnecting / ended) callers short-circuit and fail open at once
 * instead of waiting on a client that cannot answer.
 */
export function isRedisReady(client: { status?: string } | null | undefined): boolean {
  return client?.status === "ready";
}
