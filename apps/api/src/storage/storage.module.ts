// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { Module } from "@nestjs/common";

import { StorageService } from "./storage.service.js";

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
