/**
 * E2E — AUTH_TOKENS_IN_BODY=false: register/login/refresh keep setting the auth
 * cookies but leave the token fields out of the response body (`tokens: {}`), and refresh still reads
 * the token from the cookie. (The default, true, is exercised by the other specs.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

vi.hoisted(() => {
  process.env.AUTH_TOKENS_IN_BODY = "false";
});

import { INestApplication } from "@nestjs/common";
import { createTestApp } from "../helpers/create-test-app";
import { buildHmacHeaders } from "../helpers/sign-request";

let app: INestApplication;
let req: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await createTestApp();
  req = supertest(app.getHttpServer());
}, 30_000);

afterAll(async () => {
  await app.close();
});

function signedPost(path: string, body: object, cookie?: string) {
  const h = buildHmacHeaders("POST", path, body);
  const request = req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json");
  return (cookie ? request.set("Cookie", cookie) : request).send(body);
}

const cookieNamed = (res: supertest.Response, name: string): string =>
  (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(`${name}=`))!;

describe("AUTH_TOKENS_IN_BODY=false", () => {
  const credentials = { email: "cookie-only@example.com", password: "CookieOnly1!" };

  it("omits tokens from register, login and refresh bodies but still sets the cookies", async () => {
    const register = await signedPost("/auth/register", { ...credentials, name: "Cookie" });
    expect(register.status).toBe(201);
    expect(register.body.data.user).toBeDefined();
    expect(register.body.data.tokens).toEqual({});
    expect(JSON.stringify(register.body)).not.toMatch(/accessToken|refreshToken/);
    expect(cookieNamed(register, "accessToken")).not.toMatch(/^accessToken=;/);

    const login = await signedPost("/auth/login", credentials);
    expect(login.status).toBe(200);
    expect(login.body.data.tokens).toEqual({});
    const refreshCookie = cookieNamed(login, "refreshToken").split(";")[0];
    expect(refreshCookie).not.toBe("refreshToken=");

    const refresh = await signedPost("/auth/refresh", {}, refreshCookie);
    expect(refresh.status).toBe(200);
    expect(refresh.body.success).toBe(true);
    expect(refresh.body.data.tokens).toEqual({});
    expect(JSON.stringify(refresh.body)).not.toMatch(/accessToken|refreshToken/);
    expect(cookieNamed(refresh, "refreshToken").split(";")[0]).not.toBe(refreshCookie);
  });
});
