import { BOOT_SCRIPT } from "@/components/loader/boot";

/**
 * The pre-paint boot script, for the root layout's `<head>` (`boot.ts`).
 * A constant string, nothing from the request: it runs while the browser
 * parses the head, before the body paints. On the client React renders it
 * as inert `text/plain`, so it never runs twice and never warns.
 */
export function BootScript() {
  return (
    <script
      id="mgm-boot"
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: /*safe*/ BOOT_SCRIPT }}
    />
  );
}
