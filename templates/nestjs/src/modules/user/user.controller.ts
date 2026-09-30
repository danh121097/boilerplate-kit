import { Roles } from "@/common/decorators/roles.decorator";
import { UserService } from "@/modules/user/user.service";
import { Controller, Get, HttpCode, Param, Query } from "@nestjs/common";
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";

/**
 * User controller — admin-gated list + get-by-id.
 *
 * Both routes require JWT (enforced by global SecurityGuard) + admin role.
 * Envelope shapes mirror express modules/user/controller.ts:
 *   GET /users       → { status:"success", data: UserDocument[], meta: OffsetMeta }
 *   GET /users/:id   → { status:"success", data: UserDocument }
 *
 * @Roles("admin") sets the minimum role; SecurityGuard enforces it.
 * No @Public() — JWT is required on both routes.
 */
@Controller("users")
@Roles("admin")
@ApiTags("users")
@ApiSecurity({ bearerAuth: [] })
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** GET /users?page=&limit= — paginated user list, newest first. */
  @Get()
  @ApiOperation({ summary: "List users" })
  @ApiResponse({ status: 200, description: "Paginated users without password hashes" })
  @ApiResponse({ status: 401, description: "A valid access token is required" })
  @ApiResponse({ status: 403, description: "Admin role is required" })
  @ApiResponse({ status: 429, description: "Too many requests" })
  @ApiResponse({ status: 500, description: "The server could not complete the request" })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number; values below 1 are treated as 1.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page; values are clamped to 1–100.",
  })
  @HttpCode(200)
  async listUsers(
    @Query() query: Record<string, unknown>,
  ): Promise<{ status: string; data: unknown[]; meta: unknown }> {
    const { users, meta } = await this.userService.listUsers(query);
    return { status: "success", data: users, meta };
  }

  /** GET /users/:id — single user by ObjectId string. */
  @Get(":id")
  @ApiOperation({ summary: "Get a user by ID" })
  @ApiResponse({ status: 200, description: "User without a password hash" })
  @ApiResponse({ status: 401, description: "A valid access token is required" })
  @ApiResponse({ status: 403, description: "Admin role is required" })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({ status: 429, description: "Too many requests" })
  @ApiResponse({ status: 500, description: "The server could not complete the request" })
  @ApiParam({
    name: "id",
    type: String,
    description: "24-character hexadecimal MongoDB user ID.",
  })
  @HttpCode(200)
  async getUserById(@Param("id") id: string): Promise<{ status: string; data: unknown }> {
    const user = await this.userService.getUserById(id);
    return { status: "success", data: user };
  }
}
