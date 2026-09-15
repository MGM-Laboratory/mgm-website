import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsEventsController } from "./cms-events.controller.js";
import { CmsEventsService } from "./cms-events.service.js";
import { CmsEventRegistrationsService } from "./cms-event-registrations.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsEventsController],
  providers: [CmsEventsService, CmsEventRegistrationsService],
})
export class CmsEventsModule {}
