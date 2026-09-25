// Every /api/admin/** RBAC page id — the vocabulary the web app's permission
// gates and the API's admin-account schema both have to agree on. This list
// drifting out of sync between the two apps (a page added only on the web
// side) is exactly what caused admin creation to 500: the API's zod schema
// rejected the extra permission keys the web form always sends.
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
  "home",
  "links",
  "other",
] as const;

export type AdminPageId = (typeof ADMIN_PAGE_IDS)[number];

export const ADMIN_ACTIONS = ["read", "write", "delete"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type AdminPermissions = Record<AdminPageId, AdminAction[]>;
