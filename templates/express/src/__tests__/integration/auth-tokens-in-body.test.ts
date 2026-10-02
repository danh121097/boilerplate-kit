import { signHmac } from "@/__tests__/helpers/hmac-sign";
import { closeServer, listenOnLoopback } from "@/__tests__/helpers/loopback-server";
import { config } from "@/config/environment";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import app from "@/app";
import request from "supertest";

/** AUTH_TOKENS_IN_BODY toggles the body copy of the tokens; the cookies never change. */
describe.each([true, false])("AUTH_TOKENS_IN_BODY=%s", (inBody) => {
  let server: Server;
  const original = config.authTokensInBody;
  const user = { email: "body@test.com", password: "Password1!", name: "Body" };

  beforeAll(async () => {
    server = await listenOnLoopback(app);
  });
  afterAll(async () => {
    await closeServer(server);
  });
  afterEach(() => {
    config.authTokensInBody = original;
  });

  const post = (path: string, body?: Record<string, unknown>) => {
    const url = `/api/v1/auth/${path}`;
    return request(server)
      .post(url)
      .set(signHmac("POST", url, body))
      .send(body);
  };

  const cookieValue = (res: request.Response, name: string): string => {
    const cookies = res.headers["set-cookie"] as unknown as string[];
    return cookies
      .find((c) => c.startsWith(`${name}=`))!
      .split(";")[0]
      .slice(name.length + 1);
  };

  const expectTokens = (tokens: Record<string, unknown> | undefined): void => {
    if (inBody) {
      expect(tokens).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    } else {
      expect(tokens).toEqual({});
    }
  };

  it("register, login and refresh follow the flag in the body and always set cookies", async () => {
    config.authTokensInBody = inBody;

    const registered = await post("register", user);
    expect(registered.status).toBe(201);
    expectTokens(registered.body.data.tokens);
    expect(registered.body.data.user.email).toBe(user.email);
    expect(cookieValue(registered, "accessToken")).toBeTruthy();
    expect(cookieValue(registered, "refreshToken")).toBeTruthy();

    const loggedIn = await post("login", { email: user.email, password: user.password });
    expect(loggedIn.status).toBe(200);
    expectTokens(loggedIn.body.data.tokens);
    expect(cookieValue(loggedIn, "accessToken")).toBeTruthy();
    expect(cookieValue(loggedIn, "refreshToken")).toBeTruthy();

    // Refresh still reads the token from the body...
    const viaBody = await post("refresh", { refreshToken: cookieValue(loggedIn, "refreshToken") });
    expect(viaBody.status).toBe(200);
    expectTokens(viaBody.body.data.tokens);
    expect(cookieValue(viaBody, "refreshToken")).toBeTruthy();

    // ...or from the cookie.
    const url = "/api/v1/auth/refresh";
    const viaCookie = await request(server)
      .post(url)
      .set(signHmac("POST", url))
      .set("Cookie", `refreshToken=${cookieValue(viaBody, "refreshToken")}`);
    expect(viaCookie.status).toBe(200);
    expectTokens(viaCookie.body.data.tokens);
    expect(cookieValue(viaCookie, "accessToken")).toBeTruthy();
  });
});
