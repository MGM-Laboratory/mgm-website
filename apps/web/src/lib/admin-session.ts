import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "mgm_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret() {
  return process.env.ADMIN_PASSPHRASE ?? "";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function equal(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidPassphrase(value: string) {
  const configured = secret();
  return Boolean(configured) && equal(value, configured);
}

export async function hasAdminSession() {
  // Fail closed: without a configured passphrase the HMAC key would be empty
  // and any visitor could forge a valid-looking session cookie.
  if (!process.env.ADMIN_PASSPHRASE) return false;

  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return false;

  const [issuedAt, signature] = value.split(".");
  if (!issuedAt || !signature || !equal(signature, sign(issuedAt))) return false;
  return Date.now() - Number(issuedAt) < MAX_AGE_SECONDS * 1000;
}

export async function createAdminSession() {
  const issuedAt = String(Date.now());
  (await cookies()).set(COOKIE_NAME, `${issuedAt}.${sign(issuedAt)}`, {
    httpOnly: true,
    maxAge: MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}
