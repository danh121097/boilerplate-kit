import { authContract } from "./auth/contract";
import { usersContract } from "./users/contract";

/**
 * Central registry of React Query / mutation keys, aggregated from each module's
 * contract (the source of truth). Keys stay distinct to avoid cache collisions.
 */
export const queryKeys = {
  users: usersContract.keys,
  auth: authContract.keys,
} as const;
