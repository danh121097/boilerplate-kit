import { Role } from "@/common/types/auth.types";
import { SetMetadata } from "@nestjs/common";

/** Metadata key read by RolesGuard to enforce minimum role rank. */
export const ROLES_KEY = "roles";

/**
 * Declare the minimum Role required to access a route.
 * RolesGuard reads this via Reflector and compares ROLE_RANK[user.role] >= ROLE_RANK[min].
 * Mirrors express middleware/role.ts requireMinRole behavior exactly.
 *
 * @param min - Minimum role required (inclusive). Users with equal or higher rank pass.
 */
export const Roles = (min: Role): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, min);
