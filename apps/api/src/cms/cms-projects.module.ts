import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsProjectsController } from "./cms-projects.controller.js";
import { CmsProjectsService } from "./cms-projects.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsProjectsController],
  providers: [CmsProjectsService],
})
export class CmsProjectsModule {}
