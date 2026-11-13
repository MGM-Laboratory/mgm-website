import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ContactFormPayload } from "@repo/shared";
import type { Prisma } from "../generated/prisma/client.js";

import { CmsContactInquiriesService } from "../cms/cms-contact-inquiries.service.js";
import { CmsContactSettingsService } from "../cms/cms-contact-settings.service.js";
import { MailOutboxService } from "../mail/mail-outbox.service.js";
import { MailService } from "../mail/mail.service.js";
import { sendConfirmationEmail } from "../mail/send-confirmation-email.js";
import { StorageService } from "../storage/storage.service.js";
import { buildContactConfirmationEmail } from "../mail/templates/contact-confirmation-email.js";
import type { Env } from "../config/env.validation.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mail: MailService,
    private readonly outbox: MailOutboxService,
    private readonly storage: StorageService,
    private readonly settings: CmsContactSettingsService,
    private readonly inquiries: CmsContactInquiriesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Persists a contact inquiry, then queues the notification mail to the
   * configured recipient in the outbox, which delivers it through the saved
   * routing strategy and tries again later when every provider fails. The
   * visitor never waits for the mail and never sees a mail error.
   */
  async send(payload: ContactFormPayload): Promise<void> {
    const attachmentKeys = payload.attachmentKeys ?? [];

    // Persisted unconditionally, before the email is even attempted - the
    // inquiry must never be lost to an email provider outage, since this is
    // the only guaranteed record of the submission.
    await this.inquiries.create({
      inquiry: {
        name: payload.name,
        email: payload.email,
        company: payload.company ?? null,
        message: payload.message,
        attachmentKeys,
        read: false,
        readAt: null,
        status: "inbox",
      },
    } as unknown as Prisma.InputJsonValue);

    const attachmentLines = await Promise.all(
      attachmentKeys.map(async (key) => {
        try {
          const url = await this.storage.getSignedDownloadUrl(key, 60 * 60 * 24 * 7);
          return `<li><a href="${url}">${escapeHtml(key)}</a></li>`;
        } catch {
          return `<li>${escapeHtml(key)} (stored locally - not reachable outside this environment)</li>`;
        }
      }),
    );

    const html = `
      <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
      ${payload.company ? `<p><strong>Company:</strong> ${escapeHtml(payload.company)}</p>` : ""}
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(payload.message).replaceAll("\n", "<br />")}</p>
      ${attachmentLines.length ? `<p><strong>Attachments:</strong></p><ul>${attachmentLines.join("")}</ul>` : ""}
    `;

    const settings = await this.settings.get();

    try {
      await this.outbox.enqueue({
        to: settings.emails,
        subject: `New contact form message from ${payload.name}`,
        html,
        replyTo: payload.email,
        strategy: settings.mailStrategy,
        providerOrder: settings.mailProviderOrder,
        weights: settings.mailProviderWeights,
        limits: settings.mailProviderLimits,
      });
      this.outbox.kick();
    } catch (error) {
      // The inquiry is stored, and the inbox of the admin workspace shows it.
      this.logger.error(
        "Could not queue the contact notification mail",
        error instanceof Error ? error.stack : String(error),
      );
    }

    // Fire-and-forget: never block the response on mail delivery. A
    // missing/misconfigured provider must never surface as a failed
    // submission - the inquiry is already safely stored above, and the
    // notification to the lab is queued above. This confirmation is a
    // courtesy, not the source of truth.
    sendConfirmationEmail(this.mail, this.logger, "Confirmation email delivery failed", {
      to: payload.email,
      subject: "We've received your message - MGM Laboratory",
      html: buildContactConfirmationEmail({
        name: payload.name,
        message: payload.message,
        siteUrl: this.config.get("PUBLIC_WEB_URL"),
      }),
      strategy: settings.mailStrategy,
      providerOrder: settings.mailProviderOrder,
      weights: settings.mailProviderWeights,
      limits: settings.mailProviderLimits,
    });
  }
}
