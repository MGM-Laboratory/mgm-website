// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { MailOutboxService } from "./mail-outbox.service.js";
import { MailService } from "./mail.service.js";

@Module({
  imports: [PrismaModule],
  providers: [MailService, MailOutboxService],
  exports: [MailService, MailOutboxService],
})
export class MailModule {}
