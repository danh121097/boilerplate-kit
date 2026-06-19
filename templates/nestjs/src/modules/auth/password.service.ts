import { AppException } from "@/common/exceptions/app.exception";
import { Injectable } from "@nestjs/common";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;

/**
 * Password utilities — ported from express utils/password.ts.
 * validatePasswordStrength throws AppException 400 (VALIDATION_ERROR) on failure,
 * matching the express AppError shape exactly.
 */
@Injectable()
export class PasswordService {
  /**
   * Validate password strength: min 8 chars, uppercase, lowercase, digit, special char.
   * Throws AppException with statusCode 400 and errorType VALIDATION_ERROR on failure.
   */
  validatePasswordStrength(password: string): void {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new AppException({
        message: "Password must be at least 8 characters!",
        statusCode: 400,
        errorType: "VALIDATION_ERROR",
      });
    }
    if (!PASSWORD_REGEX.test(password)) {
      throw new AppException({
        message: "Password must contain uppercase, lowercase, number, and special character!",
        statusCode: 400,
        errorType: "VALIDATION_ERROR",
      });
    }
  }
}
