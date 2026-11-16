// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { Module } from "@nestjs/common";

import { ShortlinksController } from "./shortlinks.controller.js";
import { ShortlinksService } from "./shortlinks.service.js";

@Module({
  controllers: [ShortlinksController],
  providers: [ShortlinksService],
})
export class ShortlinksModule {}
