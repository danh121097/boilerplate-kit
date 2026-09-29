import { SetMetadata } from "@nestjs/common";

/** Metadata key read by SecurityGuard to skip authentication on public routes. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Mark a controller or route handler as publicly accessible.
 * SecurityGuard checks this metadata via Reflector and skips token verification.
 * Mirrors the express pattern where unauthenticated routes simply omit the auth middleware.
 */
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
