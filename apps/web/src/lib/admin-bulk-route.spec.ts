import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { gateAdminRequest, proxyJson } = vi.hoisted(() => ({
  gateAdminRequest: vi.fn(),
  proxyJson: vi.fn(),
}));

vi.mock("@/lib/admin-proxy", () => ({ gateAdminRequest, proxyJson }));

import { bulkRoute } from "./admin-bulk-route";

const allowed = { ok: true, session: {} };
const forbidden = () => ({
  ok: false,
  response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
});

function post(body: unknown) {
  return new Request("http://localhost/api/admin/bulk", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("bulkRoute", () => {
  const { POST } = bulkRoute("careers", "/cms/jobs/applications/bulk");

  beforeEach(() => {
    gateAdminRequest.mockReset();
    proxyJson.mockReset();
    proxyJson.mockResolvedValue(NextResponse.json({ ok: true }));
  });

  it("lets the write permission change records", async () => {
    gateAdminRequest.mockResolvedValue(allowed);

    const response = await POST(post({ ids: ["a"], action: "archive" }));

    expect(response.status).toBe(200);
    expect(gateAdminRequest).toHaveBeenCalledTimes(1);
    expect(gateAdminRequest).toHaveBeenCalledWith("careers", "write");
    expect(proxyJson).toHaveBeenCalledWith("/cms/jobs/applications/bulk", {
      body: JSON.stringify({ ids: ["a"], action: "archive" }),
      method: "POST",
    });
  });

  it("refuses a delete when the account has write but not delete", async () => {
    gateAdminRequest.mockImplementation(async (_page: string, action: string) =>
      action === "write" ? allowed : forbidden(),
    );

    const response = await POST(post({ ids: ["a"], action: "delete" }));

    expect(response.status).toBe(403);
    expect(gateAdminRequest).toHaveBeenCalledWith("careers", "delete");
    expect(proxyJson).not.toHaveBeenCalled();
  });

  it("lets a delete through for an account with the delete permission", async () => {
    gateAdminRequest.mockResolvedValue(allowed);

    const response = await POST(post({ ids: ["a"], action: "delete" }));

    expect(response.status).toBe(200);
    expect(proxyJson).toHaveBeenCalledOnce();
  });

  it("answers 403 without reading the body when the account has no write permission", async () => {
    gateAdminRequest.mockResolvedValue(forbidden());

    const response = await POST(post("not json"));

    expect(response.status).toBe(403);
    expect(proxyJson).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    gateAdminRequest.mockResolvedValue(allowed);

    const response = await POST(post("not json"));

    expect(response.status).toBe(400);
    expect(proxyJson).not.toHaveBeenCalled();
  });
});
