/** Domain types for the Users service. */

/** User role — mirrors the backend `Role` union. */
export type Role = "user" | "admin" | "super_admin";

/** A user as the backend returns it (`PublicUser`: password stripped). */
export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
