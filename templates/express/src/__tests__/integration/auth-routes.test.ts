import { signHmac } from "@/__tests__/helpers/hmac-sign";
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

  it("POST /api/v1/auth/refresh — 401 when reusing a rotated cookie", async () => {
    const regCookies = await registerUser();
    const url = "/api/v1/auth/refresh";
    // First refresh rotates (revokes) the original token
    await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    // Reusing the now-revoked original cookie must be rejected
    const res = await request(app)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", toCookieHeader(regCookies));
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/refresh — 401 without cookie", async () => {
    const url = "/api/v1/auth/refresh";
    const res = await request(app).post(url).set(signHmac("POST", url));
    expect(res.status).toBe(401);
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
