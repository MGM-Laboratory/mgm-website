// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsApi } = vi.hoisted(() => ({ cmsApi: vi.fn<(path: string) => Promise<Response>>() }));

vi.mock("@/lib/cms-api", () => ({ cmsApi }));

import { DEFAULT_CONTACT_SETTINGS } from "@repo/shared";

import { fetchContactSettings } from "./contact-settings";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const defaults = {
  address: DEFAULT_CONTACT_SETTINGS.address,
  lat: DEFAULT_CONTACT_SETTINGS.lat,
  lng: DEFAULT_CONTACT_SETTINGS.lng,
  emails: DEFAULT_CONTACT_SETTINGS.emails.slice(0, 1),
};

beforeEach(() => {
  cmsApi.mockReset();
  vi.restoreAllMocks();
});

describe("fetchContactSettings", () => {
  it("shows only the first inbox and the place of a saved record", async () => {
    cmsApi.mockResolvedValue(
      json({
        record: {
          ...DEFAULT_CONTACT_SETTINGS,
          emails: ["a@labmgm.org", "b@labmgm.org"],
          address: "Somewhere",
          lat: 1,
          lng: 2,
          mailStrategy: "failover",
        },
      }),
    );

    expect(await fetchContactSettings()).toEqual({
      address: "Somewhere",
      lat: 1,
      lng: 2,
      emails: ["a@labmgm.org"],
    });
    expect(cmsApi).toHaveBeenCalledWith("/cms/contact-settings");
  });

  it("lifts the legacy single email into the list", async () => {
    const { emails: _emails, ...legacy } = DEFAULT_CONTACT_SETTINGS;
    cmsApi.mockResolvedValue(json({ record: { ...legacy, email: "old@labmgm.org" } }));

    expect((await fetchContactSettings()).emails).toEqual(["old@labmgm.org"]);
  });

  it("falls back to the default for a record that does not parse", async () => {
    cmsApi.mockResolvedValue(json({ record: { emails: "nope" } }));

    expect(await fetchContactSettings()).toEqual(defaults);
  });

  it("falls back to the default without a record", async () => {
    cmsApi.mockResolvedValue(json({}));

    expect(await fetchContactSettings()).toEqual(defaults);
  });

  it("falls back to the default and logs when the API refuses the passphrase", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    for (const status of [401, 403]) {
      cmsApi.mockResolvedValueOnce(json({}, status));
      expect(await fetchContactSettings()).toEqual(defaults);
    }

    expect(error).toHaveBeenCalledTimes(2);
  });

  it("falls back to the default quietly for other failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    cmsApi.mockResolvedValueOnce(json({}, 500));
    expect(await fetchContactSettings()).toEqual(defaults);

    cmsApi.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchContactSettings()).toEqual(defaults);
    expect(error).not.toHaveBeenCalled();
  });
});
