import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

import type { Env } from "../config/env.validation.js";

@Injectable()
export class MailService {
  private readonly client: SESClient;
  private readonly resend?: Resend;
  private readonly smtpTransport?: Transporter;
  private readonly fromEmail?: string;

  constructor(configService: ConfigService<Env, true>) {
    this.client = new SESClient({ region: configService.get<string>("AWS_REGION") });

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

  async sendEmail(params: {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
  }): Promise<void> {
    const from = params.from ?? this.fromEmail;
    if (!from) {
      throw new Error("SES_FROM_EMAIL is not configured");
    }

    if (this.resend) {
      const { error } = await this.resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
      });
      if (error) {
        throw new Error(`Resend: ${error.message}`);
      }
      return;
    }

    if (this.smtpTransport) {
      await this.smtpTransport.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
      });
      return;
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
        ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
      }),
    );
  }
}
