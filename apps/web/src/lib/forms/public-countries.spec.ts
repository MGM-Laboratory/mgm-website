// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest";

import { countries, countryByCode, matchCountry } from "./public-countries";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("countries", () => {
  it("lists every country with a name and a calling code, sorted by name", () => {
    const list = countries();
    expect(list.length).toBeGreaterThan(240);
    expect(new Set(list.map((country) => country.code)).size).toBe(list.length);
    for (const country of list) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.dial).toMatch(/^\+\d{1,4}$/);
    }
    const names = list.map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(countryByCode("ID")).toEqual({ code: "ID", dial: "+62", name: "Indonesia" });
  });

  it("caches a language and names countries in it", () => {
    expect(countries("en")).toBe(countries("en"));
    expect(countryByCode("DE", "de")?.name).toBe("Deutschland");
    expect(countryByCode("DE", "en")?.name).toBe("Germany");
  });

  it("falls back to codes when the names are unavailable", () => {
    vi.spyOn(Intl, "DisplayNames").mockImplementation(function () {
      throw new RangeError("no");
    } as unknown as typeof Intl.DisplayNames);
    const list = countries("fr");
    expect(list.every((country) => country.name === country.code)).toBe(true);
  });

  it("falls back to the code when a single name lookup throws", () => {
    vi.spyOn(Intl, "DisplayNames").mockImplementation(function () {
      return {
        of: () => {
          throw new RangeError("bad");
        },
      };
    } as unknown as typeof Intl.DisplayNames);
    expect(countries("es")[0].name).toBe(countries("es")[0].code);
  });

  it("falls back to the code when a lookup returns nothing", () => {
    vi.spyOn(Intl, "DisplayNames").mockImplementation(function () {
      return { of: () => undefined };
    } as unknown as typeof Intl.DisplayNames);
    expect(countries("it").every((country) => country.name === country.code)).toBe(true);
  });
});

describe("countryByCode", () => {
  it("finds a code in any case and returns nothing for the unknown or empty", () => {
    expect(countryByCode("id")?.dial).toBe("+62");
    expect(countryByCode("ZZ")).toBeUndefined();
    expect(countryByCode(undefined)).toBeUndefined();
    expect(countryByCode("")).toBeUndefined();
  });
});

describe("matchCountry", () => {
  const indonesia = { code: "ID", dial: "+62", name: "Indonesia" };

  it("matches the name, the code and the calling code", () => {
    expect(matchCountry(indonesia, "")).toBe(true);
    expect(matchCountry(indonesia, "   ")).toBe(true);
    expect(matchCountry(indonesia, "done")).toBe(true);
    expect(matchCountry(indonesia, "ID")).toBe(true);
    expect(matchCountry(indonesia, "i")).toBe(true);
    expect(matchCountry(indonesia, "+62")).toBe(true);
    expect(matchCountry(indonesia, "62")).toBe(true);
    expect(matchCountry(indonesia, "6")).toBe(true);
    expect(matchCountry(indonesia, "+1")).toBe(false);
    expect(matchCountry(indonesia, "japan")).toBe(false);
  });

  it("matches a code only exactly", () => {
    expect(matchCountry({ code: "DE", dial: "+49", name: "Germany" }, "dx")).toBe(false);
    expect(matchCountry({ code: "DE", dial: "+49", name: "Germany" }, "de")).toBe(true);
  });
});
