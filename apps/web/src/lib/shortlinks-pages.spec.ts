import { describe, expect, it } from "vitest";

import {
  renderShortlinkPage,
  renderShortlinkUnavailable,
  renderSiteNotFound,
} from "./shortlinks-pages";

describe("renderShortlinkPage", () => {
  it("renders the passphrase form for the slug", () => {
    const html = renderShortlinkPage("passphrase", { slug: "my link/1" });

    expect(html).toContain("<h1>Protected link</h1>");
    expect(html).toContain('action="/s/my%20link%2F1"');
    expect(html).toContain('type="password"');
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain('class="error"');
  });

  it("escapes the error text and marks the field invalid", () => {
    const html = renderShortlinkPage("passphrase", {
      slug: "a",
      error: `<script>alert("x")</script> & 'q'`,
    });

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(
      '<p class="error">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;</p>',
    );
    expect(html).not.toContain('<script>alert("x")');
  });

  it("falls back to an empty slug", () => {
    expect(renderShortlinkPage("passphrase")).toContain('action="/s/"');
  });

  it("renders the expired, used and missing pages without a form", () => {
    expect(renderShortlinkPage("expired")).toContain("This link has expired");
    expect(renderShortlinkPage("consumed")).toContain("This link was already used");
    expect(renderShortlinkPage("not_found")).toContain("This link does not exist");
    for (const kind of ["expired", "consumed", "not_found"] as const) {
      expect(renderShortlinkPage(kind)).not.toContain("<form");
    }
  });

  it("is a complete noindex document with the short link footer", () => {
    const html = renderShortlinkPage("expired");

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain("Short links by MGM Laboratory");
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });
});

describe("renderSiteNotFound", () => {
  it("links back to the home page instead of the short link footer", () => {
    const html = renderSiteNotFound();

    expect(html).toContain("Page not found | MGM Laboratory");
    expect(html).toContain('<a href="/">Back to the home page</a>');
    expect(html).not.toContain("Short links by MGM Laboratory");
  });
});

describe("renderShortlinkUnavailable", () => {
  it("says the service is unavailable", () => {
    const html = renderShortlinkUnavailable();

    expect(html).toContain("Short links are unavailable");
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });
});
