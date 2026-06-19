import { UserController } from "@/modules/user/user.controller";
import { UserService } from "@/modules/user/user.service";
import { User, UserSchema } from "@/schemas/user.schema";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

/**
 * User feature module — admin-gated list + get-by-id.
 * CommonModule is @Global so no explicit import needed for shared services.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
