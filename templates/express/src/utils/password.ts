import { AppError } from '@/types';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;

/** Validate password strength: min 8 chars, uppercase, lowercase, digit, special char */
export function validatePasswordStrength(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError({
      message: 'Password must be at least 8 characters!',
      statusCode: 400,
      errorType: 'VALIDATION_ERROR'
    });
  }
  if (!PASSWORD_REGEX.test(password)) {
    throw new AppError({
      message:
        'Password must contain uppercase, lowercase, number, and special character!',
      statusCode: 400,
      errorType: 'VALIDATION_ERROR'
    });
  }
}
