import { Public } from "@/common/decorators/public.decorator";
import { AppException } from "@/common/exceptions/app.exception";
import { All, Controller } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

/**
 * Catch-all for unmatched routes under the API prefix, including the bare prefix. Nest guards only run on
 * matched routes, so without this an unsigned `GET /api/v1/nope` would skip HMAC
 * and answer Nest's default 404. Matching it lets SecurityGuard run first:
 * unsigned → 401 HMAC_ERROR, signed → 404 NOT_FOUND "Resource not found!"
 * (same as express not-found-handler.ts). @Public skips only the JWT step.
 *
 * Must be registered after every other controller (see NotFoundModule).
 */
@Controller()
@Public()
@ApiExcludeController()
export class NotFoundController {
  @All(["", "{*path}"])
  notFound(): never {
    throw new AppException({
      message: "Resource not found!",
      statusCode: 404,
      errorType: "NOT_FOUND",
    });
  }
}
