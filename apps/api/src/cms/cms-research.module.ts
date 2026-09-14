import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsResearchController } from "./cms-research.controller.js";
import { CmsResearchService } from "./cms-research.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsResearchController],
  providers: [CmsResearchService],
})
export class CmsResearchModule {}
