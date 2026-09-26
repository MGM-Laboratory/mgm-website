import { Module } from "@nestjs/common";

import { MailModule } from "../mail/mail.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { FormsAdminController } from "./forms-admin.controller.js";
import { FormsPublicController } from "./forms-public.controller.js";
import { FormsService } from "./forms.service.js";

@Module({
  imports: [PrismaModule, StorageModule, MailModule],
  controllers: [FormsAdminController, FormsPublicController],
  providers: [FormsService],
})
export class FormsModule {}
