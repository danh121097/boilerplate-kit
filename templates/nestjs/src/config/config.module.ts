import { AppConfigService } from "@/config/app-config.service";
import { validateEnv } from "@/config/env.schema";
import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

// Global so AppConfigService is injectable everywhere without re-importing.
// `validate` runs the Zod schema at boot — invalid env fails fast.
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
