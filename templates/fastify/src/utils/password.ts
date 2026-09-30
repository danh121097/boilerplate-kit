import { AppError } from "@/types";
import bcrypt from "bcrypt";

/** bcrypt cost shared by real hashes and the timing-equalizing dummy hash. */
export const BCRYPT_ROUNDS = 12;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;

/** Validate password strength: min 8 chars, uppercase, lowercase, digit, special char */
export function validatePasswordStrength(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError({
      message: "Password must be at least 8 characters!",
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }
  if (!PASSWORD_REGEX.test(password)) {
    throw new AppError({
      message: "Password must contain uppercase, lowercase, number, and special character!",
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }
}

// Computed at module load (async, off the event loop) so the first unknown-user login
// is not slower than later ones.
const dummyHash: Promise<string> = bcrypt.hash("dummy-password-for-timing", BCRYPT_ROUNDS);

/**
 * Spend one bcrypt compare against a fixed dummy hash (same cost as real hashes,
 * computed once at load) so a login for an unknown/inactive user takes as long as a wrong
 * password and does not reveal whether the account exists.
 */
export async function burnDummyPasswordCompare(password: string): Promise<void> {
  await bcrypt.compare(password, await dummyHash);
}
