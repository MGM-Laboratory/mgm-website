import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { resolveNs, resolveTxt } from "node:dns/promises";

import type { Env } from "../config/env.validation.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  buildConnectUrl,
  connectRecords,
  resolveCloudflareSync,
} from "./shortlinks.domainconnect.js";
import { enrichVisit } from "./shortlinks.geo.js";
import {
  RailwayApiError,
  railwayCustomDomainAvailable,
  railwayCustomDomainCreate,
  railwayCustomDomainDelete,
  railwayCustomDomainStatus,
  type RailwayDomainStatus,
} from "./shortlinks.providers.js";
import {
  SLUG_MAX_LENGTH,
  SLUG_START_LENGTH,
  checkLongUrl,
  expiryFromOption,
  hashPassphrase,
  linkStatus,
  normalizeHostname,
  parseUserAgent,
  randomSlug,
  verifyPassphrase,
  zoneCandidates,
  type ExpiryOption,
} from "./shortlinks.utils.js";

const VERIFY_PATH = "/__mgm-shortlink-verify";
const VERIFY_MARKER = "mgm-shortlinks-ok";
const URL_CHECK_TTL_MS = 10 * 60 * 1000;

/** A validation outcome the controller turns into a 4xx with this message. */
export class ShortlinksError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ShortlinksError";
  }
}

type VisitMeta = {
  ip?: string | null;
  userAgent?: string | null;
  referer?: string | null;
};

export type PublicResolution =
  | { status: "ok"; longUrl: string }
  | { status: "passphrase"; host: string }
  | { status: "not_found" }
  | { status: "expired"; kind: "expired" | "consumed" };

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/** Hostnames ending in a Cloudflare nameserver: the domain lives on Cloudflare. */
async function isCloudflareHost(hostname: string): Promise<boolean> {
  for (const candidate of zoneCandidates(hostname)) {
    try {
      const servers = await resolveNs(candidate);
      return servers.some((server) => server.toLowerCase().endsWith(".ns.cloudflare.com"));
    } catch {
      // Not a resolvable zone (yet); the next candidate may be.
    }
  }
  return false;
}

@Injectable()
export class ShortlinksService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get primaryHostname(): string {
    return normalizeHostname(this.config.getOrThrow("SHORTLINKS_PRIMARY_DOMAIN"));
  }

  async onApplicationBootstrap() {
    await this.ensurePrimaryDomain();
  }

  /** The site's own domain row, seeded once so /s/:slug links always have a home. */
  private async ensurePrimaryDomain() {
    const hostname = this.primaryHostname;
    // An upsert rather than find-then-create, so two concurrent boots can't
    // race into a unique-constraint error while the other wins.
    await this.prisma.shortLinkDomain.upsert({
      where: { hostname },
      create: { hostname, isPrimary: true, provider: "local", status: "connected" },
      update: {},
    });
    await this.prisma.shortLinkDomain.updateMany({
      where: { hostname, isPrimary: false },
      data: { isPrimary: true },
    });
  }

  // --- Domains ---

  async listDomains() {
    const domains = await this.prisma.shortLinkDomain.findMany({
      include: { _count: { select: { links: true } } },
      orderBy: [{ isPrimary: "desc" }, { lastUsedAt: "desc" }, { createdAt: "desc" }],
    });
    const railwayToken = this.config.get("RAILWAY_API_TOKEN");
    return Promise.all(
      domains.map(async (domain) => {
        const dto = this.toDomainDto(domain, domain._count.links);
        if (!domain.isPrimary) {
          const railway =
            domain.railwayDomainId && railwayToken
              ? await this.railwayStatus(railwayToken, domain.railwayDomainId)
              : null;
          dto.records = this.recordsFor(domain.hostname, domain.verifyToken, railway);
        }
        return dto;
      }),
    );
  }

  /**
   * The DNS records the admin's provider needs, ready to copy: the routing
   * CNAME (Railway's own per-domain target when the domain is attached),
   * our verification TXT, and Railway's ownership TXT.
   */
  private recordsFor(
    hostname: string,
    verifyToken: string | null,
    railway: RailwayDomainStatus | null,
  ) {
    return {
      cname: {
        name: hostname,
        content:
          railway?.status?.dnsRecords?.[0]?.requiredValue ??
          this.config.getOrThrow("SHORTLINKS_CNAME_TARGET"),
      },
      verifyTxt: { name: `_mgm-verify.${hostname}`, content: verifyToken ?? "" },
      railwayTxt: railway?.status?.verificationToken
        ? { name: `_railway-verify.${hostname}`, content: railway.status.verificationToken }
        : null,
    };
  }

  private railwayStatus(token: string, railwayDomainId: string) {
    return railwayCustomDomainStatus(
      token,
      railwayDomainId,
      this.config.getOrThrow("SHORTLINKS_RAILWAY_PROJECT_ID"),
    ).catch(() => null);
  }

  private toDomainDto(
    domain: {
      id: string;
      hostname: string;
      isPrimary: boolean;
      provider: string;
      status: string;
      cloudflareZoneId: string | null;
      cloudflareTokenEncrypted: string | null;
      railwayDomainId: string | null;
      verifyToken: string | null;
      lastUsedAt: Date | null;
      createdAt: Date;
    },
    linkCount: number,
  ) {
    const dto: {
      id: string;
      hostname: string;
      isPrimary: boolean;
      provider: string;
      status: string;
      railwayAttached: boolean;
      lastUsedAt: Date | null;
      createdAt: Date;
      linkCount: number;
      records?: ReturnType<ShortlinksService["recordsFor"]>;
    } = {
      id: domain.id,
      hostname: domain.hostname,
      isPrimary: domain.isPrimary,
      provider: domain.provider,
      status: domain.status,
      railwayAttached: Boolean(domain.railwayDomainId),
      lastUsedAt: domain.lastUsedAt,
      createdAt: domain.createdAt,
      linkCount,
    };
    return dto;
  }

  /**
   * The short domain's own health check: the web app answers this path with
   * a marker only when Railway routes the hostname to it, so a 200 marker
   * means DNS, the Railway attachment and TLS all work end to end.
   */
  private async verifyDomainMarker(hostname: string): Promise<boolean> {
    try {
      const response = await fetch(`https://${hostname}${VERIFY_PATH}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return false;
      return (await response.text()).trim() === VERIFY_MARKER;
    } catch {
      return false;
    }
  }

  async createDomain(hostname: string) {
    const host = normalizeHostname(hostname);
    const pattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    if (!pattern.test(host)) {
      throw new ShortlinksError("That does not look like a domain name.");
    }
    if (host === this.primaryHostname) {
      throw new ShortlinksError("That is the site's own domain, it is already available.");
    }
    const existing = await this.prisma.shortLinkDomain.findUnique({ where: { hostname: host } });
    if (existing) throw new ShortlinksError("That domain is already added.", 409);

    const provider = (await isCloudflareHost(host)) ? "cloudflare" : "manual";
    let railwayDomainId: string | null = null;
    let railwayNote: string | null = null;

    const railwayToken = this.config.get("RAILWAY_API_TOKEN");
    if (railwayToken) {
      try {
        const available = await railwayCustomDomainAvailable(railwayToken, host);
        if (!available.available) {
          railwayNote = available.message ?? "Railway cannot attach this domain.";
        } else {
          const created = await railwayCustomDomainCreate(
            railwayToken,
            this.config.getOrThrow("SHORTLINKS_RAILWAY_PROJECT_ID"),
            this.config.getOrThrow("SHORTLINKS_RAILWAY_ENV_ID"),
            this.config.getOrThrow("SHORTLINKS_WEB_SERVICE_ID"),
            host,
          );
          railwayDomainId = created.id;
        }
      } catch (error) {
        railwayNote =
          error instanceof RailwayApiError ? error.message : "Railway attachment failed.";
      }
    }

    const domain = await this.prisma.shortLinkDomain.create({
      data: {
        hostname: host,
        provider,
        railwayDomainId,
        verifyToken: randomBytes(16).toString("hex"),
      },
    });
    return { domain: this.toDomainDto(domain, 0), railwayNote };
  }

  /** Domains created before the verify token existed get one on demand. */
  private async ensureVerifyToken(domain: { id: string; verifyToken: string | null }) {
    if (domain.verifyToken) return domain.verifyToken;
    const verifyToken = randomBytes(16).toString("hex");
    await this.prisma.shortLinkDomain.update({
      where: { id: domain.id },
      data: { verifyToken },
    });
    return verifyToken;
  }

  /**
   * Re-checks a custom domain. The validity check is the verification TXT
   * at _mgm-verify.<hostname> (what the Domain Connect sync writes): the
   * domain is only connected when that TXT matches its stored token AND
   * the web app's marker probe answers, which is the end-to-end proof that
   * Railway routes the host. A "manual" domain gets its Cloudflare
   * detection refreshed too.
   */
  async refreshDomain(id: string) {
    const domain = await this.prisma.shortLinkDomain.findUnique({ where: { id } });
    if (!domain || domain.isPrimary) return null;

    const verifyToken = await this.ensureVerifyToken(domain);
    const parts = await this.domainCheckParts({ ...domain, verifyToken });
    const connected = parts.verifyTxt && parts.marker;
    let provider = domain.provider;
    if (provider !== "cloudflare") {
      provider = (await isCloudflareHost(domain.hostname)) ? "cloudflare" : "manual";
    }
    await this.prisma.shortLinkDomain.update({
      where: { id },
      data: { status: connected ? "connected" : "pending", provider },
    });
    const linkCount = await this.prisma.shortLink.count({ where: { domainId: id } });
    return {
      domain: this.toDomainDto(
        { ...domain, status: connected ? "connected" : "pending", provider },
        linkCount,
      ),
      checks: parts,
    };
  }

  /** The individual pieces a domain's connected state is made of. */
  private async domainCheckParts(domain: {
    hostname: string;
    verifyToken: string | null;
    railwayDomainId: string | null;
  }) {
    const parts = {
      verifyTxt: false,
      railway: false,
      marker: false,
    };
    if (domain.verifyToken) {
      try {
        const records = await resolveTxt(`_mgm-verify.${domain.hostname}`);
        parts.verifyTxt = records.some((strings) => strings.join("") === domain.verifyToken);
      } catch {
        // No TXT record yet.
      }
    }
    const railwayToken = this.config.get("RAILWAY_API_TOKEN");
    if (railwayToken && domain.railwayDomainId) {
      const railway = await this.railwayStatus(railwayToken, domain.railwayDomainId);
      parts.railway = Boolean(
        railway?.status?.dnsRecords?.every(
          (record) => record.status !== "DNS_RECORD_STATUS_REQUIRES_UPDATE",
        ) && railway.status.certificateStatus === "CERTIFICATE_STATUS_TYPE_VALID",
      );
    }
    parts.marker = await this.verifyDomainMarker(domain.hostname);
    return parts;
  }

  async deleteDomain(id: string) {
    const domain = await this.prisma.shortLinkDomain.findUnique({ where: { id } });
    if (!domain) return false;
    if (domain.isPrimary) {
      throw new ShortlinksError("The site's own domain cannot be deleted.");
    }
    const linkCount = await this.prisma.shortLink.count({ where: { domainId: id } });
    if (linkCount > 0) {
      throw new ShortlinksError(
        `Delete its ${linkCount} link${linkCount === 1 ? "" : "s"} first.`,
        409,
      );
    }
    const railwayToken = this.config.get("RAILWAY_API_TOKEN");
    if (railwayToken && domain.railwayDomainId) {
      void railwayCustomDomainDelete(railwayToken, domain.railwayDomainId).catch(() => {});
    }
    await this.prisma.shortLinkDomain.delete({ where: { id } });
    return true;
  }

  /**
   * Attaches the domain to the web service through the Railway API (when a
   * token is configured) and returns the routing target Railway expects.
   */
  private async attachOnRailway(domain: {
    id: string;
    hostname: string;
    railwayDomainId: string | null;
  }) {
    const railwayToken = this.config.get("RAILWAY_API_TOKEN");
    const fallbackTarget = this.config.getOrThrow("SHORTLINKS_CNAME_TARGET");
    if (!railwayToken)
      return { railway: null as RailwayDomainStatus | null, cnameTarget: fallbackTarget };

    let railway: RailwayDomainStatus | null = null;
    if (domain.railwayDomainId) {
      railway = await railwayCustomDomainStatus(
        railwayToken,
        domain.railwayDomainId,
        this.config.getOrThrow("SHORTLINKS_RAILWAY_PROJECT_ID"),
      );
    } else {
      const available = await railwayCustomDomainAvailable(railwayToken, domain.hostname);
      if (!available.available) {
        throw new RailwayApiError(available.message ?? "Railway cannot attach this domain.");
      }
      const created = await railwayCustomDomainCreate(
        railwayToken,
        this.config.getOrThrow("SHORTLINKS_RAILWAY_PROJECT_ID"),
        this.config.getOrThrow("SHORTLINKS_RAILWAY_ENV_ID"),
        this.config.getOrThrow("SHORTLINKS_WEB_SERVICE_ID"),
        domain.hostname,
      );
      await this.prisma.shortLinkDomain.update({
        where: { id: domain.id },
        data: { railwayDomainId: created.id },
      });
      railway = created;
    }
    const routing = railway?.status?.dnsRecords?.[0];
    return { railway, cnameTarget: routing?.requiredValue ?? fallbackTarget };
  }

  /**
   * The one-click Cloudflare setup: make sure the domain is attached on
   * Railway (so the edge routes it), then build the signed Domain Connect
   * apply URL. Cloudflare's consent page applies the template's CNAME and
   * TXT records to the zone; the API never sees a Cloudflare token.
   */
  async connectDomain(id: string) {
    const domain = await this.prisma.shortLinkDomain.findUnique({ where: { id } });
    if (!domain || domain.isPrimary) return null;
    const verifyToken = await this.ensureVerifyToken(domain);

    let railwayResult: { railway: RailwayDomainStatus | null; cnameTarget: string };
    try {
      railwayResult = await this.attachOnRailway(domain);
    } catch (error) {
      throw new ShortlinksError(
        `Railway could not attach the domain: ${error instanceof RailwayApiError ? error.message : String(error)}`,
      );
    }

    const records = connectRecords(
      domain.hostname,
      railwayResult.cnameTarget,
      verifyToken,
      railwayResult.railway?.status?.verificationToken ?? null,
    );

    const privateKey = this.config.get("DOMAIN_CONNECT_PRIVATE_KEY");
    if (!privateKey) {
      // Without the signing key the sync cannot be requested; hand the
      // records over so the UI can still show exactly what to enter.
      return { url: null as string | null, records };
    }
    const { zone, syncUrl } = await resolveCloudflareSync(
      domain.hostname,
      this.config.getOrThrow("DOMAIN_CONNECT_SYNC_URL"),
    );
    const built = buildConnectUrl({
      syncUrl,
      providerId: this.config.getOrThrow("DOMAIN_CONNECT_PROVIDER_ID"),
      serviceId: this.config.getOrThrow("DOMAIN_CONNECT_SERVICE_ID"),
      zone,
      hostname: domain.hostname,
      records,
      keyId: this.config.getOrThrow("DOMAIN_CONNECT_KEY_ID"),
      redirectUrl: this.config.getOrThrow("DOMAIN_CONNECT_REDIRECT_URL"),
      privateKey,
    });
    return { url: built.url, records };
  }

  // --- Links ---

  private toLinkDto(
    link: {
      id: string;
      slug: string;
      longUrl: string;
      domainId: string;
      expiresAt: Date | null;
      maxClicks: number | null;
      clickCount: number;
      viewCount: number;
      passphraseHash: string | null;
      longUrlStatus: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    domain: { hostname: string; isPrimary: boolean },
  ) {
    const status = linkStatus(link);
    return {
      id: link.id,
      slug: link.slug,
      longUrl: link.longUrl,
      shortUrl: `https://${domain.hostname}${domain.isPrimary ? `/s/${link.slug}` : `/${link.slug}`}`,
      domainId: link.domainId,
      domainHost: domain.hostname,
      status,
      clickCount: link.clickCount,
      viewCount: link.viewCount,
      hasPassphrase: Boolean(link.passphraseHash),
      expiresAt: link.expiresAt,
      maxClicks: link.maxClicks,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    };
  }

  private async uniqueSlug(domainId: string): Promise<string> {
    for (let length = SLUG_START_LENGTH; length <= SLUG_MAX_LENGTH; length += 1) {
      // A handful of attempts per length; if they all collide the code space
      // is nearly full and the next length up is the right fix.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = randomSlug(length);
        const taken = await this.prisma.shortLink.findUnique({
          where: { domainId_slug: { domainId, slug } },
          select: { id: true },
        });
        if (!taken) return slug;
      }
    }
    throw new Error("Could not generate a short code.");
  }

  private async assertSlugFree(domainId: string, slug: string) {
    const taken = await this.prisma.shortLink.findUnique({
      where: { domainId_slug: { domainId, slug } },
      select: { id: true },
    });
    if (taken) throw new ShortlinksError("That short code is already taken on this domain.", 409);
  }

  async createLink(input: {
    domainId: string;
    longUrl: string;
    slug?: string;
    expiresIn: ExpiryOption;
    passphrase?: string;
  }) {
    const domain = await this.prisma.shortLinkDomain.findUnique({ where: { id: input.domainId } });
    if (!domain) throw new ShortlinksError("That domain does not exist.");

    const slug = input.slug ? input.slug : await this.uniqueSlug(domain.id);
    if (input.slug) await this.assertSlugFree(domain.id, input.slug);
    const { expiresAt, maxClicks } = expiryFromOption(input.expiresIn);
    const passphrase = input.passphrase ? await hashPassphrase(input.passphrase) : null;

    const link = await this.prisma.shortLink.create({
      data: {
        slug,
        longUrl: input.longUrl,
        domainId: domain.id,
        expiresAt,
        maxClicks,
        passphraseSalt: passphrase?.salt ?? null,
        passphraseHash: passphrase?.hash ?? null,
      },
    });
    await this.prisma.shortLinkDomain.update({
      where: { id: domain.id },
      data: { lastUsedAt: new Date() },
    });
    void this.checkAndStoreUrl(link.id, link.longUrl);
    return this.toLinkDto(link, domain);
  }

  async listLinks(search?: string, domainId?: string) {
    const where = {
      ...(domainId ? { domainId } : {}),
      ...(search
        ? {
            OR: [
              { slug: { contains: search, mode: "insensitive" as const } },
              { longUrl: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const links = await this.prisma.shortLink.findMany({
      where,
      include: { domain: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    this.checkStaleUrls(links);
    return links.map((link) => this.toLinkDto(link, link.domain));
  }

  /** keep leaves the stored hash alone, set re-hashes, remove clears it. */
  private async resolvePassphrase(
    action: "keep" | "set" | "remove",
    passphrase: string | undefined,
    current: { salt: string | null; hash: string | null },
  ) {
    if (action === "set" && passphrase) return hashPassphrase(passphrase);
    if (action === "remove") return null;
    return current.hash ? { salt: current.salt ?? "", hash: current.hash } : null;
  }

  async updateLink(
    id: string,
    input: {
      domainId?: string;
      longUrl?: string;
      slug?: string;
      expiresIn?: ExpiryOption;
      passphraseAction: "keep" | "set" | "remove";
      passphrase?: string;
    },
  ) {
    const link = await this.prisma.shortLink.findUnique({
      where: { id },
      include: { domain: true },
    });
    if (!link) return null;

    const domain = input.domainId
      ? await this.prisma.shortLinkDomain.findUnique({ where: { id: input.domainId } })
      : link.domain;
    if (!domain) throw new ShortlinksError("That domain does not exist.");

    const slug = input.slug ?? link.slug;
    if (slug !== link.slug || domain.id !== link.domainId) {
      await this.assertSlugFree(domain.id, slug);
    }

    const expiry = input.expiresIn ? expiryFromOption(input.expiresIn) : null;
    const passphrase = await this.resolvePassphrase(input.passphraseAction, input.passphrase, {
      salt: link.passphraseSalt,
      hash: link.passphraseHash,
    });

    const longUrlChanged = input.longUrl !== undefined && input.longUrl !== link.longUrl;
    const updated = await this.prisma.shortLink.update({
      where: { id },
      data: {
        slug,
        domainId: domain.id,
        longUrl: input.longUrl ?? link.longUrl,
        expiresAt: expiry ? expiry.expiresAt : undefined,
        maxClicks: expiry ? expiry.maxClicks : undefined,
        passphraseSalt: passphrase?.salt ?? null,
        passphraseHash: passphrase?.hash ?? null,
        ...(longUrlChanged ? { longUrlStatus: null, longUrlCheckedAt: null } : {}),
      },
      include: { domain: true },
    });
    if (input.domainId && input.domainId !== link.domainId) {
      await this.prisma.shortLinkDomain.update({
        where: { id: input.domainId },
        data: { lastUsedAt: new Date() },
      });
    }
    if (longUrlChanged) void this.checkAndStoreUrl(updated.id, updated.longUrl);
    return this.toLinkDto(updated, updated.domain);
  }

  async deleteLink(id: string) {
    await this.prisma.shortLink.deleteMany({ where: { id } });
  }

  /** Lazy health checks for targets whose stored result is stale or missing. */
  private checkStaleUrls(
    links: { id: string; longUrl: string; expiresAt: Date | null; longUrlCheckedAt: Date | null }[],
  ) {
    const stale = links.filter(
      (link) =>
        !link.expiresAt &&
        (!link.longUrlCheckedAt || Date.now() - link.longUrlCheckedAt.getTime() > URL_CHECK_TTL_MS),
    );
    for (const link of stale.slice(0, 12)) void this.checkAndStoreUrl(link.id, link.longUrl);
  }

  private async checkAndStoreUrl(id: string, longUrl: string) {
    const status = await checkLongUrl(longUrl);
    await this.prisma.shortLink.update({
      where: { id },
      data: { longUrlStatus: status, longUrlCheckedAt: new Date() },
    });
  }

  // --- Visits & resolution ---

  /**
   * Writes the visit row and keeps the link's counters in step, so the list
   * view and the analytics agree even for expired links and lost races.
   * `clickCounted` marks clicks whose counter was already reserved by the
   * single-use guard in `incrementClick`.
   */
  private async recordVisit(
    linkId: string,
    meta: VisitMeta,
    kind: { view: boolean; click: boolean; failed?: boolean; clickCounted?: boolean },
  ) {
    const client = parseUserAgent(meta.userAgent ?? "");
    const visit = await this.prisma.shortLinkVisit.create({
      data: {
        linkId,
        ip: clip(meta.ip, 45),
        userAgent: clip(meta.userAgent, 500),
        referer: clip(meta.referer, 500),
        isView: kind.view,
        isClick: kind.click,
        failedAttempt: kind.failed ?? false,
        ...client,
      },
    });
    await this.prisma.shortLink.updateMany({
      where: { id: linkId },
      data: {
        ...(kind.view ? { viewCount: { increment: 1 } } : {}),
        ...(kind.click && !kind.clickCounted ? { clickCount: { increment: 1 } } : {}),
      },
    });
    if (this.config.get("SHORTLINKS_GEOLOCATE")) {
      enrichVisit(this.prisma, visit.id, visit.ip);
    }
    return visit;
  }

  private async findRoutableLink(hostname: string, slug: string) {
    const host = normalizeHostname(hostname);
    const domain = await this.prisma.shortLinkDomain.findUnique({ where: { hostname: host } });
    if (domain && !domain.isPrimary && domain.status !== "connected") return null;
    if (!domain) {
      // Not a short domain: the site's own /s/ links resolve on every host
      // the site answers on (www, the Railway domain, localhost), so fall
      // back to the primary domain rather than 404ing by hostname.
      const primary = await this.prisma.shortLinkDomain.findFirst({ where: { isPrimary: true } });
      if (!primary) return null;
      return this.prisma.shortLink.findUnique({
        where: { domainId_slug: { domainId: primary.id, slug } },
      });
    }
    return this.prisma.shortLink.findUnique({
      where: { domainId_slug: { domainId: domain.id, slug } },
    });
  }

  /** Counts one click, capped by maxClicks when the link is single-use. */
  private async incrementClick(link: { id: string; maxClicks: number | null }) {
    if (link.maxClicks !== null) {
      const result = await this.prisma.shortLink.updateMany({
        where: { id: link.id, clickCount: { lt: link.maxClicks } },
        data: { clickCount: { increment: 1 } },
      });
      return result.count;
    }
    await this.prisma.shortLink.updateMany({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    });
    return 1;
  }

  async resolve(hostname: string, slug: string, meta: VisitMeta): Promise<PublicResolution> {
    const link = await this.findRoutableLink(hostname, slug);
    if (!link) return { status: "not_found" };
    const state = linkStatus(link);
    if (state === "expired" || state === "consumed") return { status: "expired", kind: state };
    if (link.passphraseHash) return { status: "passphrase", host: normalizeHostname(hostname) };

    const counted = await this.incrementClick(link);
    if (counted === 0) {
      // Another request spent the single click between the read and the write.
      await this.recordVisit(link.id, meta, { view: true, click: false });
      return { status: "expired", kind: "consumed" };
    }
    await this.recordVisit(link.id, meta, { view: true, click: true, clickCounted: true });
    return { status: "ok", longUrl: link.longUrl };
  }

  /**
   * The gate page's server-side read: records the view itself (this is the
   * "sees it" in the analytics) and hands back the state to render.
   */
  async publicLinkState(
    hostname: string,
    slug: string,
    meta: VisitMeta,
  ): Promise<PublicResolution> {
    const link = await this.findRoutableLink(hostname, slug);
    if (!link) return { status: "not_found" };
    const state = linkStatus(link);
    if (state === "expired" || state === "consumed") {
      await this.recordVisit(link.id, meta, { view: true, click: false });
      return { status: "expired", kind: state };
    }
    if (link.passphraseHash) {
      await this.recordVisit(link.id, meta, { view: true, click: false });
      return { status: "passphrase", host: normalizeHostname(hostname) };
    }
    // Reached without the proxy in front (e.g. a direct page hit): behave
    // exactly like a resolve so the visitor still gets their redirect.
    return this.resolve(hostname, slug, meta);
  }

  async verify(hostname: string, slug: string, passphrase: string, meta: VisitMeta) {
    const link = await this.findRoutableLink(hostname, slug);
    if (!link) return null;
    const state = linkStatus(link);
    if (state === "expired" || state === "consumed")
      return { expired: true as const, longUrl: null };

    if (link.passphraseHash) {
      const correct = await verifyPassphrase(
        passphrase,
        link.passphraseSalt ?? "",
        link.passphraseHash,
      );
      if (!correct) {
        await this.recordVisit(link.id, meta, { view: true, click: false, failed: true });
        return { expired: false as const, longUrl: null, rejected: true as const };
      }
    }
    const counted = await this.incrementClick(link);
    if (counted === 0) {
      await this.recordVisit(link.id, meta, { view: true, click: false });
      return { expired: true as const, longUrl: null };
    }
    await this.recordVisit(link.id, meta, { view: true, click: true, clickCounted: true });
    return { expired: false as const, longUrl: link.longUrl };
  }

  // --- Analytics ---

  async linkAnalytics(id: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { id },
      include: { domain: true },
    });
    if (!link) return null;

    const [totals, series, countries, browsers, oss, devices] = await Promise.all([
      this.prisma.$queryRaw<
        { views: number; clicks: number; uniqueIps: number; failedAttempts: number }[]
      >`
        SELECT
          COUNT(*) FILTER (WHERE "isView")::int AS "views",
          COUNT(*) FILTER (WHERE "isClick")::int AS "clicks",
          COUNT(DISTINCT "ip")::int AS "uniqueIps",
          COUNT(*) FILTER (WHERE "failedAttempt")::int AS "failedAttempts"
        FROM "ShortLinkVisit" WHERE "linkId" = ${id}
      `,
      this.prisma.$queryRaw<{ day: Date; views: number; clicks: number }[]>`
        SELECT
          date_trunc('day', "createdAt") AS "day",
          COUNT(*) FILTER (WHERE "isView")::int AS "views",
          COUNT(*) FILTER (WHERE "isClick")::int AS "clicks"
        FROM "ShortLinkVisit"
        WHERE "linkId" = ${id} AND "createdAt" >= now() - interval '14 days'
        GROUP BY 1 ORDER BY 1
      `,
      this.prisma.$queryRaw<{ country: string; visits: number }[]>`
        SELECT "country", COUNT(*)::int AS "visits"
        FROM "ShortLinkVisit" WHERE "linkId" = ${id} AND "country" IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      `,
      this.prisma.$queryRaw<{ browser: string; visits: number }[]>`
        SELECT "browser", COUNT(*)::int AS "visits"
        FROM "ShortLinkVisit" WHERE "linkId" = ${id} AND "browser" IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `,
      this.prisma.$queryRaw<{ os: string; visits: number }[]>`
        SELECT "os", COUNT(*)::int AS "visits"
        FROM "ShortLinkVisit" WHERE "linkId" = ${id} AND "os" IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `,
      this.prisma.$queryRaw<{ device: string; visits: number }[]>`
        SELECT "device", COUNT(*)::int AS "visits"
        FROM "ShortLinkVisit" WHERE "linkId" = ${id} AND "device" IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `,
    ]);

    const referrerRows = await this.prisma.shortLinkVisit.findMany({
      where: { linkId: id, referer: { not: null } },
      select: { referer: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const referrerCounts = new Map<string, number>();
    for (const row of referrerRows) {
      if (!row.referer) continue;
      try {
        const host = new URL(row.referer).host;
        referrerCounts.set(host, (referrerCounts.get(host) ?? 0) + 1);
      } catch {
        const direct = row.referer === "direct" ? "direct" : "other";
        referrerCounts.set(direct, (referrerCounts.get(direct) ?? 0) + 1);
      }
    }
    const referrers = [...referrerCounts.entries()]
      .map(([host, visits]) => ({ host, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);

    const byDay = new Map(series.map((row) => [row.day.toISOString().slice(0, 10), row]));
    const days: { day: string; views: number; clicks: number }[] = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const key = day.toISOString().slice(0, 10);
      const row = byDay.get(key);
      days.push({ day: key, views: row?.views ?? 0, clicks: row?.clicks ?? 0 });
    }

    const recent = await this.prisma.shortLinkVisit.findMany({
      where: { linkId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        ip: true,
        userAgent: true,
        referer: true,
        isView: true,
        isClick: true,
        failedAttempt: true,
        country: true,
        region: true,
        city: true,
        timezone: true,
        device: true,
        browser: true,
        os: true,
        createdAt: true,
      },
    });

    return {
      link: this.toLinkDto(link, link.domain),
      totals: totals[0] ?? { views: 0, clicks: 0, uniqueIps: 0, failedAttempts: 0 },
      days,
      countries,
      referrers,
      browsers,
      oss,
      devices,
      recent,
    };
  }

  // --- The host list the web app's proxy uses to spot custom domains ---

  async routingHosts() {
    const domains = await this.prisma.shortLinkDomain.findMany({
      where: { isPrimary: false },
      select: { hostname: true, status: true },
    });
    return domains.map((domain) => ({ hostname: domain.hostname, status: domain.status }));
  }
}
