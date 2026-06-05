import { RefreshTokenDocument } from '@/types/auth';
import { Schema, model } from 'mongoose';

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    token: { type: String, required: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    isRevoked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const RefreshToken = model<RefreshTokenDocument>(
  'RefreshToken',
  refreshTokenSchema
);
