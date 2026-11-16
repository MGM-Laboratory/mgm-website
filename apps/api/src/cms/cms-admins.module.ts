// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { CmsAdminsController } from "./cms-admins.controller.js";
import { CmsAdminsService } from "./cms-admins.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CmsAdminsController],
  providers: [CmsAdminsService],
})
export class CmsAdminsModule {}
