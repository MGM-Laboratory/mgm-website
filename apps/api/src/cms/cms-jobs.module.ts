import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { CmsJobsController } from "./cms-jobs.controller.js";
import { CmsJobsService } from "./cms-jobs.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CmsJobsController],
  providers: [CmsJobsService],
})
export class CmsJobsModule {}
