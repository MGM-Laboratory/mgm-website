import { describe, expect, it } from "vitest";

import { MailService } from "./mail.service.js";

function makeService() {
  const settings: Record<string, unknown> = {
    AWS_REGION: "us-east-1",
    SMTP_HOST: "smtp.example.org",
    SMTP_SECURE: false,
  };
  const config = { get: (key: string) => settings[key] };
  return new MailService(config as never, {} as never);
}

describe("mail client limits", () => {
  it("makes one SES attempt, because the failover is the retry", async () => {
    const service = makeService() as unknown as {
      client: { config: { maxAttempts: () => Promise<number> } };
    };
    expect(await service.client.config.maxAttempts()).toBe(1);
  });

  it("gives the SMTP transport its three time limits", () => {
    const service = makeService() as unknown as {
      smtpTransport: { options: Record<string, unknown> };
    };
    expect(service.smtpTransport.options).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  });
});
