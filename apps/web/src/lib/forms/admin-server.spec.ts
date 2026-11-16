import { beforeEach, describe, expect, it, vi } from "vitest";

const cmsApi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cms-api", () => ({ cmsApi }));

import { fetchFormsAdminList } from "./admin-server";

beforeEach(() => {
  cmsApi.mockReset();
});

describe("fetchFormsAdminList", () => {
  it("returns the forms of the admin list", async () => {
    const forms = [{ id: "a" }, { id: "b" }];
    cmsApi.mockResolvedValue({ ok: true, json: async () => ({ forms }) });
    await expect(fetchFormsAdminList()).resolves.toBe(forms);
    expect(cmsApi).toHaveBeenCalledWith("/forms/admin");
  });

  it("returns an empty list when the API answers with an error or without forms", async () => {
    cmsApi.mockResolvedValue({ ok: false, json: async () => ({ forms: [{ id: "a" }] }) });
    await expect(fetchFormsAdminList()).resolves.toEqual([]);
    cmsApi.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(fetchFormsAdminList()).resolves.toEqual([]);
  });
});
