import { Injectable } from "@nestjs/common";
import type { ContactFormPayload } from "@repo/shared";

import { CmsContactSettingsService } from "../cms/cms-contact-settings.service.js";
import { MailService } from "../mail/mail.service.js";
import { StorageService } from "../storage/storage.service.js";

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
  constructor(
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly settings: CmsContactSettingsService,
  ) {}

  async send(payload: ContactFormPayload): Promise<void> {
    const attachmentKeys = payload.attachmentKeys ?? [];
    const attachmentLines = await Promise.all(
      attachmentKeys.map(async (key) => {
        try {
          const url = await this.storage.getSignedDownloadUrl(key, 60 * 60 * 24 * 7);
          return `<li><a href="${url}">${escapeHtml(key)}</a></li>`;
        } catch {
          return `<li>${escapeHtml(key)} (stored locally — not reachable outside this environment)</li>`;
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

    const { email: recipient } = await this.settings.get();

    await this.mail.sendEmail({
      to: recipient,
      subject: `New contact form message from ${payload.name}`,
      html,
      replyTo: payload.email,
    });
  }
}
