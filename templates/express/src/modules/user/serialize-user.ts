import type { Role, UserDocument } from "@/types/auth";

export interface PublicUser {
  _id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Project user records onto the public API shape; password hashes never cross this boundary. */
export function serializeUser(user: UserDocument): PublicUser {
  return {
    _id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
