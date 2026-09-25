import { expect, test, type Page } from "@playwright/test";

import fixture from "./fixtures/cms/articles.json";
import { curtainPeak, installProbes } from "./support/projects";

// The suite's CMS fixture API (e2e/fixtures/cms) serves five articles, so
// every expectation here comes from the same file the pages render. Like
// the project specs, these switch WebGL off (`installProbes`), so the
// library's DOM paths run on every engine: the plain list, the DOM cover,
// the transitions' flat overlay and the portal's DOM stage. Everything
// checked here also holds for the WebGL paths (E2E_WEBGL=1): the cards are
// real links either way, and the transitions play either way.

type FixtureArticle = {
  slug: string;
  article: {
    title: string;
    subtitle: string;
    date: string;
    categories: string[];
    authorSlugs: string[];
  };
};

const records = (fixture as { records: FixtureArticle[] }).records;
/** The list order the site uses (`publishedArticles`): newest first. */
const LIST_ORDER = [...records].sort((a, b) => b.article.date.localeCompare(a.article.date));
const READING_ROOM = records.find((record) => record.slug === "e2e-reading-room")!;

// Two entrances and a transition each way can exceed the default budget on
// software-rendered CI browsers.
test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await installProbes(page);
});

/** Everything a transition or an entrance may hold while it plays. */
const settled = (page: Page) =>
  page.evaluate(() => ({
    locked: document.documentElement.style.overflow === "hidden",
    transition: document.documentElement.dataset.articleTransition ?? null,
    entrance: document.querySelector<HTMLElement>("[data-articles-page]")?.dataset.entrance ?? null,
  }));

const contentOpacity = (page: Page) =>
  page.evaluate(() => {
    const content = document.querySelector("[data-article-content]");
    return content ? getComputedStyle(content).opacity : null;
  });

const cardFor = (page: Page, slug: string) =>
  page.locator(`a[data-article-card][data-article-slug="${slug}"]`);

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("articles list", () => {
  test("shows every published article, newest first, and settles unlocked", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/articles");
    await expect(page.getByRole("heading", { level: 1, name: "Articles" })).toBeVisible();

    const cards = page.locator("a[data-article-card]");
    await expect(cards).toHaveCount(LIST_ORDER.length);
    expect(
      await cards.evaluateAll((links) => links.map((link) => link.dataset.articleSlug)),
    ).toEqual(LIST_ORDER.map((record) => record.slug));

    // One line each, cut with an ellipsis (the long fixture overflows any card).
    const long = cardFor(page, "e2e-very-long-title");
    for (const line of ["[data-card-subtitle]", ".article-card-roll > span"]) {
      await expect(long.locator(line).first()).toHaveCSS("white-space", "nowrap");
    }
    await expect(long.locator("[data-card-subtitle]")).toHaveCSS("text-overflow", "ellipsis");
    await expect(long).toHaveAttribute("aria-label", /Deliberately Long Fixture Title/);

    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toEqual({ locked: false, transition: null, entrance: "done" });
    // No footer at the end of the list: a way home and back to the top instead.
    await expect(page.locator("footer")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("search and categories live in the URL", async ({ page }) => {
    await page.goto("/articles");
    const cards = page.locator("a[data-article-card]");
    await expect(cards).toHaveCount(LIST_ORDER.length);

    await page.getByRole("searchbox", { name: "Search articles" }).fill("river");
    await expect(page).toHaveURL(/[?&]q=river/);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute("data-article-slug", "e2e-paper-river");

    // A shared link opens the same filtered list.
    await page.goto("/articles?category=conference");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute("data-article-slug", "e2e-very-long-title");
    await expect(
      page.locator('[aria-pressed="true"]').filter({ hasText: "Conference" }).first(),
    ).toBeAttached();
  });

  test("reduced motion shows the list at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/articles");
    await expect(page.locator("a[data-article-card]")).toHaveCount(LIST_ORDER.length);
    // "At once" is as soon as the page hydrates: no entrance plays.
    await expect
      .poll(() => settled(page), { timeout: 5_000 })
      .toEqual({ locked: false, transition: null, entrance: "done" });
  });
});

test.describe("article page", () => {
  test("shows its date, title, description, categories and authors, then the story", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(`/articles/${READING_ROOM.slug}`);

    const detail = page.locator("[data-article-detail]");
    await expect(detail).toHaveAttribute("data-article-slug", READING_ROOM.slug);
    await expect(
      page.getByRole("heading", { level: 1, name: READING_ROOM.article.title }),
    ).toBeAttached();
    await expect(detail.locator("time").first()).toHaveAttribute(
      "datetime",
      READING_ROOM.article.date,
    );
    await expect(detail.getByText(READING_ROOM.article.subtitle)).toBeAttached();
    const categories = page.getByRole("list", { name: "Categories" });
    for (const category of READING_ROOM.article.categories) {
      await expect(categories).toContainText(category);
    }
    await expect(detail.getByText("Written by")).toBeAttached();
    await expect(detail.getByText("Rahma Aliyyah").first()).toBeAttached();
    await expect(page.getByRole("heading", { name: "What the shelves hold" })).toBeAttached();

    // The way on: the next article in the list's order, and Back to the list.
    await expect(page.locator("a[data-article-next]")).toHaveAttribute(
      "href",
      `/articles/${LIST_ORDER[1].slug}`,
    );
    await expect(page.locator("a[data-article-back]").first()).toBeVisible();
    await expect(page.locator("footer")).toHaveCount(0);

    await expect.poll(() => contentOpacity(page), { timeout: 20_000 }).toBe("1");
    await expect.poll(() => settled(page)).toMatchObject({ locked: false, transition: null });
    expect(errors).toEqual([]);
  });

  test("an unknown article says so", async ({ page }) => {
    await page.goto("/articles/e2e-not-on-any-shelf");
    await expect(page.getByRole("heading", { level: 1, name: /on any shelf/ })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("articles transitions", () => {
  test("a card opens its article and Back returns to that card", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/articles");
    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toMatchObject({ entrance: "done", locked: false });

    const slug = LIST_ORDER[1].slug;
    await cardFor(page, slug).click();
    await expect(page).toHaveURL(new RegExp(`/articles/${slug}$`), { timeout: 20_000 });
    await expect(page.locator("[data-article-detail]")).toHaveAttribute("data-article-slug", slug);
    await expect.poll(() => contentOpacity(page), { timeout: 20_000 }).toBe("1");
    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toMatchObject({ locked: false, transition: null });

    await page.locator("a[data-article-back]").first().click();
    await expect(page).toHaveURL(/\/articles$/, { timeout: 20_000 });
    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toEqual({ locked: false, transition: null, entrance: "done" });
    await expect(cardFor(page, slug)).toBeInViewport();
    // The world's transitions own these navigations: the curtain never shows.
    expect(await curtainPeak(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("browser back and forward play the way out and in again", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/articles");
    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toMatchObject({ entrance: "done", locked: false });

    const slug = LIST_ORDER[0].slug;
    await cardFor(page, slug).click();
    await expect(page).toHaveURL(new RegExp(`/articles/${slug}$`), { timeout: 20_000 });
    await expect.poll(() => contentOpacity(page), { timeout: 20_000 }).toBe("1");

    await page.goBack();
    await expect(page).toHaveURL(/\/articles$/, { timeout: 20_000 });
    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toEqual({ locked: false, transition: null, entrance: "done" });
    await expect(cardFor(page, slug)).toBeInViewport();

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/articles/${slug}$`), { timeout: 20_000 });
    await expect.poll(() => contentOpacity(page), { timeout: 20_000 }).toBe("1");
    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toMatchObject({ locked: false, transition: null });
    expect(await curtainPeak(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("reduced motion navigates at once and still comes back to the card", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/articles");
    const slug = LIST_ORDER[3].slug;
    await cardFor(page, slug).click();
    await expect(page).toHaveURL(new RegExp(`/articles/${slug}$`), { timeout: 20_000 });
    await expect.poll(() => contentOpacity(page), { timeout: 10_000 }).toBe("1");
    expect((await settled(page)).locked).toBe(false);

    await page.locator("a[data-article-back]").first().click();
    await expect(page).toHaveURL(/\/articles$/, { timeout: 20_000 });
    await expect(cardFor(page, slug)).toBeInViewport();
    await expect
      .poll(() => settled(page), { timeout: 5_000 })
      .toEqual({ locked: false, transition: null, entrance: "done" });
  });

  test("the portal carries a visitor in from the homepage and back out", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await page
      .locator('a[href="/articles"]')
      .first()
      .evaluate((el: HTMLElement) => el.click());
    await expect(page).toHaveURL(/\/articles$/, { timeout: 20_000 });
    await expect(page.locator("a[data-article-card]")).toHaveCount(LIST_ORDER.length);
    await expect
      .poll(() => settled(page), { timeout: 20_000 })
      .toEqual({ locked: false, transition: null, entrance: "done" });

    await page
      .locator('header a[href="/"]')
      .first()
      .evaluate((el: HTMLElement) => el.click());
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.overflow), { timeout: 20_000 })
      .not.toBe("hidden");
    // The portal carries both ways: the curtain never covers them.
    expect(await curtainPeak(page)).toBe(0);
    expect(errors).toEqual([]);
  });
});
