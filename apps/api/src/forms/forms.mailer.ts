import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  answerToText,
  isAnswered,
  isInputType,
  pipeText,
  type FormAnswerValue,
  type FormAnswers,
  type FormDocument,
} from "@repo/shared";

import type { Env } from "../config/env.validation.js";
import type { FormResponse } from "../generated/prisma/client.js";
import { MailService } from "../mail/mail.service.js";
import { sendConfirmationEmail } from "../mail/send-confirmation-email.js";
import type { FormAnswerRow } from "../mail/templates/form-answers-table.js";
import { buildFormNotificationEmail as formNotificationEmailAsHtml } from "../mail/templates/form-notification-email.js";
import { buildFormReceiptEmail as formReceiptEmailAsHtml } from "../mail/templates/form-receipt-email.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The answered questions in form order, labels piped, values as readable text. */
export function answerRows(
  document: FormDocument,
  answers: FormAnswers,
  options: { includeHidden?: boolean } = {},
): FormAnswerRow[] {
  const rows: FormAnswerRow[] = [];
  for (const field of document.fields) {
    if (!isInputType(field.type)) continue;
    if (field.type === "hidden" && !options.includeHidden) continue;
    const value = answers[field.id] as FormAnswerValue | undefined;
    if (!isAnswered(value)) continue;
    const label = pipeText(field.label, document.fields, answers) || field.prefillParam || field.id;
    rows.push({ label, value: answerToText(field, value, answers) });
  }
  return rows;
}

/**
 * The emails a new response triggers: a notification to each of the form's
 * notify addresses and, when receipts are on, a copy to the respondent.
 * Fire-and-forget: delivery never blocks or fails the submission.
 */
@Injectable()
export class FormsMailer {
  private readonly logger = new Logger(FormsMailer.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  responseReceived(document: FormDocument, response: FormResponse) {
    const settings = document.settings;
    const answers = response.answers as FormAnswers;
    const siteUrl = this.config.get("PUBLIC_WEB_URL") as string;

    if (settings.notifyEmails.length) {
      const html = formNotificationEmailAsHtml({
        formTitle: document.title,
        submittedAt: response.createdAt,
        score: response.score,
        rows: answerRows(document, answers, { includeHidden: true }),
        adminUrl: `${siteUrl.replace(/\/$/, "")}/admin`,
        siteUrl,
      });
      for (const to of settings.notifyEmails) {
        sendConfirmationEmail(this.mail, this.logger, "Form notification email delivery failed", {
          to,
          subject: `New response: ${document.title}`.slice(0, 200),
          html,
        });
      }
    }

    const receipt = settings.receipt;
    if (receipt.enabled && receipt.emailFieldId) {
      const address = answers[receipt.emailFieldId];
      if (typeof address === "string" && EMAIL_PATTERN.test(address.trim())) {
        sendConfirmationEmail(this.mail, this.logger, "Form receipt email delivery failed", {
          to: address.trim(),
          subject: (receipt.subject || `Your response to ${document.title}`).slice(0, 200),
          html: formReceiptEmailAsHtml({
            formTitle: document.title,
            message: receipt.message,
            rows: answerRows(document, answers),
            siteUrl,
          }),
        });
      }
    }
  }
}
