/**
 * E2E — a family revoke racing a rotation must never leave a live token.
 *
 * The successor N is inserted first, then the predecessor P is re-read; a revoke
 * that removed P's rotatedAt before that re-read makes the refresh revoke N and
 * fail. The interleavings are forced deterministically by hooking the insert
 * step (`create`) and the re-read (`findById`) of the RefreshToken model.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AppException } from "@/common/exceptions/app.exception";
import { RefreshSessionService } from "@/modules/auth/refresh-session.service";
import { RefreshToken, RefreshTokenDocument } from "@/schemas/refresh-token.schema";
import { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import supertest from "supertest";
import { createTestApp } from "../helpers/create-test-app";
import { countActiveInFamily } from "../helpers/refresh-token-db";
import { buildHmacHeaders } from "../helpers/sign-request";

let app: INestApplication;
let sessions: RefreshSessionService;
let model: Model<RefreshTokenDocument>;

beforeAll(async () => {
  app = await createTestApp();
  sessions = app.get(RefreshSessionService);
  model = app.get<Model<RefreshTokenDocument>>(getModelToken(RefreshToken.name));
}, 30_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

let userCount = 0;

/** Register a fresh user and return the initial refresh token A. */
async function startSession(): Promise<string> {
  const body = {
    email: `race-${++userCount}@example.com`,
    password: "RaceTest1!",
    name: "Race",
  };
  const h = buildHmacHeaders("POST", "/auth/register", body);
  const res = await supertest(app.getHttpServer())
    .post("/api/v1/auth/register")
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
  expect(res.status).toBe(201);
  return res.body.data.tokens.refreshToken as string;
}

/** Run `hook` right before the model's insert (a revoke landing before N exists). */
function hookBeforeInsert(hook: () => Promise<void>): void {
  const original = model.create.bind(model) as (...args: unknown[]) => Promise<unknown>;
  vi.spyOn(model, "create").mockImplementationOnce((async (...args: unknown[]) => {
    await hook();
    return original(...args);
  }) as never);
}

/** Run `hook` right after the predecessor re-read (a revoke landing after the check). */
function hookAfterReRead(hook: () => Promise<void>): void {
  const original = model.findById.bind(model);
  vi.spyOn(model, "findById").mockImplementationOnce(((...args: Parameters<typeof original>) => ({
    select: async (fields: string) => {
      const result = await original(...args).select(fields);
      await hook();
      return result;
    },
  })) as never);
}

const expectRefused = (promise: Promise<unknown>) =>
  expect(promise).rejects.toSatisfy(
    (err: unknown) => err instanceof AppException && err.getStatus() === 401,
  );

describe("revoke racing a rotation", () => {
  it("normal rotation: a logout landing before N's insert revokes N and refuses", async () => {
    const a = await startSession();
    hookBeforeInsert(() => sessions.logout(a));

    await expectRefused(sessions.refresh(a));
    expect(await countActiveInFamily(app, a)).toBe(0);
  });

  it("graced re-issue: a logout landing before N's insert revokes N and refuses", async () => {
    const a = await startSession();
    await sessions.refresh(a); // A rotated to B; a retry of A is now graced
    hookBeforeInsert(() => sessions.logout(a));

    await expectRefused(sessions.refresh(a));
    expect(await countActiveInFamily(app, a)).toBe(0);
  });

  it("a revoke after N's insert and the re-read still covers N", async () => {
    const a = await startSession();
    hookAfterReRead(() => sessions.logout(a));

    const tokens = await sessions.refresh(a);
    expect(await countActiveInFamily(app, a)).toBe(0);
    await expectRefused(sessions.refresh(tokens.refreshToken));
  });
});
