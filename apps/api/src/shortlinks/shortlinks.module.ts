import { Module } from "@nestjs/common";

import { ShortlinksController } from "./shortlinks.controller.js";
import { ShortlinksService } from "./shortlinks.service.js";

@Module({
  controllers: [ShortlinksController],
  providers: [ShortlinksService],
})
export class ShortlinksModule {}
