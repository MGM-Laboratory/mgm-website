import { expect, test } from "@playwright/test";

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
  await expect(page).toHaveURL(/\/articles$/);
  // A click while the curtain is still covering is dropped by design
  // (route-transition.tsx), so wait out the full floor: cover 0.66s +
  // MIN_STAY_MS 0.75s + reveal 0.82s plus a margin for the RSC fetch that
  // gates the /articles sentinel (docs/page-transition.md).
  await page.waitForTimeout(3200);
  await page
    .locator('a[href="/"]')
    .first()
    .evaluate((el: HTMLElement) => el.click());
  await expect(page).toHaveURL(/\/$/);
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

test("background wake fades and reduced motion disables it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch devices do not create cursor wakes");
  await page.goto("/");
  const canvas = page.locator(".interactive-background");
  const hasInk = () =>
    canvas.evaluate((element) => {
      const c = element as HTMLCanvasElement;
      return c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height)
        .data.some((value, index) => index % 4 === 3 && value > 0);
    });
  await page.mouse.move(300, 300);
  await page.mouse.move(600, 400, { steps: 12 });
  await expect.poll(hasInk).toBe(true);
  await expect.poll(hasInk, { timeout: 4000 }).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(400, 500);
  expect(await hasInk()).toBe(false);
  await expect(canvas).toBeHidden();
});

test("article covers respond to focus without reloading their image", async ({ page }) => {
  await page.goto("/articles");
  const cover = page.locator(".article-cover").first();
  test.skip((await cover.count()) === 0, "No published articles in this environment");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image") requests.push(request.url());
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
