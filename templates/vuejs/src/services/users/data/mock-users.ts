import { failure, pathOf, queryOf, reply } from "@/services/auth/data/mock-auth-responses";
import { usersContract } from "@/services/users/contract";
import type { MockAuthConfig } from "@/services/auth/data/mock-auth-config";
import type { AuthUser } from "@/services/auth/types/auth";
import type { Role, User } from "@/services/users/types/user";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

/**
 * Dev-only mock of the backend users routes (`GET /users`, `GET /users/:id`),
 * answered next to the mock auth (see `services/auth/data/mock-auth.ts`): same flag,
 * same seam, same production guard. Mirrors the express users module: the
 * `{ success: true, data, meta }` envelope with offset pagination, no
 * passwords, `401` without a session, `403` below admin, `404` for an unknown id.
 *
 * The list is a fixed fixture: the demo user (an admin, so the built-in users
 * screen works) plus a few sample users. Users registered during the mock
 * session are not added; they stay signed in but are `user`s, so the users
 * screen refuses them with `403`, as the backend would.
 */

const MOCK_ADMIN_ROLES: Role[] = ["admin", "super_admin"];

/** Same limits as the backend's offset pagination (`?page&limit`, clamped, never rejected). */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Sample users listed next to the demo user. Identical in every template. */
export const MOCK_SAMPLE_USERS: User[] = [
  {
    _id: "mock-user-1",
    name: "Alice Nguyen",
    email: "alice.nguyen@example.com",
    role: "super_admin",
    isActive: true,
    createdAt: "2026-01-05T09:00:00.000Z",
    updatedAt: "2026-01-05T09:00:00.000Z",
  },
  {
    _id: "mock-user-2",
    name: "Bob Tanaka",
    email: "bob.tanaka@example.com",
    role: "user",
    isActive: true,
    createdAt: "2026-01-19T13:30:00.000Z",
    updatedAt: "2026-02-02T08:15:00.000Z",
  },
  {
    _id: "mock-user-3",
    name: "Carol Silva",
    email: "carol.silva@example.com",
    role: "admin",
    isActive: true,
    createdAt: "2026-02-03T10:45:00.000Z",
    updatedAt: "2026-02-03T10:45:00.000Z",
  },
  {
    _id: "mock-user-4",
    name: "Dan Okafor",
    email: "dan.okafor@example.com",
    role: "user",
    isActive: true,
    createdAt: "2026-02-17T16:20:00.000Z",
    updatedAt: "2026-02-17T16:20:00.000Z",
  },
  {
    _id: "mock-user-5",
    name: "Eve Martin",
    email: "eve.martin@example.com",
    role: "user",
    isActive: false,
    createdAt: "2026-02-24T11:05:00.000Z",
    updatedAt: "2026-03-01T14:00:00.000Z",
  },
];

/** The user a demo login signs in as. An admin, so `/users` is reachable. */
export function mockDemoUser(mock: MockAuthConfig): AuthUser {
  return {
    _id: "mock-user",
    email: mock.email,
    name: "Demo User",
    role: "admin",
    isActive: true,
    createdAt: "2026-03-02T08:00:00.000Z",
    updatedAt: "2026-03-02T08:00:00.000Z",
  };
}

/** Every listed user, newest first (the backend sorts by `_id` descending). */
function listedUsers(mock: MockAuthConfig): User[] {
  return [mockDemoUser(mock), ...MOCK_SAMPLE_USERS].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/** Who is calling: the signed-in user, or the 401 message the backend's `authenticate` would send. */
export type MockCaller = AuthUser | string;

export interface MockUsersOutcome {
  status: number;
  body: Record<string, unknown>;
}

function clamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Answer a users request the way the backend would, or null for a request this
 * mock does not own (any other path or method). Checks run in the backend's
 * order: authenticate (401), then the admin role (403), then the lookup (404).
 */
export function respondMockUsers(
  mock: MockAuthConfig,
  method: string,
  path: string,
  query: Record<string, unknown>,
  caller: () => MockCaller,
): MockUsersOutcome | null {
  const { list, byId } = usersContract.paths;

  const idMatch = path.startsWith(`${usersContract.base}/`) ? path.slice(list.length + 1) : null;
  const isList = path === list;
  if (method !== "get" || (!isList && (!idMatch || idMatch.includes("/")))) return null;

  const who = caller();
  if (typeof who === "string")
    return { status: 401, body: failure(401, "AUTHENTICATION_ERROR", who) };
  if (!MOCK_ADMIN_ROLES.includes(who.role)) {
    return {
      status: 403,
      body: failure(403, "AUTHORIZATION_ERROR", "Insufficient permissions!"),
    };
  }

  const users = listedUsers(mock);
  if (isList) {
    const limit = clamp(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const page = clamp(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const totalPages = Math.ceil(users.length / limit);
    const data = users.slice((page - 1) * limit, page * limit);
    const meta = {
      page,
      limit,
      total: users.length,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
    return { status: 200, body: { success: true, data, meta } };
  }

  const user = users.find((u) => byId(u._id) === path);
  if (!user) return { status: 404, body: failure(404, "NOT_FOUND", "User not found!") };
  return { status: 200, body: { success: true, data: user } };
}

/** `respondMockUsers` as an axios reply, for the mock adapter. */
export function answerMockUsers(
  mock: MockAuthConfig,
  config: InternalAxiosRequestConfig,
  caller: () => MockCaller,
): Promise<AxiosResponse> | null {
  const method = (config.method ?? "get").toLowerCase();
  const outcome = respondMockUsers(mock, method, pathOf(config), queryOf(config), caller);
  return outcome && reply(config, outcome.status, outcome.body);
}
