import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { CmsContactSettingsController } from "./cms-contact-settings.controller.js";
import { CmsContactSettingsService } from "./cms-contact-settings.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CmsContactSettingsController],
  providers: [CmsContactSettingsService],
  exports: [CmsContactSettingsService],
})
export class CmsContactSettingsModule {}
