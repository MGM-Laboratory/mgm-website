import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import {
  MAIL_PROVIDER_IDS,
  type MailLongPeriod,
  type MailProviderId,
  type MailProviderLimitConfig,
  type MailProviderLimits,
  type MailProviderWeights,
  type MailStrategy,
} from "@repo/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type MailProviderStatus = {
  fromEmailConfigured: boolean;
  providers: Record<
    MailProviderId,
    {
      configured: boolean;
      windowMode?: "calendar" | "rolling";
      dailyLimit?: number;
      dailyRemaining?: number;
      longLimit?: number;
      longPeriod?: MailLongPeriod;
      longRemaining?: number;
    }
  >;
};

function nextUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function nextLongReset(period: MailLongPeriod | undefined): Date {
  const now = new Date();
  if (period === "monthly") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  // "30day": a fixed cadence rather than a calendar boundary.
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
}

@Injectable()
export class MailService {
  private readonly client: SESClient;
  private readonly resend?: Resend;
  private readonly smtpTransport?: Transporter;
  private readonly fromEmail?: string;
  private readonly sesCredentialsConfigured: boolean;

  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.client = new SESClient({ region: configService.get<string>("AWS_REGION") });
    this.sesCredentialsConfigured = Boolean(
      configService.get<string | undefined>("AWS_ACCESS_KEY_ID"),
    );

    const resendApiKey = configService.get<string | undefined>("RESEND_API_KEY");
    this.resend = resendApiKey ? new Resend(resendApiKey) : undefined;

    const smtpHost = configService.get<string | undefined>("SMTP_HOST");
    const smtpUser = configService.get<string | undefined>("SMTP_USER");
    const smtpPassword = configService.get<string | undefined>("SMTP_PASSWORD");
    this.smtpTransport = smtpHost
      ? nodemailer.createTransport({
          host: smtpHost,
          port: configService.get<number | undefined>("SMTP_PORT") ?? 587,
          secure: configService.get<boolean>("SMTP_SECURE"),
          auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
        })
      : undefined;

    this.fromEmail = configService.get<string | undefined>("SES_FROM_EMAIL");
  }

  // Booleans + live remaining counts only, never credentials — safe for an
  // admin-only CMS panel. SES's "configured" flag is a soft hint (explicit
  // access key present); routing itself always treats SES as available,
  // since the AWS SDK's default credential chain (e.g. an IAM role) can work
  // even without one.
  async getStatus(limits: MailProviderLimits): Promise<MailProviderStatus> {
    const providers = {} as MailProviderStatus["providers"];
    for (const id of MAIL_PROVIDER_IDS) {
      providers[id] = await this.buildProviderStatusEntry(id, limits[id]);
    }
    return { fromEmailConfigured: Boolean(this.fromEmail), providers };
  }

  private getConfiguredFlag(id: MailProviderId): boolean {
    if (id === "resend") return Boolean(this.resend);
    if (id === "smtp") return Boolean(this.smtpTransport);
    return this.sesCredentialsConfigured;
  }

  private async buildProviderStatusEntry(
    id: MailProviderId,
    config: MailProviderLimitConfig | undefined,
  ): Promise<MailProviderStatus["providers"][MailProviderId]> {
    const entry: MailProviderStatus["providers"][MailProviderId] = {
      configured: this.getConfiguredFlag(id),
    };
    if (!config || !(config.dailyLimit ?? config.longLimit)) return entry;

    entry.windowMode = config.windowMode;
    const quota =
      config.windowMode === "rolling"
        ? await this.buildRollingStatus(id, config)
        : await this.buildCalendarStatus(id, config);
    return { ...entry, ...quota };
  }

  private async buildRollingStatus(id: MailProviderId, config: MailProviderLimitConfig) {
    const quota: Partial<MailProviderStatus["providers"][MailProviderId]> = {};
    if (config.dailyLimit) {
      quota.dailyLimit = config.dailyLimit;
      quota.dailyRemaining = await this.rollingRemaining(id, 1, config.dailyLimit);
    }
    if (config.longLimit) {
      quota.longLimit = config.longLimit;
      quota.longPeriod = config.longPeriod;
      quota.longRemaining = await this.rollingRemaining(id, 30, config.longLimit);
    }
    return quota;
  }

  private async buildCalendarStatus(id: MailProviderId, config: MailProviderLimitConfig) {
    const usage = await this.getOrInitUsage(id, config);
    const quota: Partial<MailProviderStatus["providers"][MailProviderId]> = {};
    if (config.dailyLimit) {
      quota.dailyLimit = config.dailyLimit;
      quota.dailyRemaining = usage.dailyRemaining ?? config.dailyLimit;
    }
    if (config.longLimit) {
      quota.longLimit = config.longLimit;
      quota.longPeriod = config.longPeriod;
      quota.longRemaining = usage.longRemaining ?? config.longLimit;
    }
    return quota;
  }

  async sendEmail(params: {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
    strategy?: MailStrategy;
    providerOrder?: MailProviderId[];
    weights?: MailProviderWeights;
    limits?: MailProviderLimits;
  }): Promise<void> {
    const from = params.from ?? this.fromEmail;
    if (!from) {
      throw new Error("SES_FROM_EMAIL is not configured");
    }

    const strategy = params.strategy ?? "failover";
    const order = params.providerOrder?.length ? params.providerOrder : [...MAIL_PROVIDER_IDS];
    const weights = params.weights ?? {};
    const limits = params.limits ?? {};

    const candidates = await this.resolveCandidates(strategy, order, weights, limits);
    if (!candidates.length) {
      throw new Error(
        "No mail provider is available (none configured, or all have reached their configured send limit).",
      );
    }

    const errors: string[] = [];
    for (const providerId of candidates) {
      try {
        await this.sendVia(providerId, from, params);
        await this.recordUsage(providerId, limits[providerId]);
        return;
      } catch (error) {
        errors.push(`${providerId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`All mail providers failed: ${errors.join("; ")}`);
  }

  // Every strategy resolves to an ORDERED list of candidates; sendEmail walks
  // it and moves to the next on failure — this is what makes failover
  // automatic under every strategy, not just "failover" itself.
  private async resolveCandidates(
    strategy: MailStrategy,
    order: MailProviderId[],
    weights: MailProviderWeights,
    limits: MailProviderLimits,
  ): Promise<MailProviderId[]> {
    if (strategy === "resend" || strategy === "smtp" || strategy === "ses") {
      return this.isConfigured(strategy) ? [strategy] : [];
    }

    const configured = order.filter((id) => this.isConfigured(id));
    if (!configured.length) return [];

    if (strategy === "failover") return configured;
    if (strategy === "loadBalanceEqual") return this.rotate(configured);
    if (strategy === "loadBalanceWeighted") return this.weightedOrder(configured, weights);

    // loadBalanceLimit: only providers currently under their configured
    // quota are candidates at all — a limit is a hard cap, not a hint.
    const eligible: MailProviderId[] = [];
    for (const id of configured) {
      if (await this.hasQuota(id, limits[id])) eligible.push(id);
    }
    return eligible;
  }

  private isConfigured(id: MailProviderId): boolean {
    if (id === "resend") return Boolean(this.resend);
    if (id === "smtp") return Boolean(this.smtpTransport);
    return true; // SES: the client always exists; see getStatus's doc comment.
  }

  private async rotate(list: MailProviderId[]): Promise<MailProviderId[]> {
    if (list.length <= 1) return list;
    const row = await this.prisma.mailRoutingState.upsert({
      create: { key: "roundRobin", value: 1 },
      update: { value: { increment: 1 } },
      where: { key: "roundRobin" },
    });
    const index = row.value % list.length;
    return [...list.slice(index), ...list.slice(0, index)];
  }

  private weightedOrder(list: MailProviderId[], weights: MailProviderWeights): MailProviderId[] {
    if (list.length <= 1) return list;
    const withWeight = list.map((id) => ({ id, weight: Math.max(0, weights[id] ?? 1) }));
    const total = withWeight.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return list;
    // Not security-sensitive: picks which mail provider handles this send,
    // not an auth token, session id, or anything cryptographic.
    let roll = Math.random() * total; // NOSONAR
    let picked = withWeight[0]!.id;
    for (const entry of withWeight) {
      if (roll < entry.weight) {
        picked = entry.id;
        break;
      }
      roll -= entry.weight;
    }
    return [picked, ...list.filter((id) => id !== picked)];
  }

  private async hasQuota(id: MailProviderId, config?: MailProviderLimitConfig): Promise<boolean> {
    if (!config || (!config.dailyLimit && !config.longLimit)) return true;
    if (config.windowMode === "rolling") {
      if (config.dailyLimit && (await this.rollingRemaining(id, 1, config.dailyLimit)) <= 0) {
        return false;
      }
      if (config.longLimit && (await this.rollingRemaining(id, 30, config.longLimit)) <= 0) {
        return false;
      }
      return true;
    }
    const usage = await this.getOrInitUsage(id, config);
    if (config.dailyLimit && (usage.dailyRemaining ?? 0) <= 0) return false;
    if (config.longLimit && (usage.longRemaining ?? 0) <= 0) return false;
    return true;
  }

  private async recordUsage(id: MailProviderId, config?: MailProviderLimitConfig): Promise<void> {
    if (!config || (!config.dailyLimit && !config.longLimit)) return;

    if (config.windowMode === "rolling") {
      await this.prisma.mailSendLog.create({ data: { provider: id } });
      // Opportunistic cleanup — avoids an unbounded log without a cron job.
      // Not security-sensitive: just a sampling rate for a housekeeping query.
      const shouldCleanup = Math.random() < 0.05; // NOSONAR
      if (shouldCleanup) {
        const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
        await this.prisma.mailSendLog.deleteMany({
          where: { provider: id, sentAt: { lt: cutoff } },
        });
      }
      return;
    }

    await this.getOrInitUsage(id, config); // ensures the row exists and due resets are applied first
    const patch: Prisma.MailProviderUsageUpdateInput = {};
    if (config.dailyLimit) patch.dailyRemaining = { decrement: 1 };
    if (config.longLimit) patch.longRemaining = { decrement: 1 };
    if (Object.keys(patch).length) {
      // Read-modify-write, not a single atomic compare-and-swap: acceptable
      // at a contact form's expected volume, not safe at high concurrency.
      await this.prisma.mailProviderUsage.update({ data: patch, where: { provider: id } });
    }
  }

  private async rollingRemaining(
    id: MailProviderId,
    windowDays: number,
    limit: number,
  ): Promise<number> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const count = await this.prisma.mailSendLog.count({
      where: { provider: id, sentAt: { gte: since } },
    });
    return Math.max(0, limit - count);
  }

  // Calendar-mode counters. `dailyRemaining`/`longRemaining` on the config
  // seed the counter only the first time it's created for a provider — so
  // an admin can start it below the full limit to account for usage from
  // outside this app — subsequent periodic resets restore the full limit.
  private async getOrInitUsage(id: MailProviderId, config: MailProviderLimitConfig) {
    let row = await this.prisma.mailProviderUsage.findUnique({ where: { provider: id } });
    if (!row) {
      row = await this.prisma.mailProviderUsage.create({
        data: {
          dailyRemaining: config.dailyLimit ? (config.dailyRemaining ?? config.dailyLimit) : null,
          dailyResetAt: config.dailyLimit ? nextUtcMidnight() : null,
          longRemaining: config.longLimit ? (config.longRemaining ?? config.longLimit) : null,
          longResetAt: config.longLimit ? nextLongReset(config.longPeriod) : null,
          provider: id,
        },
      });
    }

    const now = new Date();
    const patch: Prisma.MailProviderUsageUpdateInput = {};
    if (config.dailyLimit && row.dailyResetAt && now >= row.dailyResetAt) {
      patch.dailyRemaining = config.dailyLimit;
      patch.dailyResetAt = nextUtcMidnight();
    }
    if (config.longLimit && row.longResetAt && now >= row.longResetAt) {
      patch.longRemaining = config.longLimit;
      patch.longResetAt = nextLongReset(config.longPeriod);
    }
    if (Object.keys(patch).length) {
      row = await this.prisma.mailProviderUsage.update({ data: patch, where: { provider: id } });
    }
    return row;
  }

  private async sendVia(
    id: MailProviderId,
    from: string,
    params: { to: string | string[]; subject: string; html: string; replyTo?: string },
  ): Promise<void> {
    if (id === "resend") {
      if (!this.resend) throw new Error("Resend is not configured (RESEND_API_KEY is missing)");
      const { error } = await this.resend.emails.send({
        from,
        html: params.html,
        replyTo: params.replyTo,
        subject: params.subject,
        to: params.to,
      });
      if (error) throw new Error(`Resend: ${error.message}`);
      return;
    }

    if (id === "smtp") {
      if (!this.smtpTransport) throw new Error("SMTP is not configured (SMTP_HOST is missing)");
      await this.smtpTransport.sendMail({
        from,
        html: params.html,
        replyTo: params.replyTo,
        subject: params.subject,
        to: params.to,
      });
      return;
    }

    await this.client.send(
      new SendEmailCommand({
        Destination: { ToAddresses: Array.isArray(params.to) ? params.to : [params.to] },
        Message: {
          Body: { Html: { Data: params.html } },
          Subject: { Data: params.subject },
        },
        ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
        Source: from,
      }),
    );
  }
}
