import { expect, test, type Page } from "@playwright/test";

// The homepage story (docs/homepage-story.md). CI has no hardware WebGL, so
// these cover what CI, Lighthouse and reduced-motion visitors get: the
// storybook, the section's accessible content, and the site loader's gate.
// The WebGL story itself is verified on a GPU (see the doc).

function refuseWebGL() {
  const refuses = (type: string) => /^(webgl2?|experimental-webgl)$/.test(type);
  for (const target of [HTMLCanvasElement, globalThis.OffscreenCanvas]) {
    if (!target) continue;
    const original = target.prototype.getContext as (...args: unknown[]) => unknown;
    Object.defineProperty(target.prototype, "getContext", {
      configurable: true,
      value(this: unknown, type: string, ...rest: unknown[]) {
        return refuses(type) ? null : original.call(this, type, ...rest);
      },
    });
  }
}

const CARDS = [
  { title: "Website", href: "/website" },
  { title: "Mobile", href: "/mobile" },
  { title: "Game", href: "/game" },
  { title: "UX", href: "/ux" },
];

async function expectStorybook(page: Page) {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-story-mode", "dom");
  const story = page.locator("#story");
  const book = story.locator("[data-storybook]");
  await expect(book).toBeVisible();
  await expect(story.locator("[data-story-gl]")).toBeHidden();
  await expect(book.getByRole("heading", { level: 2, name: "Competencies" })).toBeVisible();
  await expect(book).toContainText("Four things we love to do. Pick a card.");
  for (const card of CARDS) {
    const link = book.locator(`a[href="${card.href}"]`);
    await expect(link).toHaveCount(1);
    await expect(link.getByRole("heading", { level: 3, name: card.title })).toBeVisible();
  }
  await expect(book.locator("[data-storybook-panel]")).toHaveCount(6);
  await expect(book.getByRole("heading", { level: 2, name: "Let's work together." })).toBeVisible();
  await expect(book.getByRole("link", { name: /get in touch/i })).toHaveAttribute(
    "href",
    "/contact",
  );
}

test.describe("homepage story", () => {
  test("without WebGL the storybook tells the story", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(refuseWebGL);
    await page.goto("/");
    await page.locator("#story").scrollIntoViewIfNeeded();
    await expectStorybook(page);
    // No story canvas, no theme lock anywhere on the page.
    await expect(page.locator("[data-story-canvas]")).toHaveCount(0);
    await page.locator("footer").scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Toggle theme" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("reduced motion gets the storybook", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.locator("#story").scrollIntoViewIfNeeded();
    await expectStorybook(page);
  });

  test("the storybook is the server HTML", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    // No boot script ran: no mode, no loader, and the storybook shows.
    await expect(page.locator("html")).not.toHaveAttribute("data-story-mode", /.+/);
    await expect(page.locator("[data-storybook]")).toBeVisible();
    await expect(page.locator("[data-story-gl]")).toBeHidden();
    await expect(page.locator("[data-site-loader]")).toBeHidden();
    await context.close();
  });

  test("the loader is skipped under automation", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("html")).toHaveAttribute("data-loader", "done");
    await expect(page.locator("[data-site-loader]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test("the loader shows with ?loader=1, then gets out of the way", async ({ page }) => {
    // Record what the loader looked like while it was up.
    await page.addInitScript(() => {
      const seen = { active: false, label: "", overflow: false };
      Object.assign(window, { __loaderSeen: seen });
      const check = () => {
        const root = document.documentElement;
        if (root.dataset.loader === "active") seen.active = true;
        const bar = document.querySelector("[data-site-loader] [role='progressbar']");
        if (bar) seen.label = bar.getAttribute("aria-label") ?? "";
        if (root.style.overflow === "hidden") seen.overflow = true;
      };
      new MutationObserver(check).observe(document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
    await page.goto("/?loader=1");
    await expect(page.locator("html")).toHaveAttribute("data-loader", "done", { timeout: 15_000 });
    await expect(page.locator("[data-site-loader]")).toHaveCount(0);
    const seen = await page.evaluate(
      () => (window as unknown as { __loaderSeen: Record<string, unknown> }).__loaderSeen,
    );
    expect(seen).toEqual({ active: true, label: "Loading the site", overflow: false });
    // The page underneath is usable at once.
    await expect(page.getByRole("button", { name: "Toggle theme" })).toBeVisible();
  });
});
