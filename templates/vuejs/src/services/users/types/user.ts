/** Domain types for the Users service. */

/** The backend's role union (`ROLES` in the express `types/auth.ts`). */
export type Role = "user" | "admin" | "super_admin";

/** A user as the backend returns it (password stripped). */
export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
