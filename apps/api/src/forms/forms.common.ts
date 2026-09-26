import { HttpException } from "@nestjs/common";
import type { Request } from "express";

import { formDocumentSchema, type FieldError, type FormDocument } from "@repo/shared";

import { safeEqual } from "../cms/admin-auth.util.js";

/** A request the service refuses, with the status the controller answers. */
export class FormsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    /** Per-field answer errors, sent as `{ message, errors }`. */
    readonly errors?: Record<string, FieldError>,
  ) {
    super(message);
    this.name = "FormsError";
  }
}

/** Runs service work, turning its refusals into HTTP errors (everything else stays a 500). */
export async function runForms<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof FormsError) {
      throw new HttpException(
        error.errors ? { message: error.message, errors: error.errors } : error.message,
        error.status,
      );
    }
    throw error;
  }
}

/** An admin's document: validated, defaults filled, 400 naming the first bad path. */
export function parseDocumentInput(value: unknown): FormDocument {
  const parsed = formDocumentSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    const path = issue?.path.length ? `document.${issue.path.join(".")}: ` : "document: ";
    throw new FormsError(`${path}${issue?.message ?? "Invalid form."}`, 400);
  }
  return parsed.data;
}

/**
 * A stored document. It was validated on write; parsing again fills in any
 * default a later version of the schema added. A document an older schema
 * accepted but the current one refuses is still served as stored rather
 * than taking the form down.
 */
export function storedDocument(data: unknown): FormDocument {
  const parsed = formDocumentSchema.safeParse(data);
  return parsed.success ? parsed.data : (data as FormDocument);
}

export type VisitMeta = { ip: string | null; userAgent: string | null; referer: string | null };

/**
 * The visitor's address and client, forwarded by the web app (the only
 * client of the public routes), with the direct-request headers as a
 * fallback, exactly like the short-link click path.
 */
export function visitMeta(req: Request): VisitMeta {
  const headers = new Map(Object.entries(req.headers));
  const header = (name: string) => {
    const value = headers.get(name);
    return typeof value === "string" && value ? value : undefined;
  };
  const firstForwarded = (value: string | undefined) =>
    value ? value.split(",")[0].trim() || null : null;
  const ip =
    firstForwarded(header("x-visitor-ip")) ??
    firstForwarded(header("cf-connecting-ip")) ??
    firstForwarded(header("x-forwarded-for")) ??
    req.ip ??
    null;
  return {
    ip,
    userAgent: header("x-visitor-user-agent") ?? header("user-agent") ?? null,
    referer: header("x-visitor-referer") ?? header("referer") ?? null,
  };
}

/**
 * The throttle key of a public forms request. Every browser request reaches
 * the API through the web app's server, so `req.ip` alone would put every
 * respondent in one bucket; the forwarded visitor address is used instead,
 * but only when the request proves it comes from the web app (the same
 * server credential its CMS calls carry), so a direct caller can't dodge
 * the limit by inventing addresses.
 */
export function visitorTracker(req: Record<string, unknown>): string {
  // The throttler hands over the raw request; nothing guarantees its headers.
  const request = req as Partial<Pick<Request, "headers" | "ip">>;
  const configured = process.env.ADMIN_PASSPHRASE ?? "";
  const presented = request.headers?.["x-cms-passphrase"];
  const forwarded = request.headers?.["x-visitor-ip"];
  if (
    configured &&
    typeof presented === "string" &&
    safeEqual(presented, configured) &&
    typeof forwarded === "string" &&
    forwarded.trim()
  ) {
    return `visitor:${forwarded.split(",")[0].trim()}`;
  }
  return request.ip ?? "unknown";
}
