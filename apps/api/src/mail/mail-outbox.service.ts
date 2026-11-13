import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "./mail.service.js";

/** The mail that the outbox keeps, in the shape that `MailService.sendEmail` takes. */
export type OutboxMail = Parameters<MailService["sendEmail"]>[0];

// A row is claimed for this long. A copy that dies during a send leaves its row
// to the next claim after the lease, so a mail is not stuck in a crashed process.
const LEASE_MS = 5 * 60 * 1000;
const TICK_MS = 60 * 1000;
const BATCH_SIZE = 10;
// Minutes to wait after the first, second, third failure and so on. The last
// value repeats until MAX_ATTEMPTS.
const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720];
const MAX_ATTEMPTS = 8;
const FAILED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

type ClaimedRow = { id: string; params: OutboxMail; attempts: number };

/** Minutes until the next try after the given number of failed attempts. */
export function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1];
}

/**
 * A mail that survives a provider outage. `enqueue` stores it, and a claim with
 * a lease hands each row to one API copy at a time (`FOR UPDATE SKIP LOCKED`),
 * so two copies never send the same row. A send that fails is tried again later
 * with a growing wait, up to MAX_ATTEMPTS. A send that times out may have been
 * delivered, so a retry can deliver a second copy.
 */
@Injectable()
export class MailOutboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MailOutboxService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.processDue().catch((error: unknown) => {
        this.logger.warn(
          "Mail outbox run failed",
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Stores a mail for delivery and returns its id. */
  async enqueue(mail: OutboxMail): Promise<string> {
    const id = randomUUID();
    await this.prisma.mailOutbox.create({
      data: { id, params: mail as unknown as Prisma.InputJsonValue },
    });
    return id;
  }

  /** Starts a run now without waiting for it. A failure is logged and left to the next run. */
  kick() {
    void this.processDue().catch((error: unknown) => {
      this.logger.warn(
        "Mail outbox run failed",
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  /** Claims the rows that are due and delivers each one. Runs do not overlap in one copy. */
  async processDue(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const leaseUntil = new Date(now.getTime() + LEASE_MS);
      const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
        UPDATE "MailOutbox"
        SET "attempts" = "attempts" + 1, "nextAttemptAt" = ${leaseUntil}
        WHERE "id" IN (
          SELECT "id" FROM "MailOutbox"
          WHERE "status" = 'pending' AND "nextAttemptAt" <= ${now}
          ORDER BY "nextAttemptAt"
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "params", "attempts"
      `;
      for (const row of rows) await this.deliver(row, now);
      await this.prisma.mailOutbox.deleteMany({
        where: { status: "failed", createdAt: { lt: new Date(now.getTime() - FAILED_KEEP_MS) } },
      });
    } finally {
      this.running = false;
    }
  }

  private async deliver(row: ClaimedRow, now: Date): Promise<void> {
    try {
      await this.mail.sendEmail(row.params);
      await this.prisma.mailOutbox.delete({ where: { id: row.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const giveUp = row.attempts >= MAX_ATTEMPTS;
      await this.prisma.mailOutbox
        .update({
          where: { id: row.id },
          data: {
            lastError: message.slice(0, 500),
            ...(giveUp
              ? { status: "failed" }
              : {
                  nextAttemptAt: new Date(now.getTime() + backoffMinutes(row.attempts) * 60_000),
                }),
          },
        })
        .catch((updateError: unknown) => {
          this.logger.warn(
            `Could not record the failure of mail ${row.id}`,
            updateError instanceof Error ? updateError.stack : String(updateError),
          );
        });
      this.logger.warn(
        giveUp
          ? `Mail ${row.id} failed for good after ${row.attempts} attempts`
          : `Mail ${row.id} failed on attempt ${row.attempts} and will be tried again`,
      );
    }
  }
}
