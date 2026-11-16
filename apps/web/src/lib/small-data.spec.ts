import { describe, expect, it } from "vitest";

import { COUNTRY_CODES, DEFAULT_COUNTRY, countryFlag } from "./country-codes";
import { homeVideoSource, homeVideoUrl } from "./home-cms";
import { EXPECTED_VERSION_HEADER, versionedJsonHeaders } from "./record-version";
import { UB_FACULTIES } from "./ub-faculties";
import { cn } from "./utils";

describe("country codes", () => {
  it("builds a flag from the country code in any case", () => {
    expect(countryFlag("ID")).toBe("\u{1F1EE}\u{1F1E9}");
    expect(countryFlag("us")).toBe("\u{1F1FA}\u{1F1F8}");
  });

  it("leads with Indonesia as the default and lists each code with a dial prefix", () => {
    expect(DEFAULT_COUNTRY).toEqual({ code: "ID", name: "Indonesia", dial: "+62" });
    expect(COUNTRY_CODES[0]).toBe(DEFAULT_COUNTRY);
    for (const country of COUNTRY_CODES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.dial).toMatch(/^\+\d{1,3}$/);
    }
  });

  it("lists each country once", () => {
    const codes = COUNTRY_CODES.map((country) => country.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("home video", () => {
  it("builds the playback url of an uploaded key", () => {
    expect(homeVideoUrl()).toBeUndefined();
    expect(homeVideoUrl("a b/c.mp4")).toBe("/api/home-cms/video/a%20b%2Fc.mp4");
  });

  it("plays only an uploaded video", () => {
    expect(homeVideoSource({ videoMode: "upload", videoKey: "k.mp4" })).toBe(
      "/api/home-cms/video/k.mp4",
    );
    expect(homeVideoSource({ videoMode: "upload" })).toBeUndefined();
    expect(homeVideoSource({ videoMode: "none", videoKey: "k.mp4" })).toBeUndefined();
  });
});

describe("versionedJsonHeaders", () => {
  it("sends the loaded version when there is one", () => {
    expect(versionedJsonHeaders("2025-01-01T00:00:00.000Z")).toEqual({
      "content-type": "application/json",
      [EXPECTED_VERSION_HEADER]: "2025-01-01T00:00:00.000Z",
    });
  });

  it("sends no version header for a new record", () => {
    expect(versionedJsonHeaders()).toEqual({ "content-type": "application/json" });
    expect(versionedJsonHeaders("")).toEqual({ "content-type": "application/json" });
  });
});

describe("UB_FACULTIES", () => {
  it("pins FILKOM first and lists each faculty once", () => {
    expect(UB_FACULTIES[0]).toContain("FILKOM");
    expect(new Set(UB_FACULTIES).size).toBe(UB_FACULTIES.length);
  });
});

describe("cn", () => {
  it("joins class names and lets the later Tailwind class win", () => {
    expect(cn("p-2", false && "hidden", "text-sm")).toBe("p-2 text-sm");
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("a", { b: true, c: false }, ["d"])).toBe("a b d");
  });
});
