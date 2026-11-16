import { describe, expect, it } from "vitest";

import {
  ACTION_RANK,
  ADMIN_PAGE_IDS,
  ALL_PERMISSIONS,
  ASSIGNABLE_ACTIONS,
  can,
  togglePermission,
  type AdminPermissions,
} from "./admin-permissions";

function none(): AdminPermissions {
  return Object.fromEntries(
    ADMIN_PAGE_IDS.map((page) => [page, []]),
  ) as unknown as AdminPermissions;
}

describe("constants", () => {
  it("ranks the actions from weakest to strongest", () => {
    expect(ACTION_RANK).toEqual({ read: 1, write: 2, delete: 3 });
  });

  it("lets every page take every action except the contact inbox, which is read only", () => {
    for (const page of ADMIN_PAGE_IDS) {
      expect(ASSIGNABLE_ACTIONS[page]).toEqual(
        page === "contact-inquiries" ? ["read"] : ["read", "write", "delete"],
      );
      expect(ALL_PERMISSIONS[page]).toEqual(["read", "write", "delete"]);
    }
  });
});

describe("can", () => {
  it("checks an action on a page", () => {
    const permissions = { ...none(), articles: ["read", "write"] } as AdminPermissions;

    expect(can(permissions, "articles", "write")).toBe(true);
    expect(can(permissions, "articles", "delete")).toBe(false);
    expect(can(permissions, "members", "read")).toBe(false);
  });

  it("treats a missing page entry as no access", () => {
    expect(can({} as AdminPermissions, "articles", "read")).toBe(false);
  });
});

describe("togglePermission", () => {
  it("turns on every weaker action with the one asked for", () => {
    expect(togglePermission(none(), "articles", "delete").articles).toEqual([
      "read",
      "write",
      "delete",
    ]);
    expect(togglePermission(none(), "articles", "write").articles).toEqual(["read", "write"]);
    expect(togglePermission(none(), "articles", "read").articles).toEqual(["read"]);
  });

  it("turns off every stronger action with the one removed", () => {
    expect(togglePermission(ALL_PERMISSIONS, "articles", "read").articles).toEqual([]);
    expect(togglePermission(ALL_PERMISSIONS, "articles", "write").articles).toEqual(["read"]);
    expect(togglePermission(ALL_PERMISSIONS, "articles", "delete").articles).toEqual([
      "read",
      "write",
    ]);
  });

  it("leaves the other pages alone and does not change the input", () => {
    const before = none();
    const after = togglePermission(before, "articles", "read");

    expect(after.members).toEqual([]);
    expect(before.articles).toEqual([]);
  });

  it("refuses an action the page cannot take", () => {
    const permissions = none();

    expect(togglePermission(permissions, "contact-inquiries", "write")).toBe(permissions);
    expect(togglePermission(permissions, "contact-inquiries", "read")["contact-inquiries"]).toEqual(
      ["read"],
    );
  });

  it("starts from nothing for a page without an entry", () => {
    expect(togglePermission({} as AdminPermissions, "articles", "write").articles).toEqual([
      "read",
      "write",
    ]);
  });
});
