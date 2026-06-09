import { createServerFn } from "@tanstack/react-start";
import type { User } from "@/services/users/types/user";

/**
 * Server function — fetches users from the API on the server side.
 *
 * createServerFn runs exclusively on the server (Node/edge runtime). It does NOT
 * use the client-side axios service layer — that layer is browser-only (reads
 * localStorage for auth tokens). Server functions should use fetch/axios directly
 * and attach server-side auth context (e.g. from request cookies) as needed.
 *
 * For this demo we hit the public JSONPlaceholder API without auth. A real app
 * would read the auth cookie from the incoming request and forward it.
 */
export const getUsersServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<User[]> => {
    const apiBase =
      process.env["VITE_API_BASE_URL"] ?? "https://jsonplaceholder.typicode.com";
    const res = await fetch(`${apiBase}/users`);
    if (!res.ok) {
      throw new Error(`Failed to fetch users: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as unknown[];
    // JSONPlaceholder returns objects with id/name/email; cast to our User type.
    return json.map((u) => {
      const item = u as Record<string, unknown>;
      return {
        id: Number(item["id"]),
        name: String(item["name"] ?? ""),
        email: String(item["email"] ?? ""),
      };
    });
  },
);
