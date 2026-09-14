import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { CmsJobsService, isOpenJob } from "./cms-jobs.service.js";
import { CmsJobApplicationsService } from "./cms-jobs-applications.service.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// BlockNote document validation. Unknown block fields must survive the parse
// so zod's default stripping does not silently rewrite saved documents.
const blockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    content: z.unknown().optional(),
    children: z.array(z.unknown()).optional(),
  })
  .passthrough();

// Paths that belong to routes on this controller (and the applications
// namespace in the companion service); a job can never claim one as its URL.
const RESERVED_JOB_SLUGS = new Set(["admin", "feed", "media", "applications"]);

const jobSchema = z.object({
  job: z.object({
    slug: z
      .string()
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens.")
      .refine((value) => !RESERVED_JOB_SLUGS.has(value), "That URL is reserved."),
    title: z.string().trim().min(1).max(200),
    focus: z.string().trim().min(1).max(120),
    commitment: z.enum(["full-time", "part-time", "project", "internship", "volunteer"]),
    mode: z.enum(["onsite", "remote", "hybrid"]),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    perks: z.array(z.string().trim().min(1).max(80)).max(8),
    status: z.enum(["draft", "published", "closed"]),
  }),
  content: z.array(blockSchema),
});
const saveJobSchema = jobSchema.extend({ sourceSlug: z.string().min(1).optional() });

const imageSchema = z.object({ image: z.string().startsWith("data:image/") });

// Multipart text fields arrive as strings, so every field below validates the
// string it actually receives (agreedToTerms is the checkbox's "true").
const applySchema = z
  .object({
    applicantType: z.enum(["ub-student", "general"]),
    fullName: z.string().trim().min(2).max(200),
    email: z.email().max(254),
    phoneCountry: z.string().regex(/^\+\d{1,3}$/),
    phoneNumber: z
      .string()
      .trim()
      .regex(/^[0-9][0-9 ()\-]{5,19}$/),
    nim: z.string().trim().max(30).optional().or(z.literal("")),
    faculty: z.string().trim().max(120).optional().or(z.literal("")),
    motivation: z.string().trim().min(10).max(8000),
    agreedToTerms: z.literal("true"),
  })
  .superRefine((value, context) => {
    if (value.applicantType !== "ub-student") return;
    if (!value.nim) {
      context.addIssue({
        code: "custom",
        path: ["nim"],
        message: "NIM is required for Universitas Brawijaya applicants.",
      });
    } else if (!/^(2\d{14}|\d{10}|\d{18})$/.test(value.nim)) {
      context.addIssue({
        code: "custom",
        path: ["nim"],
        message: "NIM must be 15 digits starting with 2 (or a 10-digit NIDN / 18-digit NIP).",
      });
    }
    if (!value.faculty) {
      context.addIssue({
        code: "custom",
        path: ["faculty"],
        message: "Faculty is required for Universitas Brawijaya applicants.",
      });
    }
  });

const applicationStateSchema = z
  .object({
    read: z.boolean().optional(),
    status: z.enum(["inbox", "archived"]).optional(),
  })
  .refine((value) => value.read !== undefined || value.status !== undefined, "Nothing to update");

const applicationBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["archive", "unarchive", "markRead", "markUnread", "delete"]),
});

// Accepted CV formats; the extension is derived from the mimetype, never from
// the client-supplied filename.
const CV_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** The original filename is display-only; strip anything path-shaped. */
function sanitizeFilename(name: string) {
  const cleaned = name
    .replace(/[/\\\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return cleaned || "cv";
}

// Every job media key is minted by the upload endpoint with a
// `job-<slug>-<uuid>.<ext>` shape. Anything else belongs to another
// namespace (article covers, CV uploads, arbitrary bucket objects).
const MEDIA_KEY_PATTERN =
  /^job-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-jobs")
@Controller("cms/jobs")
export class CmsJobsController {
  constructor(
    private readonly jobs: CmsJobsService,
    private readonly applicationsService: CmsJobApplicationsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Open roles only. The listing never renders BlockNote body text, so the
  // feed carries everything except the document and stays payload-light.
  @Get()
  async all() {
    return { records: await this.jobs.all() };
  }

  @Get("admin")
  async allIncludingDrafts(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.jobs.allIncludingDrafts() };
  }

  // The applications namespace sits above ":slug" so the reserved paths can
  // never be shadowed by a job slug.
  @Get("applications")
  async applications(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.applicationsService.all() };
  }

  // The signed CV URL is folded into the detail response so the web proxy
  // never has to relay a redirect (which would buffer the whole file).
  @Get("applications/:slug")
  async application(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const record = await this.applicationsService.bySlug(slug);
    const application = record.application as { cvKey?: unknown } | undefined;
    let cvUrl: string | null = null;
    if (typeof application?.cvKey === "string") {
      try {
        cvUrl = await this.storage.getSignedDownloadUrl(application.cvKey, 60 * 15);
      } catch {
        cvUrl = null;
      }
    }
    return { record, cvUrl };
  }

  @Put("applications/:slug/state")
  async applicationState(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const patch = applicationStateSchema.parse(body);
    return { record: await this.applicationsService.updateState(slug, patch) };
  }

  @Post("applications/bulk")
  async applicationsBulk(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { ids, action } = applicationBulkSchema.parse(body);
    const { deletedCvKeys } = await this.applicationsService.bulk(ids, action);
    // Deleted applications leave no reason to keep their CVs in the bucket.
    for (const key of deletedCvKeys) {
      await this.storage.deleteFile(key).catch(() => undefined);
    }
    return { ok: true };
  }

  // The apply route buffers a full CV in memory, so it gets a much tighter
  // budget than the global limit — a 100 MB upload is not a cheap request.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(":slug/apply")
  @UseInterceptors(FileInterceptor("cv"))
  async apply(
    @Param("slug") slug: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body: unknown = {},
  ) {
    // Public applicants get friendly 400s for bad fields instead of the
    // internal 500 the admin-only validation paths are allowed to produce.
    let fields: z.infer<typeof applySchema>;
    try {
      fields = applySchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? "Invalid application.");
      }
      throw error;
    }

    let job: Record<string, unknown>;
    try {
      job = await this.jobs.bySlug(slug);
    } catch {
      throw new BadRequestException("That role does not exist.");
    }
    if (!isOpenJob(job)) {
      throw new ConflictException("This role is no longer accepting applications.");
    }

    if (!file) throw new BadRequestException("Please attach your CV.");
    const extension = CV_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException("The CV must be a PDF or Word document (.pdf, .doc, .docx).");
    }
    const maxCvBytes = this.maxCvBytes();
    if (file.size > maxCvBytes) {
      throw new PayloadTooLargeException(
        `The CV must be under ${Math.floor(maxCvBytes / 1024 / 1024)} MB.`,
      );
    }

    const key = `cv-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body: file.buffer, contentType: file.mimetype, key });
    } catch {
      throw new BadRequestException(
        "Application storage is not configured in this environment, so applications cannot be submitted right now.",
      );
    }

    const jobTitle = (job.job as { title?: unknown } | undefined)?.title ?? slug;
    await this.applicationsService.create({
      application: {
        ...fields,
        jobSlug: slug,
        jobTitle: typeof jobTitle === "string" ? jobTitle : slug,
        cvKey: key,
        cvFilename: sanitizeFilename(file.originalname),
        cvContentType: file.mimetype,
        read: false,
        readAt: null,
        status: "inbox",
      },
    } as unknown as Prisma.InputJsonValue);
    return { ok: true };
  }

  // The admin and media routes sit above ":slug" so the reserved paths can
  // never be shadowed by a job slug.
  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.jobs.bySlug(slug) };
  }

  @Put(":slug")
  async save(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const document = saveJobSchema.parse(body);
    try {
      return await this.jobs.save(
        slug,
        document.job.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CMS_JOB_SLUG_CONFLICT") {
        throw new ConflictException("That role URL is already in use.");
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.jobs.remove(slug);
    return { ok: true };
  }

  @Post(":slug/media")
  async uploadMedia(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const { image } = imageSchema.parse(body);
    const [meta, payload] = image.split(",", 2);
    const contentType = meta.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1];
    const buffer = Buffer.from(payload ?? "", "base64");
    if (!contentType || !buffer.length || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestException(
        "The image must be a PNG, JPEG, or WebP under 6 MB after compression.",
      );
    }
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `job-${slug}-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body: buffer, contentType, key });
    } catch {
      throw new BadRequestException(
        "Media storage is not configured in this environment, so images cannot be uploaded.",
      );
    }
    return { key };
  }

  // Job descriptions request many media redirects in a single burst, so the
  // global rate limit must not apply here. The key allowlist below keeps the
  // route safe without a request budget.
  @SkipThrottle()
  @Get("media/:key")
  async media(@Param("key") key: string, @Res() response: Response) {
    if (!MEDIA_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown media key");
    }
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(key, 60 * 15);
    } catch {
      throw new BadRequestException("Media storage is not configured in this environment.");
    }
    return response.redirect(url);
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }

  /**
   * Read straight from process.env: the validated config may not know this
   * variable yet, and the route must never depend on that. Falls back to
   * 100 MB when unset.
   */
  private maxCvBytes() {
    const configured = Number(process.env.CMS_MAX_CV_BYTES);
    return Number.isFinite(configured) && configured > 0 ? configured : 104_857_600;
  }
}
