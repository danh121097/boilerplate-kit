import { buildApp } from "@/app";
import { RefreshToken } from "@/models/refresh-token";
import { User } from "@/models/user";
import { getIO } from "@/socket";
import { hashToken, signAccessToken } from "@/utils/jwt";
import { signHeaders } from "./helpers/sign-request";
import type { FastifyInstance, InjectOptions } from "fastify";

const API = "/api/v1";
let app: FastifyInstance;

async function signedRequest(
  options: Omit<InjectOptions, "headers"> & { headers?: Record<string, string> },
) {
  const url = options.url as string;
  const path = url.slice(API.length).split("?", 1)[0];
  const headers = {
    ...signHeaders(options.method as string, path, options.payload),
    ...options.headers,
  };
  return app.inject({ ...options, headers });
}

async function register(email: string) {
  return signedRequest({
    method: "POST",
    url: `${API}/auth/register`,
    payload: { email, password: "StrongPass1!", name: "Fastify User" },
  });
}

describe("Fastify HTTP contract", () => {
  beforeAll(async () => {
    app = buildApp({ sockets: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires HMAC for health and returns the shared health contract", async () => {
    const unsigned = await app.inject({ method: "GET", url: `${API}/health` });
    expect(unsigned.statusCode).toBe(401);
    expect(unsigned.json()).toMatchObject({
      success: false,
      status: "error",
      errorType: "AUTHENTICATION_ERROR",
      error_code: 401,
    });

    const response = await signedRequest({ method: "GET", url: `${API}/health` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      database: "connected",
      redis: "disabled",
    });
  });

  it("validates registration and never returns a password hash", async () => {
    const invalid = await signedRequest({
      method: "POST",
      url: `${API}/auth/register`,
      payload: { email: "bad-email", password: "short", name: "   " },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      success: false,
      status: "error",
      errorType: "VALIDATION_ERROR",
      error_code: 400,
      error_message: expect.any(String),
    });

    const response = await register("fastify@example.com");
    expect(response.statusCode).toBe(201);
    expect(response.json().data.user).not.toHaveProperty("password");
    expect(response.json().data.user.email).toBe("fastify@example.com");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("accessToken="),
        expect.stringContaining("refreshToken="),
      ]),
    );
    expect(response.headers["set-cookie"]?.toString()).toContain("HttpOnly");
  });

  it("authenticates /me and rejects an unsigned request before JWT checks", async () => {
    const registered = await register("me@example.com");
    const accessToken = registered.json().data.tokens.accessToken as string;
    const unsigned = await app.inject({
      method: "GET",
      url: `${API}/auth/me`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(unsigned.statusCode).toBe(401);
    expect(unsigned.json().message).toMatch(/HMAC signature/i);

    const unauthorized = await signedRequest({ method: "GET", url: `${API}/auth/me` });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json().message).toMatch(/access token required/i);

    const response = await signedRequest({
      method: "GET",
      url: `${API}/auth/me`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.user.email).toBe("me@example.com");
    expect(response.json().data.user).not.toHaveProperty("password");
  });

  it("logs in with the registered credentials and issues a fresh token pair", async () => {
    await register("login@example.com");
    const response = await signedRequest({
      method: "POST",
      url: `${API}/auth/login`,
      payload: { email: "LOGIN@example.com", password: "StrongPass1!" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, message: "Login successful!" });
    expect(response.json().data.tokens.accessToken).toEqual(expect.any(String));
    expect(response.json().data.tokens.refreshToken).toEqual(expect.any(String));
  });

  it("protects list and get-user routes with admin RBAC and paginates results", async () => {
    const regular = await register("regular@example.com");
    const userToken = regular.json().data.tokens.accessToken as string;
    const forbidden = await signedRequest({
      method: "GET",
      url: `${API}/users`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().errorType).toBe("AUTHORIZATION_ERROR");

    const admin = await User.create({
      email: "admin@example.com",
      password: "StrongPass1!",
      name: "Admin",
      role: "admin",
    });
    const adminToken = signAccessToken({
      userId: String(admin._id),
      email: admin.email,
      role: "admin",
    });
    const listed = await signedRequest({
      method: "GET",
      url: `${API}/users?page=1&limit=1`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toHaveLength(1);
    expect(listed.json().meta).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
      hasNext: true,
    });
    expect(listed.json().data[0]).not.toHaveProperty("password");

    const fetched = await signedRequest({
      method: "GET",
      url: `${API}/users/${admin.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data.email).toBe("admin@example.com");
  });

  it("rotates refresh tokens atomically and grants concurrent retries a 10-second grace", async () => {
    const registered = await register("refresh@example.com");
    const initialToken = registered.json().data.tokens.refreshToken as string;
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        signedRequest({
          method: "POST",
          url: `${API}/auth/refresh`,
          payload: { refreshToken: initialToken },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200]);
    const predecessor = await RefreshToken.findOne({ token: hashToken(initialToken) });
    const active = await RefreshToken.countDocuments({
      familyId: predecessor!.familyId,
      isRevoked: false,
    });
    expect(active).toBe(4);
  });

  it("revokes a refresh-token family when a rotated token is replayed after the grace window", async () => {
    const registered = await register("reuse@example.com");
    const initialToken = registered.json().data.tokens.refreshToken as string;
    const rotated = await signedRequest({
      method: "POST",
      url: `${API}/auth/refresh`,
      payload: { refreshToken: initialToken },
    });
    expect(rotated.statusCode).toBe(200);

    await RefreshToken.updateOne(
      { token: hashToken(initialToken) },
      { $set: { rotatedAt: new Date(Date.now() - 11_000) } },
    );
    const replay = await signedRequest({
      method: "POST",
      url: `${API}/auth/refresh`,
      payload: { refreshToken: initialToken },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().message).toMatch(/reuse detected/i);
    expect(await RefreshToken.countDocuments({ isRevoked: false })).toBe(0);
  });

  it("exposes the generated OpenAPI document without weakening API HMAC checks", async () => {
    const docs = await app.inject({ method: "GET", url: "/docs/json" });
    expect(docs.statusCode).toBe(200);
    const spec = docs.json();
    expect(spec.security).toBeUndefined();
    expect(spec.paths[`${API}/auth/me`].get.responses["401"].description).toBe(
      "A valid access token is required",
    );
    expect(spec.paths[`${API}/auth/me`].get.responses["401"].content).toBeUndefined();
    expect(spec.paths[`${API}/auth/refresh`].post.requestBody.required).toBe(false);
    expect(spec.paths[`${API}/auth/register`].post.requestBody.required).toBe(true);
    expect(spec.components.securitySchemes).toEqual({
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    });
    expect(spec.paths[`${API}/auth/register`].post.security).toBeUndefined();
    expect(spec.paths[`${API}/auth/me`].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths[`${API}/users/`].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths[`${API}/users/{id}`].get.security).toEqual([{ bearerAuth: [] }]);
    expect((await app.inject({ method: "GET", url: "/docs/hmac-config" })).statusCode).toBe(404);

    const unsigned = await app.inject({ method: "GET", url: `${API}/health` });
    expect(unsigned.statusCode).toBe(401);

    const missing = await signedRequest({ method: "GET", url: `${API}/does-not-exist` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ status: "error", errorType: "NOT_FOUND" });
  });

  it("attaches Socket.IO to Fastify's HTTP server and closes it with the app", async () => {
    const socketApp = buildApp();
    await socketApp.ready();
    expect(getIO()?.httpServer).toBe(socketApp.server);

    await socketApp.close();
    expect(getIO()).toBeNull();
  });
});
