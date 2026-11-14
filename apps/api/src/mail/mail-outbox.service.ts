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
import { withTimeout } from "./with-timeout.js";

/** The mail that the outbox keeps, in the shape that `MailService.sendEmail` takes. */
export type OutboxMail = Parameters<MailService["sendEmail"]>[0];

const TICK_MS = 60 * 1000;
// One run claims one row at a time, up to this many. The lease of a claim is 5
// minutes (see the SQL of `claimOne`), which is far above the longest send, so
// a claimed row is never taken by the other copy while its send is running.
const MAX_PER_RUN = 10;
// Minutes to wait after the first, second, third failure and so on. The last
// value repeats until MAX_ATTEMPTS.
const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720];
const MAX_ATTEMPTS = 8;
const FAILED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const SENT_KEEP_MS = 24 * 60 * 60 * 1000;
const SHUTDOWN_WAIT_MS = 25 * 1000;

type ClaimedRow = { id: string; params: unknown; attempts: number };

/** Minutes until the next try after the given number of failed attempts. */
export function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1];
}

function parseParams(value: unknown): OutboxMail {
  return (typeof value === "string" ? JSON.parse(value) : value) as OutboxMail;
}

/**
 * A mail that survives a provider outage. `enqueue` stores it, and a claim with
 * a lease hands each row to one API copy at a time (`FOR UPDATE SKIP LOCKED`),
 * so two copies do not send the same row while a send runs. A send that fails
 * is tried again later with a growing wait, up to MAX_ATTEMPTS. A send that
 * timed out may have been delivered, so a retry can deliver a second copy. The
 * same holds when a copy dies between the send and the delete of the row.
 */
@Injectable()
export class MailOutboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MailOutboxService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;
  private current: Promise<void> | undefined;

  /** The clock of the backoff and of the cleanup. A test sets it, and Nest never injects it. */
  now: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => this.kick(), TICK_MS);
    this.timer.unref();
  }

  /** Stops the timer and gives a send that is running time to finish and delete its row. */
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.current) {
      await withTimeout(this.current, SHUTDOWN_WAIT_MS, "Mail outbox run").catch(() => undefined);
    }
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

  /** Claims due rows one at a time and delivers each. Runs do not overlap in one copy. */
  async processDue(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    this.current = this.run();
    try {
      await this.current;
    } finally {
      this.running = false;
      this.current = undefined;
    }
  }

  private async run(): Promise<void> {
    for (let sent = 0; sent < MAX_PER_RUN && !this.stopping; sent += 1) {
      const row = await this.claimOne();
      if (!row) break;
      await this.deliver(row);
    }
    const now = this.now().getTime();
    await this.prisma.mailOutbox.deleteMany({
      where: {
        OR: [
          { status: "failed", createdAt: { lt: new Date(now - FAILED_KEEP_MS) } },
          { status: "sent", createdAt: { lt: new Date(now - SENT_KEEP_MS) } },
        ],
      },
    });
  }

  // The time comes from the database, in UTC like the stored column, so the
  // two copies share one clock and no date is bound as a parameter.
  private async claimOne(): Promise<ClaimedRow | undefined> {
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "MailOutbox"
      SET "attempts" = "attempts" + 1,
          "nextAttemptAt" = (now() AT TIME ZONE 'UTC') + interval '5 minutes'
      WHERE "id" = (
        SELECT "id" FROM "MailOutbox"
        WHERE "status" = 'pending' AND "nextAttemptAt" <= (now() AT TIME ZONE 'UTC')
        ORDER BY "nextAttemptAt"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "params", "attempts"
    `;
    return rows[0];
  }

  private async deliver(row: ClaimedRow): Promise<void> {
    try {
      await this.mail.sendEmail(parseParams(row.params));
    } catch (error) {
      await this.recordFailure(row, error);
      return;
    }
    // The mail is out. Whatever happens to the row from here, it must not be
    // sent again, so a failed delete is not a failed send.
    try {
      await this.prisma.mailOutbox.delete({ where: { id: row.id } });
    } catch (error) {
      this.logger.warn(
        `Mail ${row.id} was sent but its row could not be removed`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.mailOutbox
        .update({ where: { id: row.id }, data: { status: "sent" } })
        .catch(() => undefined);
    }
  }

  private async recordFailure(row: ClaimedRow, error: unknown): Promise<void> {
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
                nextAttemptAt: new Date(
                  this.now().getTime() + backoffMinutes(row.attempts) * 60_000,
                ),
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
