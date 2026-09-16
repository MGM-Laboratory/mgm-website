import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import {
  ALL_PERMISSIONS,
  type AdminAction,
  type AdminPageId,
  type AdminViewer,
  type CmsAdminRecord,
} from "@/lib/admin-permissions";
import { cmsApi } from "@/lib/cms-api";

const COOKIE_NAME = "mgm_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;
export const SUPERADMIN_ACCOUNT_ID = "superadmin";
const SUPERADMIN_SESSION_VERSION = 1;

function secret() {
  return process.env.ADMIN_PASSPHRASE ?? "";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
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

/**
 * The cookie carries `accountId.sessionVersion.issuedAt.signature` (signature
 * over the first three segments). Account ids are kebab-case slugs or
 * "superadmin" — never dots — so the split is unambiguous.
 */
function parseSessionToken(value: string) {
  const [accountId, sessionVersion, issuedAt, signature] = value.split(".");
  if (!accountId || !sessionVersion || !issuedAt || !signature) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(accountId) || !/^\d+$/.test(sessionVersion)) {
    return null;
  }
  if (!equal(signature, sign(`${accountId}.${sessionVersion}.${issuedAt}`))) return null;
  const issued = Number(issuedAt);
  if (!Number.isFinite(issued) || Date.now() - issued >= MAX_AGE_SECONDS * 1000) return null;
  return { accountId, sessionVersion: Number(sessionVersion), issuedAt: issued };
}

export type AdminSession = AdminViewer;

/**
 * Resolves the signed-in identity. Superadmin sessions are trusted from the
 * cookie alone; admin sessions are re-validated against the API on every
 * request, so revocation, expiry and permission changes take effect without
 * waiting for the cookie to age out.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  // Fail closed: without a configured passphrase the HMAC key would be empty
  // and any visitor could forge a valid-looking session cookie.
  if (!process.env.ADMIN_PASSPHRASE) return null;

  const token = parseSessionToken((await cookies()).get(COOKIE_NAME)?.value ?? "");
  if (!token) return null;

  if (token.accountId === SUPERADMIN_ACCOUNT_ID) {
    if (token.sessionVersion !== SUPERADMIN_SESSION_VERSION) return null;
    return {
      accountId: token.accountId,
      role: "superadmin",
      name: "Superadmin",
      permissions: ALL_PERMISSIONS,
    };
  }

  const response = await cmsApi(`/cms/admins/${encodeURIComponent(token.accountId)}`);
  if (!response.ok) return null;
  const { record } = (await response.json()) as { record?: CmsAdminRecord };
  if (!record || record.role !== "admin") return null;
  if (!record.active) return null;
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return null;
  if (record.sessionVersion !== token.sessionVersion) return null;
  return {
    accountId: record.slug,
    role: "admin",
    name: record.name,
    permissions: record.permissions,
  };
}

export async function hasAdminSession() {
  return Boolean(await getAdminSession());
}

export async function createAdminSession(accountId: string, sessionVersion: number) {
  const issuedAt = String(Date.now());
  const payload = `${accountId}.${sessionVersion}.${issuedAt}`;
  (await cookies()).set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
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

export type PermissionGate =
  { status: 401 } | { status: 403 } | { status: 200; session: AdminSession };

/** RBAC gate for the /api/admin route handlers. */
export async function requireAdminPermission(
  page: AdminPageId,
  action: AdminAction,
): Promise<PermissionGate> {
  const session = await getAdminSession();
  if (!session) return { status: 401 };
  if (session.role === "superadmin") {
    return { status: 200, session };
  }
  const allowedActionsByPage: Record<AdminPageId, AdminAction[]> = {
    "contact-inquiries": ["read"],
  };
  const allowedActions = allowedActionsByPage[page] ?? session.permissions[page] ?? [];
  if (allowedActions.includes(action)) return { status: 200, session };
  return { status: 403 };
}

/** Gate for routes only the superadmin may use, like admin account CRUD. */
export async function requireSuperadmin(): Promise<PermissionGate> {
  const session = await getAdminSession();
  if (!session) return { status: 401 };
  if (session.role !== "superadmin") return { status: 403 };
  return { status: 200, session };
}
