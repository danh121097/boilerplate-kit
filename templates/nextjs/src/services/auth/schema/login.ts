import { z } from "zod";

/** Login form schema. Any non-empty password passes (accounts may predate the strength rules
 * that only registration enforces). Messages are i18n keys (`validation.*`), translated where they render. */
export const loginSchema = z.object({
  email: z.email("validation.email"),
  password: z.string().min(1, "validation.password_required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
