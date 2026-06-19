import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Ported from express modules/auth/validation.ts — loginSchema.
 * Email lowercased+trimmed; password min-1 (strength NOT checked on login — avoids
 * accidentally locking out users whose passwords pre-date the strength policy).
 */
const loginSchema = z.object({
  email: z.string().email("Invalid email format").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export class LoginDto extends createZodDto(loginSchema) {}
