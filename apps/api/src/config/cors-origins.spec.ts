import { describe, expect, it } from "vitest";

import { corsOrigins } from "./cors-origins.js";

describe("corsOrigins", () => {
  it("returns one origin as a list of one", () => {
    expect(corsOrigins("https://example.org")).toEqual(["https://example.org"]);
  });

  it("trims spaces around each entry", () => {
    expect(corsOrigins("https://example.org, https://www.example.org ")).toEqual([
      "https://example.org",
      "https://www.example.org",
    ]);
  });

  it("drops empty entries from a trailing or doubled comma", () => {
    expect(corsOrigins("https://example.org,, ,")).toEqual(["https://example.org"]);
  });

  it("returns an empty list for an empty setting, which allows no origin", () => {
    expect(corsOrigins("")).toEqual([]);
    expect(corsOrigins(" , ,")).toEqual([]);
  });
});
