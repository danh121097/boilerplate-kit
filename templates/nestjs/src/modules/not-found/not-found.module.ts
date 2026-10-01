import { NotFoundController } from "@/modules/not-found/not-found.controller";
import { Module } from "@nestjs/common";

/** Registers the catch-all route. Import it LAST in AppModule so it never shadows real routes. */
@Module({ controllers: [NotFoundController] })
export class NotFoundModule {}
