import { readServerSession } from "@/server/session";
import { createServerFn } from "@tanstack/react-start";

/** Current user as a server function (runs on the server, RPC from the browser).
 * The handler body is stripped from the client bundle, and with it the
 * server-only import chain behind `readServerSession`. */
export const getMeServerFn = createServerFn({ method: "GET" }).handler(() => readServerSession());
