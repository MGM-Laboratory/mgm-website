import compression from "compression";
import { json, raw, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.validation.js";

/** Respondent upload bodies buffered at the same time, at most. */
const FORMS_UPLOADS_AT_ONCE = 6;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const configService = app.get(ConfigService<Env, true>);

  // Form respondents' uploads arrive as raw bytes of any type, on this one
  // path only. Registered ahead of every other parser: body parsers are
  // first-match-wins, so a PDF, video or JSON file sent to a form must not
  // be claimed by the global parsers and their different limits. The
  // per-field limit is enforced in the handler; an oversized body gets a
  // JSON 413 instead of Express's HTML error page.
  const formUploadsPath = "/api/forms/public/:slug/uploads";
  const uploadLimit = configService.getOrThrow<number>("FORMS_MAX_UPLOAD_BYTES");
  // Before any body is buffered: a declared size is required and must fit,
  // and only a few upload bodies are held in memory at once, so parallel
  // uploads can't pile up hundreds of megabytes ahead of the handler's
  // form, field and per-visitor checks. The raw parser still counts the
  // bytes it actually receives against the same limit.
  let uploadsInFlight = 0;
  app.use(formUploadsPath, (req: Request, res: Response, next: NextFunction) => {
    const declared = Number(req.headers["content-length"]);
    if (!Number.isFinite(declared) || declared <= 0) {
      res.status(411).json({ statusCode: 411, message: "The upload must declare its size." });
      return;
    }
    if (declared > uploadLimit) {
      res.status(413).json({ statusCode: 413, message: "The file is too large." });
      return;
    }
    if (uploadsInFlight >= FORMS_UPLOADS_AT_ONCE) {
      res.setHeader("retry-after", "5");
      res
        .status(503)
        .json({ statusCode: 503, message: "Uploads are busy. Try again in a moment." });
      return;
    }
    uploadsInFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      uploadsInFlight -= 1;
    };
    res.on("finish", release);
    res.on("close", release);
    next();
  });
  app.use(formUploadsPath, raw({ type: () => true, limit: uploadLimit }));
  app.use(formUploadsPath, (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status = (error as { status?: unknown } | null)?.status;
    if (status === 413) {
      res.status(413).json({ statusCode: 413, message: "The file is too large." });
      return;
    }
    next(error);
  });
  // A 6 MB image is about 8.4 MB as a base64 data URL, above the global
  // JSON ceiling, so the form design media route gets a little headroom.
  app.use("/api/forms/admin/:id/media", json({ limit: "9mb" }));

  app.use(json({ limit: "8mb" }));

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Publication papers arrive as raw PDF bytes (never JSON); the size ceiling
  // comes from configuration so it can change without touching code.
  app.use(
    raw({
      type: "application/pdf",
      limit: configService.getOrThrow<number>("CMS_MAX_PAPER_BYTES"),
    }),
  );

  // Contact-form attachments arrive as raw bytes of whatever type the
  // browser reports (PDF, image, doc, archive), scoped to this one path so
  // it never shadows the JSON parser used everywhere else.
  app.use("/api/contact/attachments", raw({ type: () => true, limit: "26mb" }));

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
