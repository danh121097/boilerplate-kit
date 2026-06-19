/**
 * Auth types — ported from express types/auth.ts.
 * ROLES rank map is the single source of truth for role ordering used by RolesGuard.
 */

/** Single source of truth for user roles — used by the User schema enum and the Role type. */
export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

/** Numeric rank per role — higher = more privileged. Used by RolesGuard min-role check. */
export const ROLE_RANK: Record<Role, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

/** User role — derived from ROLES values. */
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** JWT access token payload embedded in every signed access token. */
export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

/** Token pair returned to the client on login / refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
