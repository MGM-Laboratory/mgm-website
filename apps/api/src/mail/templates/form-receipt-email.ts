import { BRAND, escapeHtml, renderEmailShell } from "./email-shell.js";
import { renderFormAnswersTable, type FormAnswerRow } from "./form-answers-table.js";

/**
 * A respondent's copy of their answers, sent when the form turns receipts
 * on. The admin's message (plain text) leads, then the answers.
 */
export function buildFormReceiptEmail({
  formTitle,
  message,
  rows,
  siteUrl,
}: {
  formTitle: string;
  message?: string;
  rows: readonly FormAnswerRow[];
  siteUrl: string;
}): string {
  const safeTitle = escapeHtml(formTitle);
  const intro = message?.trim()
    ? escapeHtml(message.trim()).replaceAll("\n", "<br />")
    : `Thanks for responding to <strong style="color:${BRAND.ink};">${safeTitle}</strong>. Here is a copy of your answers.`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">${intro}</p>
    ${renderFormAnswersTable(rows)}
    <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      Keep this email for your records.
    </p>
  `;

  return renderEmailShell({
    title: `Your response: ${safeTitle}`,
    previewText: `A copy of your answers to ${safeTitle}.`,
    heading: `Your response to ${safeTitle}`,
    bodyHtml,
    ctaLabel: "Visit MGM Laboratory",
    ctaHref: siteUrl.replace(/\/$/, ""),
    siteUrl,
  });
}
