import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

/** Mongoose document type for a refresh token record. */
export interface RefreshTokenDocument extends HydratedDocument<RefreshToken> {
  _id: Types.ObjectId;
}

/**
 * RefreshToken schema — ported from express models/refresh-token.ts.
 * `token` stores the SHA-256 hash of the raw refresh token, never the raw token.
 * `expiresAt` carries a TTL index ({expires:0}) so MongoDB auto-deletes expired docs.
 * `token` is unique as defense in depth: each raw token carries a random jti, so
 * a duplicate hash means a bug. Rotation atomicity comes from the per-document
 * findOneAndUpdate claim in AuthService.refresh, not from this index.
 * `userId` is indexed for fast per-user lookup during rotation / revocation.
 */
@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: String, required: true, unique: true })
  token!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;

  /** Device session chain: new on register/login, inherited by rotations; logout revokes the chain. Absent on legacy tokens. */
  @Prop({ type: String, index: true })
  familyId?: string;

  @Prop({ type: Boolean, default: false })
  isRevoked!: boolean;

  /** Set when the token is consumed by a rotation (not by logout); drives the reuse grace window. */
  @Prop({ type: Date })
  rotatedAt?: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
