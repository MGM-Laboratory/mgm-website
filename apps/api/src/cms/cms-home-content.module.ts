import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsHomeContentController } from "./cms-home-content.controller.js";
import { CmsHomeContentService } from "./cms-home-content.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsHomeContentController],
  providers: [CmsHomeContentService],
  exports: [CmsHomeContentService],
})
export class CmsHomeContentModule {}
