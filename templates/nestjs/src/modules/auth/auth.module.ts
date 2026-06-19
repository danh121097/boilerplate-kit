import { AuthController } from "@/modules/auth/auth.controller";
import { AuthService } from "@/modules/auth/auth.service";
import { PasswordService } from "@/modules/auth/password.service";
import { RefreshToken, RefreshTokenSchema } from "@/schemas/refresh-token.schema";
import { User, UserSchema } from "@/schemas/user.schema";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

/**
 * Auth feature module.
 *
 * MongooseModule.forFeature registers User + RefreshToken models locally.
 * PasswordService is auth-domain (only used here). CommonModule is @Global so the
 * shared TokenService / TokenRevocationService / HmacService are available too.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
})
export class AuthModule {}
