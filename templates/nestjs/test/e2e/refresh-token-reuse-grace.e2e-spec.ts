/**
 * E2E — refresh reuse grace window.
 *
 * A rotated refresh token replayed within REFRESH_REUSE_GRACE_MS is a benign
 * retry/race: the caller gets a fresh pair and no session is revoked. Outside the
 * window, or for a token revoked by logout, replay is reuse: every refresh token
 * of the user is revoked. A family revoke clears rotatedAt so a later replay of a
 * recently rotated token cannot resurrect the family.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { REFRESH_REUSE_GRACE_MS } from "@/modules/auth/refresh-session.service";
import { INestApplication } from "@nestjs/common";
import { createTestApp } from "../helpers/create-test-app";
import {
  backdateRotation,
  countActiveInFamily,
  findStoredToken,
} from "../helpers/refresh-token-db";
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

function signedPost(path: string, body: object) {
  const h = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

let userCount = 0;

/** Register a fresh user (the DB is shared across tests) and return the initial refresh token. */
async function startSession(): Promise<string> {
  const res = await signedPost("/auth/register", {
    email: `grace-${++userCount}@example.com`,
    password: "GraceTest1!",
    name: "Grace User",
  });
  expect(res.status).toBe(201);
  return res.body.data.tokens.refreshToken as string;
}

const tokenOf = (res: supertest.Response): string => res.body.data.tokens.refreshToken as string;

describe("Refresh reuse grace window", () => {
  it("a sequential retry of a rotated token inside the window succeeds and the first successor still refreshes", async () => {
    const r1 = await startSession();
    const first = await signedPost("/auth/refresh", { refreshToken: r1 });
    expect(first.status).toBe(200);

    const retry = await signedPost("/auth/refresh", { refreshToken: r1 });
    expect(retry.status).toBe(200);
    expect(retry.body.data.tokens.accessToken).toBeTypeOf("string");
    expect(retry.headers["set-cookie"]).toBeDefined();

    const successor = await signedPost("/auth/refresh", { refreshToken: tokenOf(first) });
    expect(successor.status).toBe(200);
  });

  it("reuse after the window is rejected and revokes every token of the user", async () => {
    const r1 = await startSession();
    const rotated = await signedPost("/auth/refresh", { refreshToken: r1 });
    expect(rotated.status).toBe(200);

    await backdateRotation(app, r1, REFRESH_REUSE_GRACE_MS + 1_000);

    const replay = await signedPost("/auth/refresh", { refreshToken: r1 });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/reuse detected/i);
    expect(await countActiveInFamily(app, r1)).toBe(0);

    const successor = await signedPost("/auth/refresh", { refreshToken: tokenOf(rotated) });
    expect(successor.status).toBe(401);
  });

  it("after a family revoke, replaying a recently rotated token is rejected (no resurrection)", async () => {
    const r1 = await startSession();
    const r2 = tokenOf(await signedPost("/auth/refresh", { refreshToken: r1 }));
    const r3 = tokenOf(await signedPost("/auth/refresh", { refreshToken: r2 }));

    // r1 replayed after the window nukes the family, including the freshly rotated r2.
    await backdateRotation(app, r1, REFRESH_REUSE_GRACE_MS + 1_000);
    expect((await signedPost("/auth/refresh", { refreshToken: r1 })).status).toBe(401);
    expect((await findStoredToken(app, r2))?.rotatedAt).toBeUndefined();

    // r2 was rotated moments ago, but the nuke cleared its grace.
    expect((await signedPost("/auth/refresh", { refreshToken: r2 })).status).toBe(401);
    expect((await signedPost("/auth/refresh", { refreshToken: r3 })).status).toBe(401);
    expect(await countActiveInFamily(app, r1)).toBe(0);
  });

  it("a token revoked by logout is reuse, not a graced retry", async () => {
    const r1 = await startSession();
    expect((await signedPost("/auth/logout", { refreshToken: r1 })).status).toBe(200);
    expect((await findStoredToken(app, r1))?.rotatedAt).toBeUndefined();

    const replay = await signedPost("/auth/refresh", { refreshToken: r1 });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/reuse detected/i);
  });

  it("logout ends the whole chain: a graced predecessor cannot resurrect it, other devices stay logged in", async () => {
    const email = "chain@example.com";
    const password = "ChainTest1!";
    await signedPost("/auth/register", { email, password, name: "Chain" });
    const loginA = await signedPost("/auth/login", { email, password });
    const a = tokenOf(loginA);
    const b = tokenOf(await signedPost("/auth/refresh", { refreshToken: a }));

    expect((await signedPost("/auth/logout", { refreshToken: b })).status).toBe(200);

    // A was rotated moments ago but logout revoked its family and cleared rotatedAt.
    const replay = await signedPost("/auth/refresh", { refreshToken: a });
    expect(replay.status).toBe(401);
    expect((await findStoredToken(app, a))?.rotatedAt).toBeUndefined();
  });

  it("logout leaves another family refreshable", async () => {
    const email = "chain-other@example.com";
    const password = "ChainTest1!";
    await signedPost("/auth/register", { email, password, name: "Chain" });
    const a = tokenOf(await signedPost("/auth/login", { email, password }));
    const other = tokenOf(await signedPost("/auth/login", { email, password }));

    expect((await signedPost("/auth/logout", { refreshToken: a })).status).toBe(200);
    expect((await signedPost("/auth/refresh", { refreshToken: other })).status).toBe(200);
  });

  it("rotation and graced re-issue inherit the familyId; each login starts a new one", async () => {
    const r1 = await startSession();
    const r2 = tokenOf(await signedPost("/auth/refresh", { refreshToken: r1 }));
    const graced = tokenOf(await signedPost("/auth/refresh", { refreshToken: r1 }));
    const ids = await Promise.all(
      [r1, r2, graced].map(async (t) => (await findStoredToken(app, t))?.familyId),
    );
    expect(ids[0]).toBeTypeOf("string");
    expect(new Set(ids).size).toBe(1);

    const other = tokenOf(
      await signedPost("/auth/register", {
        email: "fam-other@example.com",
        password: "GraceTest1!",
        name: "Other",
      }),
    );
    expect((await findStoredToken(app, other))?.familyId).not.toBe(ids[0]);
  });
});
