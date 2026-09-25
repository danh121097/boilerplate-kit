import { RefreshTokenDocument } from "@/types/auth";
import { Schema, model } from "mongoose";

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    // Unique as defense in depth: each raw token carries a random jti, so a
    // duplicate hash means a bug. Rotation atomicity comes from the per-document
    // findOneAndUpdate claim in auth/service.ts refresh(), not from this index.
    token: { type: String, required: true, unique: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    isRevoked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const RefreshToken = model<RefreshTokenDocument>("RefreshToken", refreshTokenSchema);
