import { BRAND, escapeHtml } from "./email-shell.js";

/** One answered question, already rendered as text. */
export type FormAnswerRow = { label: string; value: string };

/**
 * The answers block shared by the form notification and receipt emails: a
 * label over each answer, every value escaped, line breaks kept.
 */
export function renderFormAnswersTable(rows: readonly FormAnswerRow[]): string {
  if (!rows.length) {
    return `<p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:${BRAND.ink3};">No answers were given.</p>`;
  }
  const cells = rows
    .map(
      (row, index) => `
        <tr>
          <td style="padding:14px 22px;${index ? `border-top:1px solid ${BRAND.line};` : ""}font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.ink3};">
              ${escapeHtml(row.label)}
            </p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(row.value).replaceAll("\n", "<br />")}</p>
          </td>
        </tr>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background-color:${BRAND.surfaceMuted};border-left:4px solid ${BRAND.blue};border-radius:12px;">
      ${cells}
    </table>`;
}
