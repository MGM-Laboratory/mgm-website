import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ADMIN_PAGE_IDS as PAGES } from "@repo/shared";

import type { Env } from "../config/env.validation.js";
import { CmsAdminsService } from "./cms-admins.service.js";

const ACTION_RANK: Record<string, number> = { read: 1, write: 2, delete: 3 };

const verifySchema = z.object({ passphrase: z.string().min(1).max(300) });

// Every stored permission list is implication-expanded from the strongest
// action: ["delete"] becomes ["read","write","delete"], ["write"] becomes
// ["read","write"], and [] means no access at all.
const permissionListSchema = z
  .array(z.enum(["read", "write", "delete"]))
  .max(3)
  .transform((actions) => {
    const maxRank = actions.reduce((rank, action) => Math.max(rank, ACTION_RANK[action]), 0);
    return (["read", "write", "delete"] as const).filter((_, index) => index + 1 <= maxRank);
  });

// Zod's record schema with enum keys demands every key, so the value schema
// is optional and a transform fills the absent pages with no access. Pages
// omitted from a partial update therefore keep their stored permissions.
const permissionsSchema = z
  .record(z.enum(PAGES), permissionListSchema.optional())
  .transform((record) => {
    const result = {} as Record<(typeof PAGES)[number], ("read" | "write" | "delete")[]>;
    for (const page of PAGES) {
      const actions = record[page] ?? [];
      result[page] =
        page === "contact-inquiries" ? actions.filter((action) => action === "read") : actions;
    }
    return result;
  });

const adminCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  passphrase: z.union([z.literal("generate"), z.string().min(8).max(200)]).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  permissions: permissionsSchema.optional(),
});

const adminUpdateSchema = adminCreateSchema.extend({ active: z.boolean().optional() }).partial();

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-admins")
@Controller("cms/admins")
export class CmsAdminsController {
  constructor(
    private readonly admins: CmsAdminsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // The verify route is public by design: it is how the login page checks an
  // admin passphrase. The remaining routes are superadmin-only. It sits above
  // ":slug" so a record can never shadow the reserved path.
  @Post("verify")
  async verify(@Body() body: unknown) {
    const { passphrase } = verifySchema.parse(body);
    const account = await this.admins.verify(passphrase);
    if (!account) throw new UnauthorizedException("That passphrase does not match.");
    return { account };
  }

  @Get()
  async all(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertSuperadmin(passphrase);
    return { records: await this.admins.all() };
  }

  @Get(":slug")
  async one(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertSuperadmin(passphrase);
    return { record: await this.admins.bySlug(slug) };
  }

  @Post()
  async create(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertSuperadmin(passphrase);
    const input = adminCreateSchema.parse(body);
    return this.admins.create(input);
  }

  @Put(":slug")
  async update(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertSuperadmin(passphrase);
    const input = adminUpdateSchema.parse(body);
    return this.admins.update(slug, input);
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertSuperadmin(passphrase);
    await this.admins.remove(slug);
    return { ok: true };
  }

  private assertSuperadmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
