/** Domain types for the Users service. */

/** Backend user role (mirrors the express `Role`). */
export type Role = "user" | "admin" | "super_admin";

/** A user as the backend returns it (password stripped) — the express `PublicUser`. */
export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
