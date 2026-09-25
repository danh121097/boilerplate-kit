import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { bearerOf, httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { Api } from "@/services/core";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { useAuthStore } from "@/stores/auth";
import axios from "axios";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

/**
 * Logout racing an in-flight token refresh, through the real interceptors +
 * refresh manager: refresh starts → logout runs → refresh resolves. The rotated
 * token must be the one revoked, and nothing may survive locally.
 */

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };
const ROTATED = {
  data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
} as never;

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("logout during an in-flight refresh", () => {
  beforeEach(async () => {
    resetSecureStore();
    Api.setBaseURL("http://api.test", "MAIN");
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    useAuthStore.setState({ user: null, isAuthenticated: true, hydrated: true });
  });
  afterEach(() => jest.restoreAllMocks());
  // Signing out pins the session query to null; drop it so its GC timer does
  // not keep jest alive.
  afterAll(() => queryClient.clear());

  it("revokes the rotated token, persists nothing and stays logged out", async () => {
    let releaseRefresh: () => void = () => {};
    jest
      .spyOn(axios, "post")
      .mockImplementation(
        () => new Promise((resolve) => (releaseRefresh = () => resolve(ROTATED))),
      );
    const client = makeClient(async (config) =>
      bearerOf(config) === "NEW" ? ok(config, { user: USER }) : httpError(config),
    );
    // getMe goes through the real interceptors: 401 → refresh (held open) → replay.
    jest.spyOn(AuthModel, "getMe").mockImplementation(async () => {
      const res = (await client.get("/auth/me")) as unknown as { data: { user: typeof USER } };
      return res.data.user as never;
    });
    const logoutPost = jest
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true } as never);

    const loading = useAuthStore.getState().loadUser(); // refresh starts
    await flush();
    const loggingOut = useAuthStore.getState().logout(); // logout runs mid-refresh
    await flush();
    expect(logoutPost).not.toHaveBeenCalled(); // waits for the refresh first
    releaseRefresh(); // refresh resolves
    await Promise.all([loading, loggingOut]);

    expect(logoutPost).toHaveBeenCalledWith(
      expect.objectContaining({ data: { refreshToken: "NEW_R" } }), // latest, not OLD_R
    );
    expect(await getAccessToken("MAIN")).toBeNull();
    expect(await getRefreshToken("MAIN")).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it("drops a refresh that resolves after the session was cleared", async () => {
    let releaseRefresh: () => void = () => {};
    jest
      .spyOn(axios, "post")
      .mockImplementation(
        () => new Promise((resolve) => (releaseRefresh = () => resolve(ROTATED))),
      );
    const client = makeClient(async (config) =>
      bearerOf(config) === "NEW" ? ok(config, { user: USER }) : httpError(config),
    );
    jest.spyOn(AuthModel, "getMe").mockImplementation(async () => {
      const res = (await client.get("/auth/me")) as unknown as { data: { user: typeof USER } };
      return res.data.user as never;
    });
    jest.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    const loading = useAuthStore.getState().loadUser();
    await flush();
    // Session ends without waiting (e.g. expiry elsewhere): clear, then the refresh lands.
    await clearAuthTokens();
    useAuthStore.setState({ user: null, isAuthenticated: false });
    releaseRefresh();
    await loading;

    expect(await getAccessToken("MAIN")).toBeNull();
    expect(await getRefreshToken("MAIN")).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });
});
