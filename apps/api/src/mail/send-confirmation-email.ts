import type { Logger } from "@nestjs/common";

import type { MailService } from "./mail.service.js";

/**
 * Fires a best-effort confirmation email without blocking the caller's
 * response - a delivery failure must never turn an already-persisted
 * submission into a failed request, and the caller shouldn't wait on a
 * slow/unavailable provider before responding. Logged failures exclude the
 * raw error message (only the stack, for diagnosis) to avoid leaking
 * transport detail into aggregated logs.
 */
export function sendConfirmationEmail(
  mail: MailService,
  logger: Logger,
  failureMessage: string,
  params: Parameters<MailService["sendEmail"]>[0],
): void {
  void mail.sendEmail(params).catch((error: unknown) => {
    logger.warn(failureMessage, error instanceof Error ? error.stack : String(error));
  });
}
