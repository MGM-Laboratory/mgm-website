/**
 * Shared IAM vocabulary for the admin panel. This file is client-safe: the
 * studio imports it directly, and the server session lib builds on it.
 */

export const ADMIN_PAGE_IDS = [
  "articles",
  "publications",
  "members",
  "projects",
  "research",
  "careers",
  "contact",
  "contact-inquiries",
  "events",
] as const;

export type AdminPageId = (typeof ADMIN_PAGE_IDS)[number];
export type AdminAction = "read" | "write" | "delete";
export type AdminPermissions = Record<AdminPageId, AdminAction[]>;

export const ACTION_RANK: Record<AdminAction, number> = { read: 1, write: 2, delete: 3 };

const ADMIN_ACTIONS: AdminAction[] = ["read", "write", "delete"];

export const ASSIGNABLE_ACTIONS: Record<AdminPageId, readonly AdminAction[]> = Object.fromEntries(
  ADMIN_PAGE_IDS.map((page) => [page, page === "contact-inquiries" ? ["read"] : ADMIN_ACTIONS]),
) as unknown as Record<AdminPageId, readonly AdminAction[]>;

export const ALL_PERMISSIONS: AdminPermissions = Object.fromEntries(
  ADMIN_PAGE_IDS.map((page) => [page, ["read", "write", "delete"] as AdminAction[]]),
) as AdminPermissions;

export function can(permissions: AdminPermissions, page: AdminPageId, action: AdminAction) {
  return (permissions[page] ?? []).includes(action);
}

/**
 * The permission matrix toggle: enabling an action also enables every weaker
 * one (write implies read, delete implies write), and disabling an action
 * also disables every stronger one (read off clears all three).
 */
export function togglePermission(
  permissions: AdminPermissions,
  page: AdminPageId,
  action: AdminAction,
): AdminPermissions {
  if (!ASSIGNABLE_ACTIONS[page].includes(action)) return permissions;
  const current = permissions[page] ?? [];
  const enabled = current.includes(action);
  const rank = ACTION_RANK[action];
  const next = ADMIN_ACTIONS.filter((candidate) =>
    enabled
      ? current.includes(candidate) && ACTION_RANK[candidate] < rank
      : ACTION_RANK[candidate] <= rank,
  );
  return { ...permissions, [page]: next };
}

/** An admin account as served by the API. Passphrase material never leaves the API. */
export type CmsAdminRecord = {
  slug: string;
  name: string;
  role: "admin";
  active: boolean;
  expiresAt: string | null;
  sessionVersion: number;
  permissions: AdminPermissions;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** The signed-in identity handed to the studio and the /api/admin/me route. */
export type AdminViewer = {
  accountId: string;
  role: "superadmin" | "admin";
  name: string;
  permissions: AdminPermissions;
};
