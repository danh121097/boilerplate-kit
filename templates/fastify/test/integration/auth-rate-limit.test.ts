import { buildApp } from "@/app";
import { config } from "@/config/environment";
import { signHeaders } from "../helpers/sign-request";
import { API, createSignedRequest } from "../helpers/signed-request";
import type { FastifyInstance } from "fastify";

/**
 * Limiters are skipped while `config.isTest` is set (checked per request), so these
 * tests flip it off after the app is built.
 */
describe("auth rate limits", () => {
  let app: FastifyInstance;
  let signedRequest: ReturnType<typeof createSignedRequest>;

  beforeEach(async () => {
    // A fresh app per test gives every test fresh in-memory counters.
    app = buildApp({ sockets: false });
    await app.ready();
    signedRequest = createSignedRequest(app);
    config.isTest = false;
  });

  afterEach(async () => {
    config.isTest = true;
    await app.close();
  });

  const post = (path: string, payload?: object) =>
    signedRequest({ method: "POST", url: `${API}/auth/${path}`, payload });

  const tooMany = "Too many requests, please try again later!";

  it("register, refresh and logout share one 30-per-window bucket; the 31st is 429", async () => {
    const actions = ["refresh", "logout", "register"];
    for (let i = 0; i < 30; i++) {
      const res = await post(actions[i % 3], actions[i % 3] === "register" ? {} : undefined);
      expect(res.statusCode).not.toBe(429);
    }
    for (const action of actions) {
      const res = await post(action);
      expect(res.statusCode).toBe(429);
      expect(res.json()).toMatchObject({
        success: false,
        status: "error",
        errorType: "RATE_LIMIT",
        message: tooMany,
        error_code: 429,
      });
    }
  });

  it("login has its own bucket and its own message", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await post("refresh")).statusCode).not.toBe(429);
    }
    expect((await post("refresh")).statusCode).toBe(429);

    for (let i = 0; i < 30; i++) {
      expect((await post("login", {})).statusCode).toBe(400);
    }
    const res = await post("login", {});
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      errorType: "RATE_LIMIT",
      message: "Too many login attempts, please try again later!",
    });
  });

  it("login attempts do not consume the shared bucket", async () => {
    for (let i = 0; i < 30; i++) await post("login", {});
    expect((await post("login", {})).statusCode).toBe(429);
    expect((await post("refresh")).statusCode).not.toBe(429);
  });

  it("applies the global 429 envelope and message to other API routes", async () => {
    // 100 per minute across the API; health is signed and cheap.
    const get = () =>
      app.inject({
        method: "GET",
        url: `${API}/health`,
        headers: signHeaders("GET", "/health"),
      });
    for (let i = 0; i < 100; i++) expect((await get()).statusCode).toBe(200);
    const res = await get();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ errorType: "RATE_LIMIT", message: tooMany });
  });

  it("global limiter counts bad-JWT requests but not signed unknown-route 404s", async () => {
    const badJwt = () =>
      signedRequest({
        method: "GET",
        url: `${API}/auth/me`,
        headers: { authorization: "Bearer not-a-jwt" },
      });
    for (let i = 0; i < 100; i++) expect((await badJwt()).statusCode).toBe(401);
    expect((await badJwt()).statusCode).toBe(429);

    // A fresh app resets the counters; 404s from the not-found handler never reach the limiter.
    await app.close();
    app = buildApp({ sockets: false });
    await app.ready();
    signedRequest = createSignedRequest(app);
    for (let i = 0; i < 101; i++) {
      const res = await signedRequest({ method: "GET", url: `${API}/no-such-route` });
      expect(res.statusCode).toBe(404);
    }
    expect((await signedRequest({ method: "GET", url: `${API}/health` })).statusCode).toBe(200);
  });

  it("auth routes also count against the global 100-per-minute cap", async () => {
    // 3 buckets: 30 register/refresh/logout + 30 login are well under 100, so spend the
    // remainder on health, then confirm an auth call is rejected by the global limiter.
    const health = () =>
      app.inject({ method: "GET", url: `${API}/health`, headers: signHeaders("GET", "/health") });
    for (let i = 0; i < 99; i++) await health();
    expect((await post("refresh")).statusCode).not.toBe(429);
    const res = await post("refresh");
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toBe(tooMany);
  });
});
