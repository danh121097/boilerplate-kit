import { z } from "zod";

/** Sign-up form schema: the strength rule applies here, not on login. */
export const registerSchema = z.object({
  email: z.email("validation.email"),
  password: z.string().min(8, "validation.password_min"),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
