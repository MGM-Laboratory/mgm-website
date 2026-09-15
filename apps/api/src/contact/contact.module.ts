import { Module } from "@nestjs/common";

import { CmsContactSettingsModule } from "../cms/cms-contact-settings.module.js";
import { MailModule } from "../mail/mail.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { ContactController } from "./contact.controller.js";
import { ContactService } from "./contact.service.js";

@Module({
  imports: [MailModule, StorageModule, CmsContactSettingsModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
