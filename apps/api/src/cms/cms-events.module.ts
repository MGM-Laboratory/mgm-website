import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { CmsEventsController } from "./cms-events.controller.js";
import { CmsEventsService } from "./cms-events.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CmsEventsController],
  providers: [CmsEventsService],
})
export class CmsEventsModule {}
