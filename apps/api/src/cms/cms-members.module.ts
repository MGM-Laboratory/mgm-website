import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsMembersController } from "./cms-members.controller.js";
import { CmsMembersService } from "./cms-members.service.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CmsMembersController],
  providers: [CmsMembersService],
})
export class CmsMembersModule {}
