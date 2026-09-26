import { expect, test, type Page } from "@playwright/test";

// Two complete entrances plus a route round-trip can exceed the default
// budget on software-rendered CI browsers.
test.setTimeout(60000);

test("reload stays a single document load and the hero settles", async ({ page }) => {
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".hero-cta, .compact-hero-cta").filter({ visible: true })).toHaveCSS(
    "opacity",
    "1",
    { timeout: 15000 },
  );
  expect(documents).toBe(1);
  await page.reload();
  await expect(page.locator(".hero-cta, .compact-hero-cta").filter({ visible: true })).toHaveCSS(
    "opacity",
    "1",
    { timeout: 15000 },
  );
  expect(documents).toBe(2);
  expect(errors).toEqual([]);
});

test("desktop idle motion and headline parallax survive returning home", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The geometric headline is desktop-only");
  await page.goto("/");
  await expect(page.locator(".scroll-indicator")).toHaveCSS("opacity", "1", { timeout: 15000 });
  const cross = page.locator("div.shape-x");
  const rest = await cross.evaluate((el) => getComputedStyle(el).transform);
  await expect
    .poll(() => cross.evaluate((el) => getComputedStyle(el).transform), { timeout: 7000 })
    .not.toBe(rest);
  const text = page.locator(".line-media").locator("..");
  await page.mouse.move(20, 100);
  const before = await text.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(1100, 600);
  await expect.poll(() => text.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
  const corner = await page.locator(".corner-pattern").boundingBox();
  const hero = await page.locator(".hero").boundingBox();
  expect(corner!.y + corner!.height).toBeGreaterThan(hero!.y + hero!.height);
  await expect(page.locator(".hero")).toHaveCSS("overflow", "visible");
  // Click actual links so the route curtain and mount cleanup are exercised.
  await page
    .locator('a[href="/articles"]')
    .first()
    .evaluate((el: HTMLElement) => el.click());
  // Into the library through the articles portal (docs/page-transition.md).
  await expect(page).toHaveURL(/\/articles$/, { timeout: 15000 });
  // A click while the portal still covers the page is dropped by design, so
  // wait until it has handed the page back (its layer gone, the page
  // unlocked). A software-rendered browser can take several seconds.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !document.querySelector("[data-articles-portal]") &&
            document.documentElement.style.overflow !== "hidden",
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  await page
    .locator('a[href="/"]')
    .first()
    .evaluate((el: HTMLElement) => el.click());
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  await page.waitForTimeout(2000);
  const returned = await cross.evaluate((el) => getComputedStyle(el).transform);
  await expect
    .poll(() => cross.evaluate((el) => getComputedStyle(el).transform), { timeout: 7000 })
    .not.toBe(returned);
});

test("divider has a connected spine through its repeat seam", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const columns = await page
    .locator(".mosaic-strip > div > div")
    .first()
    .evaluate((copy) => {
      const tiles = Array.from(copy.children) as HTMLElement[];
      return Array.from({ length: 18 }, (_, column) =>
        tiles.some((tile) => tile.style.left === `${column * 76}px` && tile.style.top === "76px"),
      );
    });
  expect(columns.every(Boolean)).toBe(true);
});

// The cursor flow (components/cursor-distortion) is a WebGL canvas behind the
// page that only starts on a hardware WebGL2 context, a fine pointer and with
// motion allowed. These specs refuse WebGL outright (as on a machine without
// it) so they hold on every engine, whatever its renderer. The WebGL path
// needs a GPU: `E2E_WEBGL=1` runs the last one on a machine that has one.
const flowCanvas = "canvas[data-cursor-flow]";

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

const flowMarked = (page: Page) =>
  page.evaluate(() => ({
    flow: document.documentElement.hasAttribute("data-flow"),
    cleared: document.querySelectorAll("[data-flow-clear]").length,
  }));

test("without WebGL the cursor flow leaves the page as it is", async ({ page, isMobile }) => {
  await page.addInitScript(refuseWebGL);
  await page.goto("/");
  await expect(page.locator(".hero-cta, .compact-hero-cta").filter({ visible: true })).toHaveCSS(
    "opacity",
    "1",
    { timeout: 15000 },
  );
  if (!isMobile) {
    await page.mouse.move(300, 300);
    await page.mouse.move(700, 450, { steps: 12 });
  }
  // The stage would load once the browser is idle, or soon after a move.
  await page.waitForTimeout(3000);
  await expect(page.locator(flowCanvas)).toHaveCount(0);
  expect(await flowMarked(page)).toEqual({ flow: false, cleared: 0 });
  // The page's own surfaces keep their backgrounds.
  await expect(page.locator(".hero")).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("reduced motion never starts the cursor flow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.mouse.move(300, 300);
  await page.mouse.move(700, 450, { steps: 12 });
  await page.waitForTimeout(3000);
  await expect(page.locator(flowCanvas)).toHaveCount(0);
  expect(await flowMarked(page)).toEqual({ flow: false, cleared: 0 });
});

test("the cursor flow shows through the page on a GPU and gives it back", async ({
  playwright,
  browserName,
  isMobile,
  baseURL,
}) => {
  test.skip(
    process.env.E2E_WEBGL !== "1" || browserName !== "chromium" || isMobile,
    "Needs E2E_WEBGL=1, Chromium, a mouse and a machine with a GPU",
  );
  // Playwright's stock Chromium renders WebGL in software (SwiftShader), which
  // the flow rejects by design: this browser asks for the real GPU.
  const browser = await playwright.chromium.launch({
    args: [
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  });
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.mouse.move(300, 300);
    await page.mouse.move(700, 450, { steps: 12 });
    await expect(page.locator(flowCanvas)).toHaveCount(1, { timeout: 10000 });
    await expect.poll(() => flowMarked(page).then((marks) => marks.flow)).toBe(true);
    // The hero paints the page colour, so it turns see-through; the footer never does.
    await expect(page.locator(".hero")).toHaveAttribute("data-flow-clear", "");
    await expect(page.locator("footer[data-flow-clear]")).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    // Reduced motion switched on mid-visit: the canvas and every marker go.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(flowCanvas)).toHaveCount(0);
    expect(await flowMarked(page)).toEqual({ flow: false, cleared: 0 });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});

test("article covers respond to focus without reloading their image", async ({ page }) => {
  // The homepage's articles section (the /articles list draws its own cards).
  await page.goto("/");
  const cover = page.locator(".article-cover").first();
  test.skip((await cover.count()) === 0, "No published articles in this environment");
  const requests: string[] = [];
  page.on("request", (request) => {
    // Only the covers' own pictures (the header logo, say, may load late).
    if (request.resourceType() === "image" && request.url().includes("/api/articles-cms/media/")) {
      requests.push(request.url());
    }
  });
  await cover.locator("..").focus();
  await expect(cover.locator(".article-cover-arrow")).toHaveCSS("opacity", "1");
  await expect(cover.locator(".article-cover-image")).toHaveCSS(
    "filter",
    "saturate(1.12) contrast(1.04)",
  );
  expect(requests).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(cover.locator(".article-cover-image")).toHaveCSS("transform", "none");
});
