import { describe, expect, it } from "vitest";

import { acceptsHtml } from "./accepts-html";

describe("acceptsHtml", () => {
  it("accepts a browser navigation header", () => {
    expect(acceptsHtml("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(
      true,
    );
  });

  it("accepts text/html with a positive quality and any case", () => {
    expect(acceptsHtml("application/json, Text/HTML;q=0.5")).toBe(true);
  });

  it("refuses a missing header, a wildcard and JSON", () => {
    expect(acceptsHtml(null)).toBe(false);
    expect(acceptsHtml("*/*")).toBe(false);
    expect(acceptsHtml("application/json")).toBe(false);
  });

  it("honors an explicit exclusion with quality zero", () => {
    expect(acceptsHtml("application/json, text/html;q=0")).toBe(false);
    expect(acceptsHtml("text/html;q=0.0")).toBe(false);
  });

  it("treats a quality that is not a number as a refusal", () => {
    expect(acceptsHtml("text/html;q=abc")).toBe(false);
  });
});
