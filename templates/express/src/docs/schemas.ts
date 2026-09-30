import { ROLES } from "@/types/auth";
import { z } from "zod";

/** User payload shared by every documented response that returns a user. */
export const publicUserSchema = z.object({
  _id: z.string(),
  email: z.email(),
  name: z.string(),
  role: z.enum([ROLES.USER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
