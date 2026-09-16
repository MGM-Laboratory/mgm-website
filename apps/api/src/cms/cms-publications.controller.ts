import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import sharp from "sharp";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { CmsPublicationsService } from "./cms-publications.service.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Full dates for freshly published records; year-only for older records
// whose month and day the sources never state.
const DATE_PATTERN = /^\d{4}(?:-\d{2}-\d{2})?$/;

export const PUBLICATION_TYPES = [
  "journal-article",
  "conference-paper",
  "preprint",
  "book-chapter",
  "book",
  "thesis",
] as const;

const authorSchema = z.object({
  id: z.string().trim().min(1).max(64),
  // Residence authors resolve through the member CMS; non-residence authors
  // carry their own name, link, and portrait. Omitted on older records, where
  // the presence of memberSlug decides.
  kind: z.enum(["residence", "non-residence"]).optional(),
  name: z.string().trim().min(1).max(200),
  affiliation: z.string().trim().max(300).optional(),
  memberSlug: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().max(500).optional(),
  photoKey: z.string().min(1).max(500).optional(),
  photoPosition: z
    .object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      zoom: z.number().positive().max(10),
    })
    .optional(),
});

const publicationSchema = z.object({
  publication: z.object({
    slug: z.string().regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens."),
    title: z.string().trim().min(1).max(400),
    type: z.enum(PUBLICATION_TYPES),
    date: z.string().regex(DATE_PATTERN),
    journal: z.string().trim().max(300).optional(),
    volume: z.string().trim().max(40).optional(),
    issue: z.string().trim().max(40).optional(),
    pages: z.string().trim().max(80).optional(),
    publisher: z.string().trim().max(200).optional(),
    doi: z
      .string()
      .trim()
      .regex(
        /^10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+$/,
        "Use the DOI identifier only, e.g. 10.1000/xyz123.",
      )
      .optional(),
    url: z.string().trim().max(500).optional(),
    license: z.string().trim().max(120).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20),
    abstract: z.string().trim().max(50_000).optional(),
    authors: z.array(authorSchema).min(1).max(50),
    draft: z.boolean(),
    paperKey: z.string().min(1).max(500).optional(),
    paperName: z.string().trim().max(300).optional(),
    paperSize: z.number().int().nonnegative().max(1_073_741_824).optional(),
  }),
});
const bootstrapSchema = z.object({ records: z.array(publicationSchema).min(1).max(200) });
const savePublicationSchema = publicationSchema.extend({
  sourceSlug: z.string().min(1).optional(),
});

const authorPhotoSchema = z.object({ image: z.string().startsWith("data:image/") });

// Every uploaded paper key is minted by the upload endpoint with a
// `paper-<slug>-<uuid>.pdf` shape. Anything else belongs to another namespace
// (covers, portraits, arbitrary bucket objects) and is refused.
const PAPER_KEY_PATTERN =
  /^paper-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

// Non-residence author portraits are minted by the photo upload endpoint.
// Everything is re-encoded server-side as WebP (which keeps alpha), so the
// stored keys are .webp; .png stays accepted for keys minted before.
const AUTHOR_PHOTO_KEY_PATTERN =
  /^author-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|webp)$/;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const isPdf = (buffer: Buffer) => {
  // Buffer.isBuffer() at the call site already proves this isn't array-shaped;
  // CodeQL's request-parameter model doesn't know about main.ts's raw-body middleware.
  // codeql[js/type-confusion-through-parameter-tampering]
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
};

@ApiTags("cms-publications")
@Controller("cms/publications")
export class CmsPublicationsController {
  constructor(
    private readonly publications: CmsPublicationsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async all() {
    // Drafts are filtered server-side; this route feeds the public site.
    return { records: await this.publications.all() };
  }

  @Get("admin")
  async allIncludingDrafts(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.publications.allIncludingDrafts() };
  }

  // The light feed, the paper redirect, and the admin list sit above ":slug"
  // so the reserved paths can never be shadowed by a slug.
  @Get("feed")
  async feed() {
    return { records: await this.publications.feed() };
  }

  @Get("paper/:key")
  async paper(@Param("key") key: string, @Res() response: Response) {
    if (!PAPER_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown paper key");
    }
    // Draft papers stay unservable even when their storage key leaks; the
    // ownership check mirrors the single-record read path.
    if (!(await this.publications.paperIsPublished(key))) {
      throw new NotFoundException("Publication record not found");
    }
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(key, 60 * 60);
    } catch {
      throw new BadRequestException("Media storage is not configured in this environment.");
    }
    return response.redirect(url);
  }

  @Get("media/:key")
  async media(@Param("key") key: string, @Res() response: Response) {
    if (!AUTHOR_PHOTO_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown media key");
    }
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(key, 60 * 60);
    } catch {
      throw new BadRequestException("Media storage is not configured in this environment.");
    }
    return response.redirect(url);
  }

  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.publications.bySlug(slug) };
  }

  @Post("bootstrap")
  async bootstrap(@Req() request: Request, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { records } = bootstrapSchema.parse(request.body);
    return {
      records: await this.publications.bootstrap(
        records.map((record) => ({
          data: record as unknown as Prisma.InputJsonValue,
          slug: record.publication.slug,
        })),
      ),
    };
  }

  // Non-residence author portraits arrive as base64 data URLs in whatever
  // format the editor's browser produced (JPEG, PNG, WebP, GIF). The server
  // re-encodes everything: EXIF rotation applied, resized to at most 1024px,
  // and compressed to WebP — which also preserves transparency.
  @Post("author-photo")
  async uploadAuthorPhoto(@Req() request: Request, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { image } = authorPhotoSchema.parse(request.body);
    const [meta, payload] = image.split(",", 2);
    const sourceType = meta.match(/^data:(image\/(?:png|jpeg|webp|gif));base64$/)?.[1];
    const buffer = Buffer.from(payload ?? "", "base64");
    if (!sourceType || !buffer.length || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestException(
        "The portrait must be a PNG, JPEG, WebP, or GIF image under 6 MB after cropping.",
      );
    }

    let webp: Buffer;
    try {
      webp = await sharp(buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException("That file is not a valid image.");
    }

    const key = `author-${randomUUID()}.webp`;
    try {
      await this.storage.uploadFile({ body: webp, contentType: "image/webp", key });
    } catch {
      throw new BadRequestException(
        "Media storage is not configured in this environment, so portraits cannot be uploaded.",
      );
    }
    return { key };
  }

  @Put(":slug")
  async save(
    @Param("slug") slug: string,
    @Req() request: Request,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const document = savePublicationSchema.parse(request.body);
    try {
      return await this.publications.save(
        slug,
        document.publication.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CMS_PUBLICATION_SLUG_CONFLICT") {
        throw new ConflictException("That publication URL is already in use.");
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.publications.remove(slug);
    return { ok: true };
  }

  // The paper arrives as raw `application/pdf` bytes — the express raw body
  // parser for that content type is registered in main.ts with the same
  // configured size ceiling enforced here again for a friendly message.
  @Post(":slug/paper")
  async uploadPaper(
    @Param("slug") slug: string,
    @Req() request: Request,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    // The slug becomes part of the storage key, so it is held to the same
    // shape as everywhere else rather than trusted from the route.
    const contentType = String(request.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    // CodeQL's type-confusion query only recognizes typeof/Array.isArray checks
    // as sanitizing barriers, not Buffer.isBuffer() below — this rejects the
    // array shape its model worries about before that real (sufficient) check.
    const body = Buffer.isBuffer(request.body) ? request.body : undefined;
    const maxBytes = this.config.getOrThrow<number>("CMS_MAX_PAPER_BYTES");

    const checks = [
      {
        condition: !SLUG_PATTERN.test(slug),
        error: new BadRequestException("Invalid publication slug"),
      },
      {
        condition: Array.isArray(request.body),
        error: new BadRequestException("The paper must be a PDF file."),
      },
      {
        condition: contentType !== "application/pdf" || !body?.length,
        error: new BadRequestException("The paper must be a PDF file."),
      },
      {
        condition: !!body && body.length > maxBytes,
        error: new BadRequestException(
          `The paper must be under ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
        ),
      },
      {
        condition: !!body && !isPdf(body),
        error: new BadRequestException("That file is not a valid PDF."),
      },
    ];

    for (const { condition, error } of checks) {
      if (condition) throw error;
    }

    const key = `paper-${slug}-${randomUUID()}.pdf`;
    try {
      await this.storage.uploadFile({ body, contentType: "application/pdf", key });
    } catch {
      throw new BadRequestException(
        "Paper storage is not configured in this environment, so papers cannot be uploaded.",
      );
    }
    // codeql[js/type-confusion-through-parameter-tampering]
    return { key, size: body.length };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
