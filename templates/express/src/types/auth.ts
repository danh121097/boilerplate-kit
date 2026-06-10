import { Document, Types } from "mongoose";

/** Single source of truth for user roles — used by the User model enum and the Role type */
export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

/** User role — derived from ROLES values */
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** User document interface */
export interface UserDocument extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/** Refresh token document interface */
export interface RefreshTokenDocument extends Document {
  token: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  isRevoked: boolean;
}

/** JWT access token payload */
export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

/** Token pair returned to client */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
