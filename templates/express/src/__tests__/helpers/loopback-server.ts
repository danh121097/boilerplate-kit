import { createServer, type RequestListener, type Server } from "http";
import type { AddressInfo } from "net";

/**
 * Loopback address every test HTTP server binds to.
 *
 * `supertest(app)` starts a fresh server on `listen(0)` (wildcard `::`) for every
 * request. On macOS that wildcard bind can be handed a port a foreign process already
 * holds on 127.0.0.1, and the request then reaches the wrong server (spurious 401/404
 * under load). Binding one server to 127.0.0.1 per test app and pointing supertest at
 * it (supertest reuses a server that is already listening) avoids the collision.
 */
export const TEST_HOST = "127.0.0.1";

/** Start `app` on an ephemeral 127.0.0.1 port; pass the result to `request(server)`. */
export async function listenOnLoopback(app: RequestListener): Promise<Server> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, TEST_HOST, resolve);
  });
  return server;
}

/** Stop a server started by listenOnLoopback. */
export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/** Port a loopback server is listening on. */
export const portOf = (server: Server): number => (server.address() as AddressInfo).port;
