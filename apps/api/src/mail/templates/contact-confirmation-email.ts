import { BRAND, escapeHtml, renderEmailShell } from "./email-shell.js";

/**
 * Builds a self-contained, table-based HTML email confirming a contact-form
 * submission. Every style is inlined (no <style> dependency for the layout
 * itself - Outlook's Word engine ignores <style> blocks for anything but a
 * handful of properties) so it renders consistently across desktop and
 * mobile mail clients.
 */
export function buildContactConfirmationEmail({
  name,
  message,
  siteUrl,
}: {
  name: string;
  message: string;
  siteUrl: string;
}): string {
  const safeName = escapeHtml(name);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      Thanks for reaching out to MGM Laboratory. Your message has been received and
      routed to our team - please kindly wait while we review it and get back to you.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background-color:${BRAND.surfaceMuted};border-left:4px solid ${BRAND.blue};border-radius:12px;">
      <tr>
        <td style="padding:20px 22px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.ink3};">
            Your message
          </p>
          <p style="margin:0;font-size:14px;line-height:1.7;color:${BRAND.ink};">${safeMessage}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px 0;font-size:15px;line-height:1.65;color:${BRAND.ink2};">
      We typically reply within 1&ndash;2 business days. Feel free to reply directly to
      this email if there&rsquo;s anything you&rsquo;d like to add.
    </p>
  `;

  return renderEmailShell({
    title: "We've received your message - MGM Laboratory",
    previewText: `Thanks for reaching out, ${safeName} - we've received your message and will get back to you soon.`,
    heading: `Hi ${safeName}, we&rsquo;ve got your message.`,
    bodyHtml,
    ctaLabel: "Visit our website",
    ctaHref: siteUrl.replace(/\/$/, ""),
    siteUrl,
  });
}
