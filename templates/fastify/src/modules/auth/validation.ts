import { ROLES } from "@/types/auth";
import { z } from "zod";

export const registerSchema = z.object({
  email: z.email("Invalid email format").transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1, "Name is required"),
});

export const loginSchema = z.object({
  email: z.email("Invalid email format").transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

// Cookie-only clients send no body at all; Fastify hands the validator `null` for
// that, so the schema must accept null as well as undefined.
export const refreshBodySchema = z
  .object({ refreshToken: z.string("refreshToken must be a string").optional() })
  .nullish()
  .transform((body) => body ?? {});

export const publicUserSchema = z.object({
  _id: z.string(),
  email: z.email(),
  name: z.string(),
  role: z.enum([ROLES.USER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// Both fields are omitted from the body when AUTH_TOKENS_IN_BODY=false (cookies still carry them).
export const tokensSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});
export const registerResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ user: publicUserSchema, tokens: tokensSchema }),
});
export const loginResponseSchema = registerResponseSchema;
export const refreshResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ tokens: tokensSchema }),
});
export const logoutResponseSchema = z.object({ success: z.literal(true), message: z.string() });
export const meResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ user: publicUserSchema }),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
