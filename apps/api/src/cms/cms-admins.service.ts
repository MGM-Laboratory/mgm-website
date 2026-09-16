import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Prisma } from "../generated/prisma/client.js";
import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const ADMIN_RECORDS_CACHE_KEY = "cms:admins:v1";
// The session gate reads through this cache on every admin request, so a
// short TTL keeps revocations and permission changes effective quickly.
const ADMIN_RECORDS_CACHE_TTL_SECONDS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const PAGES = [
  "articles",
  "publications",
  "members",
  "projects",
  "research",
  "careers",
  "contact",
  "contact-inquiries",
  "events",
] as const;

type AdminPageId = (typeof PAGES)[number];
export type AdminPermissions = Record<AdminPageId, ("read" | "write" | "delete")[]>;

export type AdminCreateInput = {
  name: string;
  passphrase?: string | "generate";
  expiresAt?: string | null;
  permissions?: Partial<AdminPermissions>;
};

export type AdminUpdateInput = {
  name?: string;
  active?: boolean;
  passphrase?: string | "generate";
  expiresAt?: string | null;
  permissions?: Partial<AdminPermissions>;
};

type StoredPassphrase = { salt: string; hash: string } | null;

type AdminData = {
  name: string;
  role: "admin";
  active: boolean;
  expiresAt: string | null;
  sessionVersion: number;
  passphrase: StoredPassphrase;
  permissions: AdminPermissions;
  lastLoginAt: string | null;
};

async function hashPassphrase(plain: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(plain, salt, KEY_LENGTH, SCRYPT);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

async function matchesPassphrase(plain: string, stored: StoredPassphrase) {
  if (!stored) return false;
  const expected = Buffer.from(stored.hash, "hex");
  const actual = await scrypt(plain, Buffer.from(stored.salt, "hex"), KEY_LENGTH, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function emptyPermissions(): AdminPermissions {
  return Object.fromEntries(PAGES.map((page) => [page, []])) as unknown as AdminPermissions;
}

function normalizePermissions(permissions: Partial<AdminPermissions> = {}): AdminPermissions {
  const normalized = { ...emptyPermissions(), ...permissions };
  normalized["contact-inquiries"] = normalized["contact-inquiries"].includes("read")
    ? ["read"]
    : [];
  return normalized;
}

function isActive(data: AdminData, now = Date.now()) {
  return data.active && (!data.expiresAt || Date.parse(data.expiresAt) > now);
}

@Injectable()
export class CmsAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private sanitize(record: {
    slug: string;
    data: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const data = record.data as AdminData;
    const { passphrase: _passphrase, ...safe } = data;
    return {
      slug: record.slug,
      ...safe,
      permissions: normalizePermissions(safe.permissions),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async all() {
    const cached = await this.cache.getJson(ADMIN_RECORDS_CACHE_KEY);
    if (cached) return cached;

    const records = await this.prisma.cmsAdmin.findMany({ orderBy: { createdAt: "asc" } });
    const sanitized = records.map((record) => this.sanitize(record));
    await this.cache.setJson(ADMIN_RECORDS_CACHE_KEY, sanitized, ADMIN_RECORDS_CACHE_TTL_SECONDS);
    return sanitized;
  }

  async bySlug(slug: string) {
    const record = await this.prisma.cmsAdmin.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Admin account not found");
    return this.sanitize(record);
  }

  /**
   * The public login path: reads always live (never the cache), and a
   * successful login only records the timestamp. Session invalidation uses
   * `sessionVersion`, which is bumped by mutations, never by logins.
   */
  async verify(plain: string) {
    const records = await this.prisma.cmsAdmin.findMany();
    for (const record of records) {
      const data = record.data as AdminData;
      if (!isActive(data)) continue;
      if (!(await matchesPassphrase(plain, data.passphrase))) continue;

      const lastLoginAt = new Date().toISOString();
      await this.prisma.cmsAdmin.update({
        where: { slug: record.slug },
        data: { data: { ...data, lastLoginAt } as Prisma.InputJsonValue },
      });
      await this.invalidate();
      return this.sanitize({ ...record, data: { ...data, lastLoginAt } });
    }
    return null;
  }

  async create(input: AdminCreateInput) {
    const plain =
      input.passphrase === undefined || input.passphrase === "generate"
        ? randomBytes(18).toString("base64url")
        : input.passphrase;
    const data: AdminData = {
      name: input.name,
      role: "admin",
      active: true,
      expiresAt: input.expiresAt ?? null,
      sessionVersion: 1,
      passphrase: await hashPassphrase(plain),
      permissions: normalizePermissions(input.permissions),
      lastLoginAt: null,
    };
    const record = await this.prisma.cmsAdmin.create({
      data: { slug: `admin-${randomUUID()}`, data: data as Prisma.InputJsonValue },
    });
    await this.invalidate();
    return {
      record: this.sanitize(record),
      // A typed passphrase belongs to the caller already; only auto-generated
      // ones are echoed back, exactly once, for the show-once confirmation.
      generatedPassphrase:
        input.passphrase === undefined || input.passphrase === "generate" ? plain : undefined,
    };
  }

  async update(slug: string, input: AdminUpdateInput) {
    const record = await this.prisma.cmsAdmin.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Admin account not found");
    const data = record.data as AdminData;
    const currentPermissions = normalizePermissions(data.permissions);

    let generated: string | undefined;
    let passphrase = data.passphrase;
    if (input.passphrase) {
      generated =
        input.passphrase === "generate" ? randomBytes(18).toString("base64url") : input.passphrase;
      passphrase = await hashPassphrase(generated);
      generated = input.passphrase === "generate" ? generated : undefined;
    }

    const next: AdminData = {
      ...data,
      name: input.name ?? data.name,
      active: input.active ?? data.active,
      expiresAt: input.expiresAt !== undefined ? input.expiresAt : data.expiresAt,
      sessionVersion: data.sessionVersion + 1,
      // Pages omitted from a partial update keep their stored permissions.
      permissions: normalizePermissions(
        input.permissions ? { ...currentPermissions, ...input.permissions } : currentPermissions,
      ),
      passphrase,
    };
    const updated = await this.prisma.cmsAdmin.update({
      where: { slug },
      data: { data: next as Prisma.InputJsonValue },
    });
    await this.invalidate();
    return { record: this.sanitize(updated), generatedPassphrase: generated };
  }

  async remove(slug: string) {
    try {
      await this.prisma.cmsAdmin.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Admin account not found");
    }
    await this.invalidate();
  }

  private async invalidate() {
    await this.cache.remove(ADMIN_RECORDS_CACHE_KEY);
  }
}
