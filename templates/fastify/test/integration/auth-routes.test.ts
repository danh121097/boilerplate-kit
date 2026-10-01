import { buildApp } from "@/app";
import { RefreshToken } from "@/models/refresh-token";
import { computeSignature } from "@/utils/hmac";
import { hashToken } from "@/utils/jwt";
import { signHeaders } from "../helpers/sign-request";
import { API, createSignedRequest } from "../helpers/signed-request";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";

describe("Auth routes", () => {
  let app: FastifyInstance;
  let signedRequest: ReturnType<typeof createSignedRequest>;

  beforeAll(async () => {
    app = buildApp({ sockets: false });
    await app.ready();
    signedRequest = createSignedRequest(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const user = { email: "route@test.com", password: "Password1!", name: "Route" };

  const setCookies = (res: LightMyRequestResponse): string[] =>
    [res.headers["set-cookie"] ?? []].flat();

  /** Extract a cookie's `name=value` pair from a Set-Cookie array. */
  const cookieValue = (cookies: string[], name: string): string | undefined =>
    cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];

  /** Turn a Set-Cookie array into the `cookies` inject option. */
  const toCookies = (cookies: string[]): Record<string, string> =>
    Object.fromEntries(
      cookies.map((c) => {
        const [name, ...value] = c.split(";")[0].split("=");
        return [name, value.join("=")];
      }),
    );

  /** Assert both token cookies are expired; refreshToken keeps its auth-route path. */
  const expectTokenCookiesCleared = (cookies: string[]): void => {
    const access = cookies.find((c) => c.startsWith("accessToken="));
    const refresh = cookies.find((c) => c.startsWith("refreshToken="));
    expect(access).toMatch(/^accessToken=;/);
    expect(access).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(access).toMatch(/Path=\/(;|$)/);
    expect(refresh).toMatch(/^refreshToken=;/);
    expect(refresh).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth(;|$)/);
  };

  /** Move every rotation timestamp past the reuse grace window. */
  const backdateAllRotations = () =>
    RefreshToken.updateMany(
      { rotatedAt: { $exists: true } },
      { rotatedAt: new Date(Date.now() - 60_000) },
    );

  const post = (path: string, payload?: unknown, cookies?: Record<string, string>) =>
    signedRequest({
      method: "POST",
      url: `${API}/auth/${path}`,
      payload: payload as object,
      cookies,
    });

  const registerUser = async (): Promise<string[]> => setCookies(await post("register", user));

  it("POST /auth/register: 201 sets HttpOnly token cookies and a serialized user", async () => {
    const res = await post("register", user);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toMatchObject({ email: user.email, role: "user" });
    expect(body.data.user).not.toHaveProperty("password");
    const cookies = setCookies(res);
    expect(cookieValue(cookies, "accessToken")).toBeDefined();
    expect(cookieValue(cookies, "refreshToken")).toBeDefined();
    expect(cookies.every((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  it("POST /auth/register: 409 duplicate email", async () => {
    await post("register", user);
    const res = await post("register", user);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ errorType: "CONFLICT" });
  });

  it("POST /auth/register: 400 validation error", async () => {
    const res = await post("register", { email: "bad-email", password: "short", name: "   " });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      status: "error",
      errorType: "VALIDATION_ERROR",
      error_code: 400,
      error_message: expect.any(String),
    });
  });

  it("POST /auth/register: 400 for a password that passes length but fails strength", async () => {
    const res = await post("register", { ...user, password: "alllowercase" });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorType).toBe("VALIDATION_ERROR");
  });

  it("POST /auth/login: 200 sets token cookies (email is case-insensitive)", async () => {
    await registerUser();
    const res = await post("login", { email: user.email.toUpperCase(), password: user.password });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, message: "Login successful!" });
    expect(res.json().data.user).toBeDefined();
    expect(cookieValue(setCookies(res), "accessToken")).toBeDefined();
  });

  it("POST /auth/login: 401 wrong password", async () => {
    await registerUser();
    const res = await post("login", { email: user.email, password: "WrongPass1!" });
    expect(res.statusCode).toBe(401);
    expect(res.json().errorType).toBe("AUTHENTICATION_ERROR");
  });

  it("POST /auth/refresh: 200 rotates the token cookie", async () => {
    const registered = await registerUser();
    const res = await post("refresh", undefined, toCookies(registered));
    expect(res.statusCode).toBe(200);
    expect(cookieValue(setCookies(res), "refreshToken")).not.toBe(
      cookieValue(registered, "refreshToken"),
    );
  });

  it("POST /auth/refresh: 200 sets fresh non-expired token cookies", async () => {
    const registered = await registerUser();
    const res = await post("refresh", undefined, toCookies(registered));
    expect(res.statusCode).toBe(200);
    const cookies = setCookies(res);
    const access = cookies.find((c) => c.startsWith("accessToken="))!;
    const refresh = cookies.find((c) => c.startsWith("refreshToken="))!;
    expect(access).not.toMatch(/^accessToken=;/);
    expect(refresh).not.toMatch(/^refreshToken=;/);
    expect(access).toMatch(/Max-Age=900/i);
    expect(refresh).toMatch(/Max-Age=604800/i);
  });

  it("POST /auth/refresh: parallel refreshes with one token all succeed inside the grace window", async () => {
    const registered = await post("register", user);
    const initialToken = registered.json().data.tokens.refreshToken as string;
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => post("refresh", { refreshToken: initialToken })),
    );
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);

    const predecessor = await RefreshToken.findOne({ token: hashToken(initialToken) });
    expect(
      await RefreshToken.countDocuments({ familyId: predecessor!.familyId, isRevoked: false }),
    ).toBe(4);
  });

  it("POST /auth/refresh: 401 and cleared cookies when a rotated cookie is reused after the grace window", async () => {
    const registered = await registerUser();
    await post("refresh", undefined, toCookies(registered));
    await backdateAllRotations();

    const res = await post("refresh", undefined, toCookies(registered));
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/reuse detected/i);
    expectTokenCookiesCleared(setCookies(res));
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("POST /auth/refresh: 401 without a cookie or body clears token cookies", async () => {
    const res = await post("refresh");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      errorType: "AUTHENTICATION_ERROR",
      error_code: 401,
      error_message: "Refresh token not found in request body or cookies!",
    });
    expectTokenCookiesCleared(setCookies(res));
  });

  it("POST /auth/refresh: 401 with an invalid token clears token cookies", async () => {
    const res = await post("refresh", { refreshToken: "completely-invalid-token" });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
    expectTokenCookiesCleared(setCookies(res));
  });

  it("POST /auth/logout: 200 with cookie (SSR client) clears cookies and revokes the session", async () => {
    const registered = await registerUser();
    const res = await post("logout", undefined, toCookies(registered));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, message: "Logged out successfully!" });
    expectTokenCookiesCleared(setCookies(res));
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("POST /auth/logout: 200 with the refresh token in the BODY (Bearer/CSR client)", async () => {
    const registered = await post("register", user);
    const refreshToken = registered.json().data.tokens.refreshToken as string;

    const res = await post("logout", { refreshToken });
    expect(res.statusCode).toBe(200);
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("POST /auth/logout: 200 even without any token", async () => {
    const res = await post("logout");
    expect(res.statusCode).toBe(200);
    expectTokenCookiesCleared(setCookies(res));
  });

  it.each(["refresh", "logout"])(
    "POST /auth/%s: 400 VALIDATION_ERROR when body refreshToken is not a string",
    async (action) => {
      for (const refreshToken of [123, { a: 1 }, null, ["x"]]) {
        const res = await post(action, { refreshToken });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({
          errorType: "VALIDATION_ERROR",
          error_code: 400,
          message: expect.stringContaining("refreshToken"),
        });
      }
    },
  );

  it("POST /auth/refresh: empty body refreshToken falls back to the cookie", async () => {
    const registered = await registerUser();
    const res = await post("refresh", { refreshToken: "" }, toCookies(registered));
    expect(res.statusCode).toBe(200);
  });

  it("POST /auth/logout: empty body refreshToken falls back to the cookie and revokes it", async () => {
    const registered = await registerUser();
    const res = await post("logout", { refreshToken: "" }, toCookies(registered));
    expect(res.statusCode).toBe(200);
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("GET /auth/me: 200 with cookie auth and no password in the payload", async () => {
    const registered = await registerUser();
    const res = await signedRequest({
      method: "GET",
      url: `${API}/auth/me`,
      cookies: toCookies(registered),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user).toMatchObject({ email: user.email });
    expect(res.json().data.user).not.toHaveProperty("password");
  });

  it("GET /auth/me: 200 with a Bearer token", async () => {
    const registered = await post("register", user);
    const res = await signedRequest({
      method: "GET",
      url: `${API}/auth/me`,
      headers: { authorization: `Bearer ${registered.json().data.tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET /auth/me: 401 access token required when signed but unauthenticated", async () => {
    const res = await signedRequest({ method: "GET", url: `${API}/auth/me` });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/access token required/i);
  });

  it("GET /auth/me: 401 without HMAC, even with a valid token", async () => {
    const registered = await post("register", user);
    const res = await app.inject({
      method: "GET",
      url: `${API}/auth/me`,
      headers: { authorization: `Bearer ${registered.json().data.tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/HMAC signature/i);
    expect(res.json().errorType).toBe("HMAC_ERROR");
  });

  it("GET /auth/me: 401 for an HMAC signed over a different path", async () => {
    const res = await signedRequest({
      method: "GET",
      url: `${API}/auth/me`,
      headers: signHeaders("GET", "/health"),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/HMAC verification failed/i);
    expect(res.json().errorType).toBe("HMAC_ERROR");
  });

  describe("HMAC rejections carry errorType HMAC_ERROR, even with a valid session cookie", () => {
    const staleCtime = (): Record<string, string> => {
      // Correctly signed over the stale timestamp, so only freshness fails.
      const ctime = (Date.now() - 10 * 60_000).toString();
      const sig = computeSignature({
        method: "POST",
        contentType: "",
        ctime,
        path: "/auth/refresh",
      });
      return { sig, ctime };
    };

    it.each([
      ["unsigned", () => ({}), /HMAC signature/i],
      ["stale ctime", staleCtime, /HMAC verification failed/i],
      ["bad signature", () => ({ ...signHeaders("POST", "/auth/refresh"), sig: "AAAA" }), /HMAC/i],
    ])("%s", async (_name, headers, message) => {
      const registered = await registerUser();
      for (const cookies of [undefined, toCookies(registered)]) {
        const res = await app.inject({
          method: "POST",
          url: `${API}/auth/refresh`,
          headers: headers(),
          cookies,
        });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ errorType: "HMAC_ERROR", error_code: 401 });
        expect(res.json().message).toMatch(message);
      }
    });
  });
});
