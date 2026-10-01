import { z } from "zod";

/**
 * Login / sign-in form schema. Messages are i18n keys, translated where the error renders.
 * The password only has to be present: the backend decides whether it is right, and
 * accounts created under an older, weaker rule must still be able to sign in.
 */
export const loginSchema = z.object({
  email: z.email("validation.email"),
  password: z.string().min(1, "validation.password_required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
