import { BRAND, escapeHtml, renderEmailShell } from "./email-shell.js";
import { renderFormAnswersTable, type FormAnswerRow } from "./form-answers-table.js";

/**
 * Tells a form's admins about a new response: the form, when it came in,
 * the score when the form is scored, every answer, and a link to the admin
 * workspace. Same brand shell as the other transactional emails.
 */
export function buildFormNotificationEmail({
  formTitle,
  submittedAt,
  score,
  rows,
  adminUrl,
  siteUrl,
}: {
  formTitle: string;
  submittedAt: Date;
  score: number | null;
  rows: readonly FormAnswerRow[];
  adminUrl: string;
  siteUrl: string;
}): string {
  const safeTitle = escapeHtml(formTitle);
  const when = escapeHtml(`${submittedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`);
  const scoreLine =
    score === null
      ? ""
      : ` Score: <strong style="color:${BRAND.ink};">${escapeHtml(String(score))}</strong>.`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      Someone just responded to <strong style="color:${BRAND.ink};">${safeTitle}</strong>
      (${when}).${scoreLine}
    </p>
    ${renderFormAnswersTable(rows)}
    <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      Every response, with its files and analytics, is in the Forms workspace.
    </p>
  `;

  return renderEmailShell({
    title: `New response: ${safeTitle}`,
    previewText: `A new response to ${safeTitle} just came in.`,
    heading: `New response to ${safeTitle}`,
    bodyHtml,
    ctaLabel: "Open the Forms workspace",
    ctaHref: escapeHtml(adminUrl),
    siteUrl,
  });
}
