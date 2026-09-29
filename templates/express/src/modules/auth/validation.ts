import { AppError } from "@/types";
import { NextFunction, Request, Response } from "express";
import { z } from "zod";

/** Generic Zod validation middleware factory */
export function validate(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join(", ");
      throw new AppError({
        message,
        statusCode: 400,
        errorType: "VALIDATION_ERROR",
      });
    }
    req.body = result.data;
    next();
  };
}

export const registerSchema = z.object({
  email: z.email("Invalid email format").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // trim BEFORE min(1) so a whitespace-only name is rejected, not stored as "".
  name: z.string().trim().min(1, "Name is required"),
});

export const loginSchema = z.object({
  email: z.email("Invalid email format").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

/**
 * Optional body for refresh/logout: the token may instead come from the cookie.
 * A missing body is treated as `{}`; a non-string `refreshToken` is a 400.
 */
export const refreshBodySchema = z
  .object({ refreshToken: z.string("refreshToken must be a string").optional() })
  .optional()
  .transform((body) => body ?? {});
