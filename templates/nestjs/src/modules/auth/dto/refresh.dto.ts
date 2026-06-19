import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Refresh DTO — refreshToken is optional in the body because the controller
 * also accepts the token from the httpOnly cookie (dual-mode: CSR localStorage
 * clients send the body field; SSR/cookie clients rely on the cookie).
 * Missing token from BOTH sources is caught in the controller.
 */
const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export class RefreshDto extends createZodDto(refreshSchema) {}
