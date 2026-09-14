import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsJobsController } from "./cms-jobs.controller.js";
import { CmsJobsService } from "./cms-jobs.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsJobsController],
  providers: [CmsJobsService],
})
export class CmsJobsModule {}
