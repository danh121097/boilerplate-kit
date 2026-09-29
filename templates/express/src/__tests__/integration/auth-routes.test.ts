import { signHmac } from "@/__tests__/helpers/hmac-sign";
import { RefreshToken } from "@/models/refresh-token";
import { describe, it, expect } from "vitest";
import app from "@/app";
import request from "supertest";

describe("Auth Routes", () => {
  const user = {
    email: "route@test.com",
    password: "Password1!",
    name: "Route",
  };

  /** Collapse a Set-Cookie array into a single Cookie request header */
  const toCookieHeader = (setCookie: string[]): string =>
    setCookie.map((c) => c.split(";")[0]).join("; ");

  /** Extract a single cookie's name=value pair from a Set-Cookie array */
  const cookieValue = (setCookie: string[], name: string): string | undefined =>
    setCookie.find((c) => c.startsWith(`${name}=`))?.split(";")[0];

  /** Assert both token cookies are expired; refreshToken keeps its auth-route path */
  const expectTokenCookiesCleared = (setCookie: string[] | undefined): void => {
    expect(setCookie).toBeDefined();
    const access = setCookie!.find((c) => c.startsWith("accessToken="));
    const refreshC = setCookie!.find((c) => c.startsWith("refreshToken="));
    expect(access).toMatch(/^accessToken=;/);
    expect(access).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(access).toMatch(/Path=\/(;|$)/);
    expect(refreshC).toMatch(/^refreshToken=;/);
    expect(refreshC).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(refreshC).toMatch(/Path=\/api\/v1\/auth(;|$)/);
  };

  /** Move every rotation timestamp past the reuse grace window. */
  const backdateAllRotations = async (): Promise<void> => {
    await RefreshToken.updateMany(
      { rotatedAt: { $exists: true } },
      { rotatedAt: new Date(Date.now() - 60_000) },
    );
  };

  /** Register a fresh user and return its Set-Cookie array */
  const registerUser = async (): Promise<string[]> => {
    const url = "/api/v1/auth/register";
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, user))
      .send(user);
    return res.headers["set-cookie"] as unknown as string[];
  };

  it("POST /api/v1/auth/register — 201 sets token cookies", async () => {
    const url = "/api/v1/auth/register";
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, user))
      .send(user);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookieValue(cookies, "accessToken")).toBeDefined();
    expect(cookieValue(cookies, "refreshToken")).toBeDefined();
  });

  it("POST /api/v1/auth/register — 409 duplicate email", async () => {
    const url = "/api/v1/auth/register";
    await request(app)
      .post(url)
      .set(signHmac("POST", url, user))
      .send(user);
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, user))
      .send(user);
    expect(res.status).toBe(409);
  });

  it("POST /api/v1/auth/register — 400 validation error", async () => {
    const url = "/api/v1/auth/register";
    const body = { email: "bad" };
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, body))
      .send(body);
    expect(res.status).toBe(400);
  });

  it("POST /api/v1/auth/login — 200 sets token cookies", async () => {
    await registerUser();
    const url = "/api/v1/auth/login";
    const body = { email: user.email, password: user.password };
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeDefined();
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookieValue(cookies, "accessToken")).toBeDefined();
  });

  it("POST /api/v1/auth/login — 401 wrong password", async () => {
    await registerUser();
    const url = "/api/v1/auth/login";
    const body = { email: user.email, password: "WrongPass1!" };
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, body))
      .send(body);
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/refresh — 200 rotates token cookie", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/refresh";
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    expect(res.status).toBe(200);
    const newCookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookieValue(newCookies, "refreshToken")).not.toBe(
      cookieValue(regCookies, "refreshToken"),
    );
  });

  it("POST /api/v1/auth/refresh — 401 when reusing a rotated cookie after the grace window", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/refresh";
    // First refresh rotates (revokes) the original token
    await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    await backdateAllRotations();
    // Reusing the now-revoked original cookie must be rejected
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/refresh — parallel refreshes with one token all succeed within the grace window", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/refresh";
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(url).set(signHmac("POST", url)).set("Cookie", toCookieHeader(regCookies)),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it("POST /api/v1/auth/refresh — 401 without cookie", async () => {
    const url = "/api/v1/auth/refresh";
    const res = await request(app).post(url).set(signHmac("POST", url));
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      errorType: "AUTHENTICATION_ERROR",
      error_code: 401,
      error_message: "Refresh token not found in request body or cookies!",
    });
    expectTokenCookiesCleared(res.headers["set-cookie"] as unknown as string[]);
  });

  it("POST /api/v1/auth/refresh — 401 with invalid token clears token cookies", async () => {
    const url = "/api/v1/auth/refresh";
    const body = { refreshToken: "completely-invalid-token" };
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, body))
      .send(body);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expectTokenCookiesCleared(res.headers["set-cookie"] as unknown as string[]);
  });

  it("POST /api/v1/auth/refresh — 401 with reused token clears token cookies", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/refresh";
    await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    await backdateAllRotations();
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    expect(res.status).toBe(401);
    expectTokenCookiesCleared(res.headers["set-cookie"] as unknown as string[]);
  });

  it("POST /api/v1/auth/refresh — 200 sets fresh non-expired token cookies", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/refresh";
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const access = cookies.find((c) => c.startsWith("accessToken="))!;
    const refreshC = cookies.find((c) => c.startsWith("refreshToken="))!;
    expect(access).not.toMatch(/^accessToken=;/);
    expect(refreshC).not.toMatch(/^refreshToken=;/);
    expect(access).toMatch(/Max-Age=900/i);
    expect(refreshC).toMatch(/Max-Age=604800/i);
  });

  it("POST /api/v1/auth/logout — 200 (cookie / SSR client)", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/logout";
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    expect(res.status).toBe(200);
  });

  it("POST /api/v1/auth/logout — 200 with refresh token in BODY (Bearer/CSR client)", async () => {
    // CSR clients hold the refresh token in localStorage and send it in the body
    // (no cookie). Logout must still revoke it — dual-mode, like refresh.
    const url = "/api/v1/auth/register";
    const reg = await request(app)
      .post(url)
      .set(signHmac("POST", url, user))
      .send(user);
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const logoutUrl = "/api/v1/auth/logout";
    const body = { refreshToken };
    const res = await request(app)
      .post(logoutUrl)
      .set(signHmac("POST", logoutUrl, body))
      .send(body); // body only, NO cookie
    expect(res.status).toBe(200);
  });

  it.each(["refresh", "logout"])(
    "POST /api/v1/auth/%s — 400 VALIDATION_ERROR when body refreshToken is not a string",
    async (action) => {
      const url = `/api/v1/auth/${action}`;
      for (const refreshToken of [123, { a: 1 }, null, ["x"]]) {
        const body = { refreshToken };
        const res = await request(app)
          .post(url)
          .set(signHmac("POST", url, body))
          .send(body);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
          errorType: "VALIDATION_ERROR",
          error_code: 400,
          message: expect.stringContaining("refreshToken"),
        });
      }
    },
  );

  it("POST /api/v1/auth/refresh — empty body refreshToken falls back to the cookie", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/refresh";
    const body = { refreshToken: "" };
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, body))
      .set("Cookie", toCookieHeader(regCookies))
      .send(body);
    expect(res.status).toBe(200);
  });

  it("POST /api/v1/auth/logout — empty body refreshToken falls back to the cookie and revokes it", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/logout";
    const body = { refreshToken: "" };
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url, body))
      .set("Cookie", toCookieHeader(regCookies))
      .send(body);
    expect(res.status).toBe(200);
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("GET /api/v1/auth/me — 200 with cookie auth", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/me";
    const res = await request(app)
      .get(url)
      .set(signHmac("GET", url))
      .set("Cookie", toCookieHeader(regCookies));
    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeDefined();
  });

  it("GET /api/v1/auth/me — 401 without hmac", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });
});
