import { AppConfigService } from "@/config/app-config.service";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import mongoose from "mongoose";

/**
 * Provides the Mongoose connection via MongooseModule.forRootAsync.
 * Enables query debug logging in non-production environments so slow
 * or unexpected queries are visible during development.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        uri: config.mongodbUri,
        connectionFactory: (connection: mongoose.Connection): mongoose.Connection => {
          if (!config.isProduction) {
            mongoose.set("debug", true);
          }
          return connection;
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
