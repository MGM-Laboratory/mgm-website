import { afterEach, describe, expect, it, vi } from "vitest";

import { enrichVisit, lookupGeo } from "./shortlinks.geo.js";

const fetchMock = vi.fn();

function answer(body: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function stub() {
  vi.stubGlobal("fetch", fetchMock);
}

describe("lookupGeo", () => {
  it("skips addresses that are not routable without calling the provider", async () => {
    stub();
    for (const ip of [
      "::1",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.1.1",
      "0.0.0.0",
      "224.0.0.1",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "999.1.1.1",
      "not:an:ip",
    ]) {
      expect(await lookupGeo(ip)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a successful provider answer and encodes the address", async () => {
    stub();
    answer({
      city: "Malang",
      country: "Indonesia",
      latitude: -7.9,
      longitude: 112.6,
      region: "East Java",
      success: true,
      timezone: { id: "Asia/Jakarta" },
    });
    const geo = await lookupGeo("2001:db8::7");
    expect(geo).toEqual({
      city: "Malang",
      country: "Indonesia",
      latitude: -7.9,
      longitude: 112.6,
      region: "East Java",
      timezone: "Asia/Jakarta",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://ipwho.is/2001%3Adb8%3A%3A7");
  });

  it("answers repeat lookups from the cache", async () => {
    stub();
    answer({ country: "Indonesia", success: true });
    const first = await lookupGeo("203.0.113.50");
    const second = await lookupGeo("203.0.113.50");
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null for a provider that says it failed or has no country", async () => {
    stub();
    answer({ success: false });
    expect(await lookupGeo("203.0.113.51")).toBeNull();
    answer({ success: true });
    expect(await lookupGeo("203.0.113.52")).toBeNull();
  });

  it("returns null for a non 2xx answer", async () => {
    stub();
    answer({ country: "x", success: true }, false);
    expect(await lookupGeo("203.0.113.53")).toBeNull();
  });

  it("returns null and caches the miss when the provider throws", async () => {
    stub();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await lookupGeo("203.0.113.54")).toBeNull();
    expect(await lookupGeo("203.0.113.54")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest entry when the cache is full", async () => {
    stub();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    for (let index = 0; index < 5001; index += 1) {
      await lookupGeo(`8.${index >> 8}.${index & 255}.1`);
    }
    expect(fetchMock).toHaveBeenCalledTimes(5001);
    // The first address was evicted, so it is fetched again, the last one is still cached.
    await lookupGeo("8.0.0.1");
    expect(fetchMock).toHaveBeenCalledTimes(5002);
    await lookupGeo(`8.${5000 >> 8}.${5000 & 255}.1`);
    expect(fetchMock).toHaveBeenCalledTimes(5002);
  });
});

describe("enrichVisit", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it("does nothing without an address", async () => {
    stub();
    const prisma = { shortLinkVisit: { update: vi.fn() } };
    enrichVisit(prisma as never, "visit-1", null);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.shortLinkVisit.update).not.toHaveBeenCalled();
  });

  it("stores the geolocation on the visit row", async () => {
    stub();
    answer({ country: "Indonesia", success: true });
    const prisma = { shortLinkVisit: { update: vi.fn(async () => ({})) } };
    enrichVisit(prisma as never, "visit-1", "203.0.113.60");
    await flush();
    expect(prisma.shortLinkVisit.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ country: "Indonesia" }),
      where: { id: "visit-1" },
    });
  });

  it("leaves the row alone when the lookup finds nothing", async () => {
    stub();
    answer({ success: false });
    const prisma = { shortLinkVisit: { update: vi.fn() } };
    enrichVisit(prisma as never, "visit-1", "203.0.113.61");
    await flush();
    expect(prisma.shortLinkVisit.update).not.toHaveBeenCalled();
  });

  it("swallows an update of a visit row that no longer exists", async () => {
    stub();
    answer({ country: "Indonesia", success: true });
    const prisma = {
      shortLinkVisit: { update: vi.fn(async () => Promise.reject(new Error("gone"))) },
    };
    enrichVisit(prisma as never, "visit-1", "203.0.113.62");
    await flush();
    expect(prisma.shortLinkVisit.update).toHaveBeenCalledTimes(1);
  });
});
