import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactService } from "./contact.service.js";

const SETTINGS = {
  emails: ["lab@example.org"],
  mailProviderLimits: { ses: { dailyLimit: 5 } },
  mailProviderOrder: ["smtp", "ses"],
  mailProviderWeights: { smtp: 2 },
  mailStrategy: "failover",
};

function make() {
  const mail = { sendEmail: vi.fn(async (..._args: unknown[]) => undefined) };
  const outbox = { enqueue: vi.fn(async (..._args: unknown[]) => undefined), kick: vi.fn() };
  const storage = {
    getSignedDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
  };
  const settings = { get: vi.fn(async () => SETTINGS) };
  const inquiries = { create: vi.fn(async () => undefined) };
  const config = { get: () => "https://site.example.org" };
  const service = new ContactService(
    mail as never,
    outbox as never,
    storage as never,
    settings as never,
    inquiries as never,
    config as never,
  );
  return { inquiries, mail, outbox, service, settings, storage };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContactService.send", () => {
  it("stores the inquiry first, with null for an absent company", async () => {
    const { inquiries, service } = make();
    await service.send({ email: "a@example.org", message: "hello", name: "Ayu" });
    expect(inquiries.create).toHaveBeenCalledWith({
      inquiry: {
        attachmentKeys: [],
        company: null,
        email: "a@example.org",
        message: "hello",
        name: "Ayu",
        read: false,
        readAt: null,
        status: "inbox",
      },
    });
  });

  it("does not queue or send anything when storing the inquiry fails", async () => {
    const { inquiries, mail, outbox, service } = make();
    inquiries.create.mockRejectedValue(new Error("db down"));
    await expect(service.send({ email: "a@example.org", message: "m", name: "n" })).rejects.toThrow(
      "db down",
    );
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it("queues an escaped notification with the routing settings and kicks the outbox", async () => {
    const { outbox, service } = make();
    await service.send({
      company: "Acme <Co>",
      email: "a@example.org",
      message: "line one\n<img src=\"x\" onerror='y'> & more",
      name: "<b>Ayu</b>",
    });
    const job = outbox.enqueue.mock.calls[0][0] as Record<string, unknown> & { html: string };
    expect(job).toMatchObject({
      limits: SETTINGS.mailProviderLimits,
      providerOrder: SETTINGS.mailProviderOrder,
      replyTo: "a@example.org",
      strategy: "failover",
      subject: "New contact form message from <b>Ayu</b>",
      to: ["lab@example.org"],
      weights: SETTINGS.mailProviderWeights,
    });
    expect(job.html).toContain("&lt;b&gt;Ayu&lt;/b&gt;");
    expect(job.html).toContain("Acme &lt;Co&gt;");
    expect(job.html).toContain(
      "line one<br />&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt; &amp; more",
    );
    expect(job.html).not.toContain("<img");
    expect(job.html).not.toContain("Attachments:");
    expect(outbox.kick).toHaveBeenCalledTimes(1);
  });

  it("leaves the company line out when there is none", async () => {
    const { outbox, service } = make();
    await service.send({ email: "a@example.org", message: "m", name: "n" });
    expect((outbox.enqueue.mock.calls[0][0] as { html: string }).html).not.toContain("Company:");
  });

  it("links each attachment with a week long URL and marks an unreachable one", async () => {
    const { outbox, service, storage } = make();
    storage.getSignedDownloadUrl.mockImplementation(async (key: string) => {
      if (key === "bad<key>") throw new Error("no bucket");
      return `https://signed.example/${key}`;
    });
    await service.send({
      attachmentKeys: ["good-key", "bad<key>"],
      email: "a@example.org",
      message: "m",
      name: "n",
    });
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith("good-key", 604_800);
    const html = (outbox.enqueue.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('<a href="https://signed.example/good-key">good-key</a>');
    expect(html).toContain(
      "bad&lt;key&gt; (stored locally - not reachable outside this environment)",
    );
  });

  it("logs and goes on when the queue fails, so the visitor still gets a confirmation", async () => {
    const { mail, outbox, service } = make();
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    outbox.enqueue.mockRejectedValue(new Error("queue down"));
    await expect(
      service.send({ email: "a@example.org", message: "m", name: "n" }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "Could not queue the contact notification mail",
      expect.stringContaining("queue down"),
    );
    expect(outbox.kick).not.toHaveBeenCalled();
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("logs a non Error queue failure as a string", async () => {
    const { outbox, service } = make();
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    outbox.enqueue.mockRejectedValue("plain");
    await service.send({ email: "a@example.org", message: "m", name: "n" });
    expect(error).toHaveBeenCalledWith(expect.any(String), "plain");
  });

  it("sends the confirmation to the visitor with the same routing settings", async () => {
    const { mail, service } = make();
    await service.send({ email: "a@example.org", message: "hello", name: "Ayu" });
    const params = mail.sendEmail.mock.calls[0][0] as Record<string, unknown> & { html: string };
    expect(params).toMatchObject({
      limits: SETTINGS.mailProviderLimits,
      providerOrder: SETTINGS.mailProviderOrder,
      strategy: "failover",
      subject: "We've received your message - MGM Laboratory",
      to: "a@example.org",
      weights: SETTINGS.mailProviderWeights,
    });
    expect(params.html).toContain("Hi Ayu");
  });

  it("does not fail the submission when the confirmation fails", async () => {
    const { mail, service } = make();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mail.sendEmail.mockRejectedValue(new Error("smtp down"));
    await expect(
      service.send({ email: "a@example.org", message: "m", name: "n" }),
    ).resolves.toBeUndefined();
    await flush();
    expect(warn).toHaveBeenCalledWith("Confirmation email delivery failed", expect.any(String));
  });
});
