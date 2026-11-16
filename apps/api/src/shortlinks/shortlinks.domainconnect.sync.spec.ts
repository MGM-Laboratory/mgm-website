// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveCloudflareSync } from "./shortlinks.domainconnect.js";

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("resolveCloudflareSync", () => {
  it("uses the sync URL that Cloudflare publishes for the first matching zone", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ urlSyncUX: "https://dash.example.net/sync" }),
    });
    const result = await resolveCloudflareSync("go.mgm.li", "https://fallback.example.net");
    expect(result).toEqual({ syncUrl: "https://dash.example.net/sync", zone: "mgm.li" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v2/go.mgm.li/settings");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v2/mgm.li/settings");
  });

  it("falls back to the configured sync URL when the settings omit one", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await resolveCloudflareSync("mgm.li", "https://fallback.example.net");
    expect(result).toEqual({ syncUrl: "https://fallback.example.net", zone: "mgm.li" });
  });

  it("moves on to the next zone candidate when a request throws", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockRejectedValueOnce(new Error("refused"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await resolveCloudflareSync("go.mgm.li", "https://fallback.example.net");
    expect(result.zone).toBe("mgm.li");
  });

  it("returns the hostname as the zone when no candidate answers", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: false });
    const result = await resolveCloudflareSync("go.mgm.li", "https://fallback.example.net");
    expect(result).toEqual({ syncUrl: "https://fallback.example.net", zone: "go.mgm.li" });
  });
});
