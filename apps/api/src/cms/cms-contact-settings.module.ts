import { Module } from "@nestjs/common";

import { MailModule } from "../mail/mail.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { CmsContactSettingsController } from "./cms-contact-settings.controller.js";
import { CmsContactSettingsService } from "./cms-contact-settings.service.js";

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [CmsContactSettingsController],
  providers: [CmsContactSettingsService],
  exports: [CmsContactSettingsService],
})
export class CmsContactSettingsModule {} // skipcq: JS-0327
