import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { safeEqual } from "../cms/admin-auth.util.js";

const FORMS_ADMIN_PATH = /^\/api\/forms\/admin(?:\/|\?|$)/;

/**
 * Whether the global rate limit should let this request through untouched:
 * only forms admin routes carrying the correct CMS passphrase. The admin
 * workspace reaches the API through the web app's server, so every admin
 * shares that one address, and a response gallery or a files download fires
 * hundreds of requests a minute. Requests with a wrong or missing
 * passphrase stay throttled, so the passphrase can't be guessed faster.
 * Public form routes also arrive with the passphrase (forwarded visitor
 * details are only trusted then) and keep their own per-visitor limits.
 */
export function skipThrottleForFormsAdmin(context: ExecutionContext): boolean {
  if (context.getType() !== "http") return false;
  // A request built outside Express (tests, other adapters) may lack either URL.
  const request = context
    .switchToHttp()
    .getRequest<Partial<Pick<Request, "originalUrl" | "url">> & Pick<Request, "headers">>();
  if (!FORMS_ADMIN_PATH.test(request.originalUrl ?? request.url ?? "")) return false;
  const configured = process.env.ADMIN_PASSPHRASE ?? "";
  const header = request.headers["x-cms-passphrase"];
  const given = typeof header === "string" ? header : "";
  return configured.length > 0 && safeEqual(given, configured);
}
