import { z } from "zod";

/** Login form schema. Messages are i18n keys (`validation.*`), translated where they render. */
export const loginSchema = z.object({
  email: z.email("validation.email"),
  password: z.string().min(8, "validation.password_min"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
