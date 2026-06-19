import { Roles } from "@/common/decorators/roles.decorator";
import { UserService } from "@/modules/user/user.service";
import { Controller, Get, HttpCode, Param, Query } from "@nestjs/common";

/**
 * User controller — admin-gated list + get-by-id.
 *
 * Both routes require JWT (enforced by global SecurityGuard) + admin role.
 * Envelope shapes mirror express modules/user/controller.ts:
 *   GET /users       → { status:"success", data: UserDocument[], meta: OffsetMeta }
 *   GET /users/:id   → { status:"success", data: UserDocument }
 *
 * @Roles("admin") sets the minimum role; RolesGuard inside SecurityGuard enforces it.
 * No @Public() — JWT is required on both routes.
 */
@Controller("users")
@Roles("admin")
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** GET /users?page=&limit= — paginated user list, newest first. */
  @Get()
  @HttpCode(200)
  async listUsers(
    @Query() query: Record<string, unknown>,
  ): Promise<{ status: string; data: unknown[]; meta: unknown }> {
    const { users, meta } = await this.userService.listUsers(query);
    return { status: "success", data: users, meta };
  }

  /** GET /users/:id — single user by ObjectId string. */
  @Get(":id")
  @HttpCode(200)
  async getUserById(
    @Param("id") id: string,
  ): Promise<{ status: string; data: unknown }> {
    const user = await this.userService.getUserById(id);
    return { status: "success", data: user };
  }
}
