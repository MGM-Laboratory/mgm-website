import { Module } from "@nestjs/common";

import { CmsContactInquiriesModule } from "../cms/cms-contact-inquiries.module.js";
import { CmsContactSettingsModule } from "../cms/cms-contact-settings.module.js";
import { MailModule } from "../mail/mail.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { ContactController } from "./contact.controller.js";
import { ContactService } from "./contact.service.js";

@Module({
  imports: [MailModule, StorageModule, CmsContactSettingsModule, CmsContactInquiriesModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {} // skipcq: JS-0327
