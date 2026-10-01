import { authContract } from "@/services/auth/contract";
import { getMockAuth } from "@/services/auth/data/mock-auth-config";
import {
  authResult,
  bodyOf,
  pathOf,
  reply,
  succeed,
  unauthorized,
} from "@/services/auth/data/mock-auth-responses";
import { readMockUser, writeMockUser } from "@/services/auth/data/mock-auth-session";
import { answerMockUsers, mockDemoUser } from "@/services/users/data/mock-users";
import type { MockAuthConfig } from "@/services/auth/data/mock-auth-config";
import type { AuthUser } from "@/services/auth/types/auth";
import type { MockCaller } from "@/services/users/data/mock-users";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import axios from "axios";

/**
 * Dev-only mock of the backend auth routes (login, register, refresh, logout,
 * me) and the users routes (`services/users/data/mock-users.ts`), so the UI can be
 * built before the backend auth exists. Turn it on with `VITE_AUTH_MOCK=true`;
 * turn it off and the real backend is used with no other change — screens,
 * stores and guards never know the difference.
 *
 * It sits at the axios transport seam: `AuthModel`'s and `UsersModel`'s clients
 * and the bare refresh client use `mockAuthAdapter`, so requests still pass through the real request
 * and response interceptors and fail on the same error path (a wrong password is
 * the same 401 envelope, shown by the form as the backend's message). Only the
 * network call is replaced; any other API still hits the real backend.
 *
 * Session persistence is the real mode's: login sets the readable session hint
 * cookie exactly as before (`startSession`), so the SSR route guards, cross-tab
 * sync and logout work unchanged. The httpOnly token cookies a backend would set
 * cannot exist without one, so the mock keeps the signed-in user in a readable
 * `<APP>_MOCK_USER` cookie instead — the browser sends it with every page
 * request, which lets the server-side session read (`server/session.ts`) resolve
 * the user during SSR, and it lives as long as the backend's refresh cookie.
 * Login accepts one credential pair (`VITE_AUTH_MOCK_EMAIL` /
 * `VITE_AUTH_MOCK_PASSWORD`, default demo@example.com / password); register
 * signs up any user, who then stays signed in but cannot log in again.
 *
 * Files: `mock-auth-config.ts` (the flag), `mock-auth-session.ts` (the mock user cookie),
 * `mock-auth-responses.ts` (backend-shaped replies), `services/users/data/mock-users.ts`
 * (the users fixture and handlers), and this file (the adapter).
 *
 * Never active in a production build: the flag is ignored there (with one
 * warning) and the adapter is not exported, so the bundler drops this code.
 */
export {
  getMockAuth,
  isMockAuthEnabled,
  MOCK_AUTH_DEFAULT_EMAIL,
  MOCK_AUTH_DEFAULT_PASSWORD,
} from "@/services/auth/data/mock-auth-config";
export type { MockAuthConfig } from "@/services/auth/data/mock-auth-config";

/** Who sent the request: the user in the mock session cookie, or the backend's 401 message when there is none. */
function callerOf(_config: InternalAxiosRequestConfig): MockCaller {
  return readMockUser() ?? "Access token required!";
}

/** Answer one auth or users request the way the backend would, or null for a path this mock does not own. */
function answer(
  mock: MockAuthConfig,
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> | null {
  const method = (config.method ?? "get").toLowerCase();
  const path = pathOf(config);
  const body = bodyOf(config);

  const { paths } = authContract;

  if (method === "post" && path.endsWith(paths.login)) {
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    if (email !== mock.email.toLowerCase() || body.password !== mock.password) {
      return reply(config, 401, unauthorized("Invalid email or password!"));
    }
    const user = mockDemoUser(mock);
    writeMockUser(user);
    return reply(config, 200, succeed("Login successful!", authResult(user)));
  }

  if (method === "post" && path.endsWith(paths.register)) {
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const now = new Date().toISOString();
    const user: AuthUser = {
      _id: `mock-${email}`,
      email,
      name: String(body.name ?? ""),
      role: "user",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    writeMockUser(user);
    return reply(config, 201, succeed("User registered successfully!", authResult(user)));
  }

  if (method === "post" && path.endsWith(paths.refresh)) {
    const user = readMockUser();
    if (!user) {
      return reply(
        config,
        401,
        unauthorized("Refresh token not found in request body or cookies!"),
      );
    }
    writeMockUser(user); // renews the cookie, like a rotated refresh cookie
    return reply(config, 200, succeed("Tokens refreshed successfully!"));
  }

  if (method === "post" && path.endsWith(paths.logout)) {
    writeMockUser(null);
    return reply(config, 200, succeed("Logged out successfully!"));
  }

  if (method === "get" && path.endsWith(paths.me)) {
    const caller = callerOf(config);
    if (typeof caller === "string") return reply(config, 401, unauthorized(caller));
    return reply(config, 200, succeed("", { user: caller }));
  }

  return answerMockUsers(mock, config, () => callerOf(config));
}

/** axios's own network adapter, resolved at call time so a paused mock falls through to it. */
function realAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  return axios.getAdapter(axios.defaults.adapter)(config);
}

const handleAuthRequest: AxiosAdapter = (config) => {
  const mock = getMockAuth();
  return (mock && answer(mock, config)) ?? realAdapter(config);
};

/**
 * axios adapter for the auth and users clients and the refresh call. Undefined in a
 * production build (axios then uses its network adapter, and the mock is
 * tree-shaken). While the flag is off in development it delegates every request
 * to axios's real adapter, so flipping `VITE_AUTH_MOCK` needs no code change.
 */
export const mockAuthAdapter: AxiosAdapter | undefined = import.meta.env.PROD
  ? undefined
  : handleAuthRequest;
