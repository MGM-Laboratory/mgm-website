import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsApi } = vi.hoisted(() => ({ cmsApi: vi.fn() }));

vi.mock("@/lib/cms-api", () => ({ apiBaseUrl: () => "http://api.test/api", cmsApi }));
vi.mock("@/lib/admin-session", () => ({
  requireAdminPermission: vi.fn(),
  requireSuperadmin: vi.fn(),
}));

import { detailRoute } from "./admin-proxy";
import { EXPECTED_VERSION_HEADER, versionedJsonHeaders } from "./record-version";

const allowed = async () => ({ ok: true as const, session: {} as never });
const context = { params: Promise.resolve({ slug: "post" }) };

function put(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/articles/post", {
    body: JSON.stringify({ article: { slug: "post" } }),
    headers,
    method: "PUT",
  });
}

describe("detailRoute PUT", () => {
  const { PUT } = detailRoute(allowed, allowed, (slug) => `/cms/articles/${slug}`);

  beforeEach(() => {
    cmsApi.mockReset();
    cmsApi.mockResolvedValue(Response.json({ ok: true }));
  });

  it("forwards the version of the record that the editor loaded", async () => {
    await PUT(put({ [EXPECTED_VERSION_HEADER]: "2026-11-14T05:00:00.000Z" }), context);
    expect(cmsApi).toHaveBeenCalledWith("/cms/articles/post", {
      body: JSON.stringify({ article: { slug: "post" } }),
      headers: { [EXPECTED_VERSION_HEADER]: "2026-11-14T05:00:00.000Z" },
      method: "PUT",
    });
  });

  it("sends no version header when the editor sent none", async () => {
    await PUT(put(), context);
    expect(cmsApi.mock.calls[0]?.[1]).toMatchObject({ headers: undefined, method: "PUT" });
  });

  it("passes the 409 of the API on to the editor with its message", async () => {
    cmsApi.mockResolvedValue(
      NextResponse.json({ message: "Someone else saved this record." }, { status: 409 }),
    );
    const response = await PUT(
      put({ [EXPECTED_VERSION_HEADER]: "2026-11-14T05:00:00.000Z" }),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Someone else saved this record." });
  });
});

describe("versionedJsonHeaders", () => {
  it("adds the version header only when a version is known", () => {
    expect(versionedJsonHeaders()).toEqual({ "content-type": "application/json" });
    expect(versionedJsonHeaders("2026-11-14T05:00:00.000Z")).toEqual({
      "content-type": "application/json",
      [EXPECTED_VERSION_HEADER]: "2026-11-14T05:00:00.000Z",
    });
  });
});
