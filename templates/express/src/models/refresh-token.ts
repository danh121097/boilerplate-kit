import { RefreshTokenDocument } from "@/types/auth";
import { Schema, model } from "mongoose";

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    // Unique as defense in depth: each raw token carries a random jti, so a
    // duplicate hash means a bug. Rotation atomicity comes from the per-document
    // findOneAndUpdate claim in auth/refresh-session.ts refresh(), not from this index.
    token: { type: String, required: true, unique: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    // One per login/register session chain; inherited by rotations. Logout revokes the whole family.
    familyId: { type: String, index: true },
    isRevoked: { type: Boolean, default: false },
    // Set when the token is consumed by a rotation (not by logout); drives the reuse grace window.
    rotatedAt: { type: Date },
  },
  { timestamps: true },
);

export const RefreshToken = model<RefreshTokenDocument>("RefreshToken", refreshTokenSchema);
