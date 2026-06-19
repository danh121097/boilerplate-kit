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
 * `userId` is indexed for fast per-user lookup during rotation / revocation.
 */
@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: String, required: true, index: true })
  token!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;

  @Prop({ type: Boolean, default: false })
  isRevoked!: boolean;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
