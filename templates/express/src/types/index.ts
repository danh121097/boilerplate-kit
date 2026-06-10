/** Error types for frontend handling */
export type ErrorType =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "INTERNAL_ERROR";

interface AppErrorParams {
  message: string;
  statusCode?: number;
  errorType?: ErrorType;
}

/** Custom error class with HTTP status code and error type */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorType: ErrorType;

  constructor({ message, statusCode = 500, errorType = "INTERNAL_ERROR" }: AppErrorParams) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** Typed environment configuration */
export interface EnvironmentConfig {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  nodeEnv: string;
  mongodbUri: string;
  jwtAccessPrivateKey: string;
  jwtAccessPublicKey: string;
  jwtRefreshSecret: string;
  jwtAccessExpiry: string;
  jwtRefreshExpiry: string;
  hmacSecret: string;
  /** Allowed browser origins for CORS + the CSRF guard (hard-coded in config). */
  corsOrigins: string[];
  /** Enable the Origin-allow-list CSRF guard on mutating methods (default off). */
  enableCsrf: boolean;
  /** Cookie `Domain` attribute; unset = host-only (same-origin proxy deploy). */
  cookieDomain?: string;
  apiPrefix: string;
  redisEnabled: boolean;
  redisUrl: string;
}
