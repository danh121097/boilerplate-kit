import { HealthController } from "@/modules/health/health.controller";
import { Module } from "@nestjs/common";

/**
 * Health module — exposes GET /health.
 *
 * @InjectConnection() works because DatabaseModule registers MongooseModule.forRoot()
 * globally (the default connection is available application-wide without forFeature).
 * RedisService is provided by RedisModule which AppModule imports globally.
 * CommonModule (@Global) exports RedisService is not the case — RedisModule does.
 * RedisModule is imported in AppModule and exports RedisService, so it is available here.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
