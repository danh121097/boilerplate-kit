import { AuthController } from "@/modules/auth/auth.controller";
import { AuthService } from "@/modules/auth/auth.service";
import { RefreshToken, RefreshTokenSchema } from "@/schemas/refresh-token.schema";
import { User, UserSchema } from "@/schemas/user.schema";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

/**
 * Auth feature module.
 *
 * MongooseModule.forFeature registers User + RefreshToken models locally.
 * CommonModule is @Global so TokenService / PasswordService / TokenRevocationService
 * are already available without re-importing CommonModule here.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
