/**
 * Direct DB helpers for refresh-token e2e specs. Backdating `rotatedAt` stands in
 * for waiting out REFRESH_REUSE_GRACE_MS.
 */
import { RefreshToken, RefreshTokenDocument } from "@/schemas/refresh-token.schema";
import { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import crypto from "crypto";
import type { Model } from "mongoose";

function refreshTokenModel(app: INestApplication): Model<RefreshTokenDocument> {
  return app.get<Model<RefreshTokenDocument>>(getModelToken(RefreshToken.name));
}

const hash = (raw: string): string => crypto.createHash("sha256").update(raw).digest("hex");

/** Move the token's rotation time `ageMs` into the past. */
export async function backdateRotation(
  app: INestApplication,
  rawToken: string,
  ageMs: number,
): Promise<void> {
  await refreshTokenModel(app).updateOne(
    { token: hash(rawToken) },
    { rotatedAt: new Date(Date.now() - ageMs) },
  );
}

/** Stored record for a raw token (null when absent). */
export function findStoredToken(app: INestApplication, rawToken: string) {
  return refreshTokenModel(app).findOne({ token: hash(rawToken) });
}

/** Number of still-usable refresh tokens belonging to the owner of `rawToken`. */
export async function countActiveInFamily(
  app: INestApplication,
  rawToken: string,
): Promise<number> {
  const stored = await findStoredToken(app, rawToken);
  if (!stored) return 0;
  return refreshTokenModel(app).countDocuments({ userId: stored.userId, isRevoked: false });
}
