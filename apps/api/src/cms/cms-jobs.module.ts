import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsJobApplicationsService } from "./cms-jobs-applications.service.js";
import { CmsJobsController } from "./cms-jobs.controller.js";
import { CmsJobsService } from "./cms-jobs.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsJobsController],
  providers: [CmsJobsService, CmsJobApplicationsService],
})
export class CmsJobsModule {}
