import { z } from "zod";

/**
 * Login / sign-in form schema. Messages are i18n keys, translated where the error renders.
 * Any non-empty password passes: accounts created under older rules may have shorter
 * ones, and the backend decides. Strength rules belong on a register schema.
 */
export const loginSchema = z.object({
  email: z.email("validation.email"),
  password: z.string().min(1, "validation.password_required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
