function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// MGM Laboratory brand tokens (see /DESIGN_SYSTEM.md) inlined as plain hex -
// email clients don't resolve CSS custom properties, so this deliberately
// doesn't import from globals.css/Tailwind config.
const BRAND = {
  blue: "#3a6dc5",
  yellow: "#f7bf33",
  red: "#f94141",
  green: "#0f8657",
  ink: "#0e1116",
  ink2: "#3b4150",
  ink3: "#6b7280",
  line: "#ececea",
  surfaceMuted: "#f7f7f5",
} as const;

// Mirrors apps/web/src/data/nav.ts's NAV_SOCIALS - that file duplicates the
// same three links locally too (see cta-footer.tsx), so this keeps the
// existing repo convention rather than introducing a new shared import for
// three static URLs.
const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/labmgmfilkomub/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/mgmlab" },
  { label: "Discord", href: "https://discord.gg/h7PTA7XCq4" },
] as const;

const ADDRESS_LINES = [
  "Faculty of Computer Science, Building F Room F10.5 and F10.6",
  "Veteran Street No. 8, Malang, 65145, Indonesia",
];

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
  const origin = siteUrl.replace(/\/$/, "");
  const logoUrl = `${origin}/logo-email.png`;
  const patternUrl = `${origin}/pattern-x-email.png`;
  const safeName = escapeHtml(name);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>We've received your message - MGM Laboratory</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.surfaceMuted};-webkit-text-size-adjust:100%;text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Thanks for reaching out, ${safeName} - we've received your message and will get back to you soon.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.surfaceMuted};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid ${BRAND.line};">
            <!-- Brand stripe -->
            <tr>
              <td style="height:6px;line-height:6px;font-size:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:${BRAND.blue};width:25%;height:6px;font-size:0;line-height:6px;">&nbsp;</td>
                    <td style="background-color:${BRAND.yellow};width:25%;height:6px;font-size:0;line-height:6px;">&nbsp;</td>
                    <td style="background-color:${BRAND.green};width:25%;height:6px;font-size:0;line-height:6px;">&nbsp;</td>
                    <td style="background-color:${BRAND.red};width:25%;height:6px;font-size:0;line-height:6px;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Header -->
            <tr>
              <td align="center" style="padding:36px 40px 20px 40px;">
                <img src="${logoUrl}" width="56" height="56" alt="MGM Laboratory" style="display:block;border:0;outline:none;" />
                <p style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.blue};">
                  MGM Laboratory
                </p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:8px 40px 8px 40px;font-family:Arial,Helvetica,sans-serif;">
                <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.ink};">
                  Hi ${safeName}, we&rsquo;ve got your message.
                </h1>
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

                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:10px;background-color:${BRAND.blue};">
                      <a href="${origin}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                        Visit our website
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 40px 0 40px;">
                <img src="${patternUrl}" width="28" height="28" alt="" style="display:block;border:0;outline:none;opacity:0.5;" />
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 40px 36px 40px;background-color:${BRAND.surfaceMuted};font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:${BRAND.ink};">
                  MGM Laboratory
                </p>
                <p style="margin:0 0 14px 0;font-size:12px;line-height:1.6;color:${BRAND.ink3};">
                  ${ADDRESS_LINES.map(escapeHtml).join("<br />")}
                </p>
                <p style="margin:0 0 14px 0;font-size:12px;">
                  ${SOCIAL_LINKS.map(
                    (social) =>
                      `<a href="${social.href}" style="color:${BRAND.blue};text-decoration:none;font-weight:700;margin-right:14px;">${social.label}</a>`,
                  ).join("")}
                </p>
                <p style="margin:0;font-size:11px;color:${BRAND.ink3};">
                  &copy; ${year} MGM Laboratory. This is an automated confirmation - you&rsquo;re
                  receiving it because this address was used to submit our contact form.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
