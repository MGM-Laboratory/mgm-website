import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsArticlesController } from "./cms-articles.controller.js";
import { CmsArticlesService } from "./cms-articles.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsArticlesController],
  providers: [CmsArticlesService],
})
export class CmsArticlesModule {}
