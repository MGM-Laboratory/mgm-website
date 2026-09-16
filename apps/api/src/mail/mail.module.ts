import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { MailService } from "./mail.service.js";

@Module({
  imports: [PrismaModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
