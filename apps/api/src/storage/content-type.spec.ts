import { describe, expect, it } from "vitest";

import { storedContentType } from "./content-type.js";

describe("storedContentType", () => {
  it("keeps the type of a document or an image", () => {
    expect(storedContentType("application/pdf")).toBe("application/pdf");
    expect(storedContentType("image/png")).toBe("image/png");
    expect(storedContentType("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
  });

  it.each([
    "text/html",
    "TEXT/HTML; charset=utf-8",
    "image/svg+xml",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
    "text/javascript",
    "application/javascript",
    "application/vnd.a+xml",
    "application/rdf+xml",
    "application/xslt+xml",
    "text/xsl",
  ])("stores %s as plain bytes", (type) => {
    expect(storedContentType(type)).toBe("application/octet-stream");
  });

  it("stores an empty type as plain bytes", () => {
    expect(storedContentType("")).toBe("application/octet-stream");
  });
});
