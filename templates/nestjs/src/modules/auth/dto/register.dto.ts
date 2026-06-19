import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Ported from express modules/auth/validation.ts — registerSchema.
 * Email is lowercased + trimmed; password min-8 (strength validated in service);
 * name trimmed + required.
 */
const registerSchema = z.object({
  email: z.string().email("Invalid email format").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z
    .string()
    .min(1, "Name is required")
    .transform((v) => v.trim()),
});

export class RegisterDto extends createZodDto(registerSchema) {}
