import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailProviderId } from "@repo/shared";

import { MailService } from "./mail.service.js";
import { OutcomeUnknownError } from "./with-timeout.js";

type Settings = Record<string, unknown>;

const BASE_SETTINGS: Settings = {
  AWS_REGION: "us-east-1",
  SES_FROM_EMAIL: "noreply@example.org",
  SMTP_SECURE: false,
};

type PrismaStub = ReturnType<typeof makePrisma>;

function makePrisma() {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    mailSendLog: {
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: "log-1" })),
    },
  };
  return {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    mailProviderUsage: {
      findUniqueOrThrow: vi.fn(async () => ({
        dailyRemaining: 5,
        dailyResetAt: new Date("2030-01-02T00:00:00Z"),
        longRemaining: 50,
        longResetAt: new Date("2030-02-01T00:00:00Z"),
      })),
      update: vi.fn(async (..._args: unknown[]) => ({})),
      updateMany: vi.fn(async (..._args: unknown[]) => ({ count: 1 })),
      upsert: vi.fn(async (..._args: unknown[]) => ({})),
    },
    mailRoutingState: { upsert: vi.fn(async () => ({ value: 1 })) },
    mailSendLog: {
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: "log-2" })),
      delete: vi.fn(async () => ({})),
      deleteMany: vi.fn(async (..._args: unknown[]) => ({ count: 0 })),
    },
    tx,
  };
}

type Internals = {
  client: { send: ReturnType<typeof vi.fn> };
  resend?: { emails: { send: ReturnType<typeof vi.fn> } };
  smtpTransport?: { sendMail: ReturnType<typeof vi.fn> };
};

function makeService(settings: Settings = {}, prisma: PrismaStub = makePrisma()) {
  const merged = { ...BASE_SETTINGS, ...settings };
  const config = { get: (key: string) => merged[key] };
  const service = new MailService(config as never, prisma as never);
  const internals = service as unknown as Internals;
  let smtpOptions: Record<string, unknown> | undefined;
  internals.client = { send: vi.fn(async () => ({})) };
  if (internals.resend) {
    internals.resend = {
      emails: { send: vi.fn(async () => ({ data: { id: "r1" }, error: null })) },
    };
  }
  if (internals.smtpTransport) {
    smtpOptions = (internals.smtpTransport as unknown as { options: Record<string, unknown> })
      .options;
    internals.smtpTransport = { sendMail: vi.fn(async () => ({})) };
  }
  return { service, prisma, internals, smtpOptions };
}

const MAIL = { html: "<p>hi</p>", subject: "Hello", to: "a@example.org" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("MailService constructor", () => {
  it("joins the from name and address when both exist", async () => {
    const { service, internals } = makeService({ MAIL_FROM_NAME: "MGM Lab" });
    await service.sendEmail({ ...MAIL, strategy: "ses" });
    const command = internals.client.send.mock.calls[0][0] as {
      input: { Source: string };
    };
    expect(command.input.Source).toBe("MGM Lab <noreply@example.org>");
  });

  it("uses the bare address when no from name is set", async () => {
    const { service, internals } = makeService();
    await service.sendEmail({ ...MAIL, strategy: "ses" });
    const command = internals.client.send.mock.calls[0][0] as {
      input: { Source: string };
    };
    expect(command.input.Source).toBe("noreply@example.org");
  });

  it("builds the SMTP transport with credentials and a default port", () => {
    const { smtpOptions } = makeService({
      SMTP_HOST: "smtp.example.org",
      SMTP_PASSWORD: "pw",
      SMTP_USER: "user",
    });
    expect(smtpOptions).toMatchObject({ auth: { pass: "pw", user: "user" }, port: 587 });
  });

  it("builds the SMTP transport without auth when the credentials are missing", () => {
    const { smtpOptions } = makeService({ SMTP_HOST: "smtp.example.org", SMTP_PORT: 2525 });
    expect(smtpOptions?.port).toBe(2525);
    expect(smtpOptions?.auth).toBeUndefined();
  });
});

describe("MailService.sendEmail", () => {
  it("rejects when no sender is configured", async () => {
    const { service } = makeService({ SES_FROM_EMAIL: undefined });
    await expect(service.sendEmail(MAIL)).rejects.toThrow("SES_FROM_EMAIL is not configured");
  });

  it("lets a caller override the sender", async () => {
    const { service, internals } = makeService({ SES_FROM_EMAIL: undefined });
    await service.sendEmail({ ...MAIL, from: "other@example.org", strategy: "ses" });
    const command = internals.client.send.mock.calls[0][0] as { input: { Source: string } };
    expect(command.input.Source).toBe("other@example.org");
  });

  it("rejects when a single-provider strategy names an unconfigured provider", async () => {
    const { service } = makeService();
    await expect(service.sendEmail({ ...MAIL, strategy: "resend" })).rejects.toThrow(
      "No mail provider is available",
    );
    await expect(service.sendEmail({ ...MAIL, strategy: "smtp" })).rejects.toThrow(
      "No mail provider is available",
    );
  });

  it("rejects when the order holds only unconfigured providers", async () => {
    const { service } = makeService();
    await expect(service.sendEmail({ ...MAIL, providerOrder: ["resend", "smtp"] })).rejects.toThrow(
      "No mail provider is available",
    );
  });

  it("sends through Resend with the reply to and array recipients", async () => {
    const { service, internals } = makeService({ RESEND_API_KEY: "key" });
    await service.sendEmail({
      ...MAIL,
      replyTo: "reply@example.org",
      strategy: "resend",
      to: ["a@example.org", "b@example.org"],
    });
    expect(internals.resend?.emails.send).toHaveBeenCalledWith({
      from: "noreply@example.org",
      html: "<p>hi</p>",
      replyTo: "reply@example.org",
      subject: "Hello",
      to: ["a@example.org", "b@example.org"],
    });
  });

  it("treats a Resend error object as a failure and falls back to the next provider", async () => {
    const { service, internals } = makeService({
      RESEND_API_KEY: "key",
      SMTP_HOST: "smtp.example.org",
    });
    internals.resend?.emails.send.mockResolvedValue({ data: null, error: { message: "bad key" } });
    await service.sendEmail({ ...MAIL, providerOrder: ["resend", "smtp"] });
    expect(internals.smtpTransport?.sendMail).toHaveBeenCalledTimes(1);
  });

  it("sends through SMTP", async () => {
    const { service, internals } = makeService({ SMTP_HOST: "smtp.example.org" });
    await service.sendEmail({ ...MAIL, replyTo: "r@example.org", strategy: "smtp" });
    expect(internals.smtpTransport?.sendMail).toHaveBeenCalledWith({
      from: "noreply@example.org",
      html: "<p>hi</p>",
      replyTo: "r@example.org",
      subject: "Hello",
      to: "a@example.org",
    });
  });

  it("sends through SES with a wrapped recipient and a reply to address", async () => {
    const { service, internals } = makeService();
    await service.sendEmail({ ...MAIL, replyTo: "r@example.org", strategy: "ses" });
    const command = internals.client.send.mock.calls[0][0] as {
      input: {
        Destination: { ToAddresses: string[] };
        ReplyToAddresses?: string[];
        Message: { Subject: { Data: string } };
      };
    };
    expect(command.input.Destination.ToAddresses).toEqual(["a@example.org"]);
    expect(command.input.ReplyToAddresses).toEqual(["r@example.org"]);
    expect(command.input.Message.Subject.Data).toBe("Hello");
  });

  it("passes an array of SES recipients through and leaves the reply to unset", async () => {
    const { service, internals } = makeService();
    await service.sendEmail({ ...MAIL, strategy: "ses", to: ["a@example.org", "b@example.org"] });
    const command = internals.client.send.mock.calls[0][0] as {
      input: { Destination: { ToAddresses: string[] }; ReplyToAddresses?: string[] };
    };
    expect(command.input.Destination.ToAddresses).toHaveLength(2);
    expect(command.input.ReplyToAddresses).toBeUndefined();
  });

  it("collects every provider failure in the final error", async () => {
    const { service, internals } = makeService({ SMTP_HOST: "smtp.example.org" });
    internals.smtpTransport?.sendMail.mockRejectedValue(new Error("smtp down"));
    internals.client.send.mockRejectedValue("ses string failure");
    await expect(service.sendEmail({ ...MAIL, providerOrder: ["smtp", "ses"] })).rejects.toThrow(
      "All mail providers failed: smtp: smtp down; ses: ses string failure",
    );
  });

  it("does not account usage when no limit is configured", async () => {
    const { service, prisma } = makeService();
    await service.sendEmail({ ...MAIL, strategy: "ses" });
    expect(prisma.mailProviderUsage.upsert).not.toHaveBeenCalled();
    expect(prisma.mailSendLog.create).not.toHaveBeenCalled();
  });

  it("records a rolling send after delivery", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { service, prisma } = makeService();
    await service.sendEmail({
      ...MAIL,
      limits: { ses: { dailyLimit: 10, windowMode: "rolling" } },
      strategy: "ses",
    });
    expect(prisma.mailSendLog.create).toHaveBeenCalledWith({ data: { provider: "ses" } });
    expect(prisma.mailSendLog.deleteMany).not.toHaveBeenCalled();
  });

  it("sometimes cleans old rolling log rows after a send", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const { service, prisma } = makeService();
    await service.sendEmail({
      ...MAIL,
      limits: { ses: { dailyLimit: 10, windowMode: "rolling" } },
      strategy: "ses",
    });
    const call = prisma.mailSendLog.deleteMany.mock.calls[0][0] as {
      where: { provider: string; sentAt: { lt: Date } };
    };
    expect(call.where.provider).toBe("ses");
    expect(call.where.sentAt.lt.getTime()).toBeLessThan(Date.now() - 30 * 24 * 3600 * 1000);
  });

  it("decrements calendar usage after delivery for both limits", async () => {
    const { service, prisma } = makeService();
    await service.sendEmail({
      ...MAIL,
      limits: {
        ses: { dailyLimit: 10, longLimit: 100, longPeriod: "monthly", windowMode: "calendar" },
      },
      strategy: "ses",
    });
    expect(prisma.mailProviderUsage.update).toHaveBeenCalledWith({
      data: { dailyRemaining: { decrement: 1 }, longRemaining: { decrement: 1 } },
      where: { provider: "ses" },
    });
  });

  it("does not fail the send when the usage accounting throws", async () => {
    const { service, prisma } = makeService();
    prisma.mailProviderUsage.update.mockRejectedValue(new Error("db down"));
    const errorLog = vi
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, "error")
      .mockImplementation(() => undefined);
    await expect(
      service.sendEmail({
        ...MAIL,
        limits: { ses: { dailyLimit: 10, windowMode: "calendar" } },
        strategy: "ses",
      }),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      "Mail provider ses could not record delivered message",
      expect.any(String),
    );
  });

  it("logs a non Error accounting failure as a string", async () => {
    const { service, prisma } = makeService();
    prisma.mailProviderUsage.update.mockRejectedValue("plain failure");
    const errorLog = vi
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, "error")
      .mockImplementation(() => undefined);
    await service.sendEmail({
      ...MAIL,
      limits: { ses: { dailyLimit: 10, windowMode: "calendar" } },
      strategy: "ses",
    });
    expect(errorLog).toHaveBeenCalledWith(expect.any(String), "plain failure");
  });
});

describe("MailService routing strategies", () => {
  it("keeps the order for failover and skips providers that are not configured", async () => {
    const { service, internals } = makeService({ SMTP_HOST: "smtp.example.org" });
    await service.sendEmail({
      ...MAIL,
      providerOrder: ["resend", "smtp", "ses"],
      strategy: "failover",
    });
    expect(internals.smtpTransport?.sendMail).toHaveBeenCalledTimes(1);
    expect(internals.client.send).not.toHaveBeenCalled();
  });

  it("rotates the order for equal load balancing from the stored counter", async () => {
    const { service, internals, prisma } = makeService({ SMTP_HOST: "smtp.example.org" });
    prisma.mailRoutingState.upsert.mockResolvedValue({ value: 1 });
    await service.sendEmail({
      ...MAIL,
      providerOrder: ["smtp", "ses"],
      strategy: "loadBalanceEqual",
    });
    expect(internals.client.send).toHaveBeenCalledTimes(1);
    expect(internals.smtpTransport?.sendMail).not.toHaveBeenCalled();
  });

  it("skips the counter when only one provider is configured", async () => {
    const { service, prisma } = makeService();
    await service.sendEmail({ ...MAIL, providerOrder: ["ses"], strategy: "loadBalanceEqual" });
    expect(prisma.mailRoutingState.upsert).not.toHaveBeenCalled();
  });

  it("picks a provider by weight and keeps the others as fallbacks", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { service, internals } = makeService({ SMTP_HOST: "smtp.example.org" });
    await service.sendEmail({
      ...MAIL,
      providerOrder: ["smtp", "ses"],
      strategy: "loadBalanceWeighted",
      weights: { ses: 3, smtp: 1 },
    });
    expect(internals.client.send).toHaveBeenCalledTimes(1);
    expect(internals.smtpTransport?.sendMail).not.toHaveBeenCalled();
  });

  it("picks the first provider when the roll is low", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { service, internals } = makeService({ SMTP_HOST: "smtp.example.org" });
    await service.sendEmail({
      ...MAIL,
      providerOrder: ["smtp", "ses"],
      strategy: "loadBalanceWeighted",
      weights: { ses: 1, smtp: 1 },
    });
    expect(internals.smtpTransport?.sendMail).toHaveBeenCalledTimes(1);
  });

  it("falls back to the plain order when every weight is zero", async () => {
    const { service, internals } = makeService({ SMTP_HOST: "smtp.example.org" });
    await service.sendEmail({
      ...MAIL,
      providerOrder: ["smtp", "ses"],
      strategy: "loadBalanceWeighted",
      weights: { ses: 0, smtp: 0 },
    });
    expect(internals.smtpTransport?.sendMail).toHaveBeenCalledTimes(1);
  });

  it("does not reorder a single weighted provider", async () => {
    const { service, internals } = makeService();
    await service.sendEmail({
      ...MAIL,
      providerOrder: ["ses"],
      strategy: "loadBalanceWeighted",
    });
    expect(internals.client.send).toHaveBeenCalledTimes(1);
  });
});

describe("MailService loadBalanceLimit quota", () => {
  const send = (service: MailService, limits: Record<string, unknown>, order?: MailProviderId[]) =>
    service.sendEmail({
      ...MAIL,
      limits: limits as never,
      providerOrder: order ?? ["ses"],
      strategy: "loadBalanceLimit",
    });

  it("treats a provider without a limit as unlimited and records nothing", async () => {
    const { service, prisma } = makeService();
    await send(service, {});
    expect(prisma.mailProviderUsage.updateMany).not.toHaveBeenCalled();
    expect(prisma.mailSendLog.create).not.toHaveBeenCalled();
  });

  it("reserves a calendar unit with one conditional decrement for each limit", async () => {
    const { service, prisma } = makeService();
    await send(service, { ses: { dailyLimit: 10, longLimit: 100, windowMode: "calendar" } });
    const reserve = prisma.mailProviderUsage.updateMany.mock.calls.find(
      ([arg]) =>
        (arg as { data: Record<string, unknown> }).data.dailyRemaining !== undefined &&
        (arg as { where: { AND?: unknown } }).where.AND !== undefined,
    )?.[0] as { data: unknown; where: { AND: unknown[]; provider: string } };
    expect(reserve.data).toEqual({
      dailyRemaining: { decrement: 1 },
      longRemaining: { decrement: 1 },
    });
    expect(reserve.where.AND).toEqual([
      { dailyRemaining: { gt: 0 } },
      { longRemaining: { gt: 0 } },
    ]);
    // The reservation is the usage record, so the post send accounting is skipped.
    expect(prisma.mailProviderUsage.update).not.toHaveBeenCalled();
  });

  it("reports the limit as reached and tries the next provider", async () => {
    const { service, prisma, internals } = makeService({ SMTP_HOST: "smtp.example.org" });
    prisma.mailProviderUsage.updateMany.mockImplementation(async (arg: unknown) => {
      const where = (arg as { where: { AND?: unknown; provider: string } }).where;
      // Reservation calls carry AND, and the init and reset calls carry OR.
      return { count: where.AND && where.provider === "smtp" ? 0 : 1 };
    });
    await send(service, { smtp: { dailyLimit: 1 }, ses: { dailyLimit: 5 } }, ["smtp", "ses"]);
    expect(internals.smtpTransport?.sendMail).not.toHaveBeenCalled();
    expect(internals.client.send).toHaveBeenCalledTimes(1);
  });

  it("fails with the limit message when every provider is at its limit", async () => {
    const { service, prisma } = makeService();
    prisma.mailProviderUsage.updateMany.mockResolvedValue({ count: 0 });
    await expect(send(service, { ses: { longLimit: 5 } })).rejects.toThrow(
      "ses: configured send limit reached",
    );
  });

  it("releases a calendar reservation when delivery fails", async () => {
    const { service, prisma, internals } = makeService();
    internals.client.send.mockRejectedValue(new Error("refused"));
    await expect(
      send(service, { ses: { dailyLimit: 10, longLimit: 100, windowMode: "calendar" } }),
    ).rejects.toThrow("refused");
    const releases = prisma.mailProviderUsage.updateMany.mock.calls
      .map(([arg]) => arg as { data: Record<string, { increment?: number }> })
      .filter((arg) => arg.data.dailyRemaining?.increment || arg.data.longRemaining?.increment);
    expect(releases).toHaveLength(2);
  });

  it("keeps the reservation when the send timed out, since it may have been delivered", async () => {
    const { service, prisma, internals } = makeService();
    internals.client.send.mockRejectedValue(new OutcomeUnknownError("timeout"));
    await expect(send(service, { ses: { dailyLimit: 10 } })).rejects.toThrow("timeout");
    const releases = prisma.mailProviderUsage.updateMany.mock.calls.filter(
      ([arg]) =>
        (arg as { data: { dailyRemaining?: { increment?: number } } }).data.dailyRemaining
          ?.increment,
    );
    expect(releases).toHaveLength(0);
  });

  it("logs and goes on when releasing the reservation fails", async () => {
    const { service, prisma, internals } = makeService();
    internals.client.send.mockRejectedValue(new Error("refused"));
    prisma.mailProviderUsage.updateMany.mockImplementation(async (arg: unknown) => {
      const data = (arg as { data: Record<string, { increment?: number }> }).data;
      if (data.dailyRemaining?.increment) throw new Error("release failed");
      return { count: 1 };
    });
    const errorLog = vi
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, "error")
      .mockImplementation(() => undefined);
    await expect(send(service, { ses: { dailyLimit: 10 } })).rejects.toThrow("refused");
    expect(errorLog).toHaveBeenCalledWith(
      "Mail provider ses could not release quota reservation",
      expect.any(String),
    );
  });

  it("serializes a rolling reservation in a transaction with an advisory lock", async () => {
    const { service, prisma } = makeService();
    await send(service, { ses: { dailyLimit: 10, longLimit: 100, windowMode: "rolling" } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.tx.mailSendLog.count).toHaveBeenCalledTimes(2);
    expect(prisma.tx.mailSendLog.create).toHaveBeenCalledWith({
      data: { provider: "ses" },
      select: { id: true },
    });
  });

  it("refuses a rolling reservation when the daily window is full", async () => {
    const { service, prisma } = makeService();
    prisma.tx.mailSendLog.count.mockResolvedValue(10);
    await expect(send(service, { ses: { dailyLimit: 10, windowMode: "rolling" } })).rejects.toThrow(
      "ses: configured send limit reached",
    );
    expect(prisma.tx.mailSendLog.create).not.toHaveBeenCalled();
  });

  it("refuses a rolling reservation when only the long window is full", async () => {
    const { service, prisma } = makeService();
    prisma.tx.mailSendLog.count.mockResolvedValueOnce(1).mockResolvedValueOnce(100);
    await expect(
      send(service, { ses: { dailyLimit: 10, longLimit: 100, windowMode: "rolling" } }),
    ).rejects.toThrow("configured send limit reached");
    expect(prisma.tx.mailSendLog.create).not.toHaveBeenCalled();
  });

  it("deletes the rolling log row when delivery fails", async () => {
    const { service, prisma, internals } = makeService();
    internals.client.send.mockRejectedValue(new Error("refused"));
    await expect(send(service, { ses: { dailyLimit: 10, windowMode: "rolling" } })).rejects.toThrow(
      "refused",
    );
    expect(prisma.mailSendLog.delete).toHaveBeenCalledWith({ where: { id: "log-1" } });
  });

  it("does nothing to release an unlimited reservation", async () => {
    const { service, prisma, internals } = makeService();
    internals.client.send.mockRejectedValue(new Error("refused"));
    await expect(send(service, {})).rejects.toThrow("refused");
    expect(prisma.mailSendLog.delete).not.toHaveBeenCalled();
    expect(prisma.mailProviderUsage.updateMany).not.toHaveBeenCalled();
  });

  it("only releases the limit that was configured for a calendar reservation", async () => {
    const { service, prisma, internals } = makeService();
    internals.client.send.mockRejectedValue(new Error("refused"));
    await expect(send(service, { ses: { longLimit: 5 } })).rejects.toThrow("refused");
    const releases = prisma.mailProviderUsage.updateMany.mock.calls
      .map(([arg]) => arg as { data: Record<string, { increment?: number }> })
      .filter((arg) => arg.data.longRemaining?.increment || arg.data.dailyRemaining?.increment);
    expect(releases).toHaveLength(1);
    expect(releases[0].data.longRemaining?.increment).toBe(1);
  });
});

describe("MailService.getStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T10:00:00Z"));
  });

  it("reports configuration flags without limits", async () => {
    const { service } = makeService({
      AWS_ACCESS_KEY_ID: "id",
      RESEND_API_KEY: "key",
      SMTP_HOST: undefined,
    });
    const status = await service.getStatus({});
    expect(status.fromEmailConfigured).toBe(true);
    expect(status.providers).toEqual({
      resend: { configured: true },
      ses: { configured: true },
      smtp: { configured: false },
    });
  });

  it("reports SES as not configured without an explicit access key", async () => {
    const { service } = makeService({ SES_FROM_EMAIL: undefined });
    const status = await service.getStatus({});
    expect(status.fromEmailConfigured).toBe(false);
    expect(status.providers.ses.configured).toBe(false);
  });

  it("reports calendar quota from the stored usage row", async () => {
    const { service } = makeService({ SMTP_HOST: "smtp.example.org" });
    const status = await service.getStatus({
      smtp: { dailyLimit: 10, longLimit: 100, longPeriod: "monthly", windowMode: "calendar" },
    });
    expect(status.providers.smtp).toMatchObject({
      configured: true,
      dailyLimit: 10,
      dailyRemaining: 5,
      longLimit: 100,
      longPeriod: "monthly",
      longRemaining: 50,
      windowMode: "calendar",
    });
  });

  it("falls back to the full limit when the usage row has no remaining count", async () => {
    const { service, prisma } = makeService();
    prisma.mailProviderUsage.findUniqueOrThrow.mockResolvedValue({
      dailyRemaining: null as never,
      dailyResetAt: null as never,
      longRemaining: null as never,
      longResetAt: null as never,
    });
    const status = await service.getStatus({
      ses: { dailyLimit: 10, longLimit: 100, windowMode: "calendar" },
    });
    expect(status.providers.ses).toMatchObject({ dailyRemaining: 10, longRemaining: 100 });
  });

  it("resets the calendar windows on a 30 day cadence and on month boundaries", async () => {
    const { service, prisma } = makeService();
    await service.getStatus({
      ses: { dailyLimit: 10, longLimit: 100, longPeriod: "30day", windowMode: "calendar" },
    });
    await service.getStatus({
      ses: { dailyLimit: 10, longLimit: 100, longPeriod: "monthly", windowMode: "calendar" },
    });
    const upserts = prisma.mailProviderUsage.upsert.mock.calls.map(
      ([arg]) => (arg as { create: { dailyResetAt: Date; longResetAt: Date } }).create,
    );
    expect(upserts[0].dailyResetAt.toISOString()).toBe("2030-01-02T00:00:00.000Z");
    expect(upserts[0].longResetAt.toISOString()).toBe("2030-01-31T10:00:00.000Z");
    expect(upserts[1].longResetAt.toISOString()).toBe("2030-02-01T00:00:00.000Z");
  });

  it("seeds a new usage row from the configured remaining counts", async () => {
    const { service, prisma } = makeService();
    await service.getStatus({
      ses: {
        dailyLimit: 10,
        dailyRemaining: 3,
        longLimit: 100,
        longRemaining: 40,
        windowMode: "calendar",
      },
    });
    const create = (
      prisma.mailProviderUsage.upsert.mock.calls[0][0] as {
        create: { dailyRemaining: number; longRemaining: number };
      }
    ).create;
    expect(create.dailyRemaining).toBe(3);
    expect(create.longRemaining).toBe(40);
  });

  it("counts rolling usage from the send log", async () => {
    const { service, prisma } = makeService();
    prisma.mailSendLog.count.mockResolvedValueOnce(4).mockResolvedValueOnce(30);
    const status = await service.getStatus({
      ses: { dailyLimit: 10, longLimit: 100, longPeriod: "30day", windowMode: "rolling" },
    });
    expect(status.providers.ses).toMatchObject({
      dailyRemaining: 6,
      longRemaining: 70,
      windowMode: "rolling",
    });
  });

  it("never reports a negative rolling remainder", async () => {
    const { service, prisma } = makeService();
    prisma.mailSendLog.count.mockResolvedValue(500);
    const status = await service.getStatus({
      ses: { dailyLimit: 10, windowMode: "rolling" },
    });
    expect(status.providers.ses.dailyRemaining).toBe(0);
  });

  it("skips quota queries for a provider whose limits are both unset", async () => {
    const { service, prisma } = makeService();
    const status = await service.getStatus({ ses: { windowMode: "calendar" } });
    expect(status.providers.ses.windowMode).toBeUndefined();
    expect(prisma.mailProviderUsage.upsert).not.toHaveBeenCalled();
  });
});
