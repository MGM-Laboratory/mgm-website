import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsPublicationsController } from "./cms-publications.controller.js";
import { CmsPublicationsService } from "./cms-publications.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsPublicationsController],
  providers: [CmsPublicationsService],
})
export class CmsPublicationsModule {}
