import compression from "compression";
import { json, raw } from "express";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.validation.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });

  app.use(json({ limit: "8mb" }));

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService<Env, true>);

  // Publication papers arrive as raw PDF bytes (never JSON); the size ceiling
  // comes from configuration so it can change without touching code.
  app.use(
    raw({
      type: "application/pdf",
      limit: configService.getOrThrow<number>("CMS_MAX_PAPER_BYTES"),
    }),
  );

  // Project demo videos arrive as raw bytes the same way.
  app.use(
    raw({
      type: ["video/mp4", "video/webm"],
      limit: configService.getOrThrow<number>("CMS_MAX_VIDEO_BYTES"),
    }),
  );

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: configService.getOrThrow<string>("CORS_ORIGIN").split(","),
    credentials: true,
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Website API")
    .setDescription("API documentation")
    .setVersion("0.1.0")
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, swaggerDocument);

  const port = configService.getOrThrow<number>("PORT");
  await app.listen(port);
}

await bootstrap();
