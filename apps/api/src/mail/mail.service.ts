import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

import type { Env } from "../config/env.validation.js";

@Injectable()
export class MailService {
  private readonly client: SESClient;
  private readonly fromEmail?: string;

  constructor(configService: ConfigService<Env, true>) {
    this.client = new SESClient({ region: configService.get<string>("AWS_REGION") });
    this.fromEmail = configService.get<string | undefined>("SES_FROM_EMAIL");
  }

  async sendEmail(params: {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
  }): Promise<void> {
    const from = params.from ?? this.fromEmail;
    if (!from) {
      throw new Error("SES_FROM_EMAIL is not configured");
    }

    await this.client.send(
      new SendEmailCommand({
        Source: from,
        Destination: {
          ToAddresses: Array.isArray(params.to) ? params.to : [params.to],
        },
        Message: {
          Subject: { Data: params.subject },
          Body: { Html: { Data: params.html } },
        },
      }),
    );
  }
}
