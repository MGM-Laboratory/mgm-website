import { BRAND, escapeHtml, renderEmailShell } from "./email-shell.js";

/**
 * Builds a self-contained, table-based HTML email confirming a job
 * application. Shares the same brand shell as the contact confirmation -
 * see email-shell.ts for the Outlook-safe inlined-style rationale.
 */
export function buildJobApplicationConfirmationEmail({
  name,
  jobTitle,
  siteUrl,
}: {
  name: string;
  jobTitle: string;
  siteUrl: string;
}): string {
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(jobTitle);
  const careersUrl = `${siteUrl.replace(/\/$/, "")}/careers`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      Thanks for applying to MGM Laboratory. Your application for the role below has
      been received and routed to our team - please kindly wait while we review it.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background-color:${BRAND.surfaceMuted};border-left:4px solid ${BRAND.blue};border-radius:12px;">
      <tr>
        <td style="padding:20px 22px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.ink3};">
            Role
          </p>
          <p style="margin:0;font-size:15px;font-weight:700;color:${BRAND.ink};">${safeTitle}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      We review every application carefully, so it may take some time to hear back.
      Feel free to reply directly to this email if there&rsquo;s anything you&rsquo;d like
      to add.
    </p>
  `;

  return renderEmailShell({
    title: `We've received your application - MGM Laboratory`,
    previewText: `Hi ${safeName}, we've received your application for ${safeTitle}.`,
    heading: `Hi ${safeName}, we&rsquo;ve got your application.`,
    bodyHtml,
    ctaLabel: "See open roles",
    ctaHref: careersUrl,
    siteUrl,
  });
}
