import { z } from "zod";

/** Login / sign-in form schema. Messages are i18n keys, translated where the error renders. */
export const loginSchema = z.object({
  email: z.email("validation.email"),
  password: z.string().min(8, "validation.password_min"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
