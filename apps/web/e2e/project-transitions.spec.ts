import { expect, test } from "@playwright/test";

import { PROJECT_THEMES } from "../src/lib/project-themes";
import {
  cssRgb,
  curtainPeak,
  everLocked,
  expectListReturnedTo,
  fixtureRecord,
  htmlBackground,
  installProbes,
  LIGHT_PROJECT,
  LIST_ORDER,
  nextRecord,
  projectCard,
  requireFixtureApi,
  trackPageErrors,
  waitForDetailSettled,
  waitForListReady,
  type FixtureRecord,
} from "./support/projects";

// The project zoom (docs/page-transition.md, last section) between the list
// and the project pages, over the CMS fixture API's records. WebGL is
// switched off by default (installProbes), so the zoom's DOM fallback and
// the list's DOM covers run on every engine (E2E_WEBGL=1 keeps the WebGL
// paths). After every step: the route's page is on screen, nothing is left
// locked, tinted or covering it, and the logo curtain never showed.

// A zoom, its hold and the entrance behind it, several times per test, on
// slow CI runners.
test.setTimeout(120_000);

const detailUrl = (record: FixtureRecord) => (url: URL) =>
  url.pathname === `/projects/${record.slug}`;
const listUrl = /\/projects$/;

function themeBackground(record: FixtureRecord) {
  const id = record.project.theme as keyof typeof PROJECT_THEMES;
  return cssRgb(PROJECT_THEMES[id].light.bg);
}

test.beforeEach(async ({ page, request }) => {
  await requireFixtureApi(request);
  await installProbes(page);
  await page.emulateMedia({ colorScheme: "light" });
});

test.describe("project zoom", () => {
  test("a card zooms into its project and the Back pill zooms back onto the card", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    // The deepest card: the way back has to restore the list's scroll.
    const record = fixtureRecord(LIST_ORDER.at(-1)!);
    await page.goto("/projects");
    await waitForListReady(page);

    const card = projectCard(page, record.slug);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport({ ratio: 0.6 });
    await card.click();
    await expect(page).toHaveURL(detailUrl(record), { timeout: 15_000 });
    await waitForDetailSettled(page, record);

    const back = page.locator("header [data-project-back]");
    await expect.poll(() => back.getAttribute("data-waiting")).toBeNull();
    await back.click();
    await expect(page).toHaveURL(listUrl, { timeout: 15_000 });
    await expectListReturnedTo(page, record);
    expect(errors).toEqual([]);
  });

  test("browser back and forward between the list and a project stay on the zoom", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    const record = fixtureRecord(LIST_ORDER[0]);
    await page.goto("/projects");
    await waitForListReady(page);

    const card = projectCard(page, record.slug);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page).toHaveURL(detailUrl(record), { timeout: 15_000 });
    await waitForDetailSettled(page, record);

    await page.goBack();
    await expect(page).toHaveURL(listUrl, { timeout: 15_000 });
    await expectListReturnedTo(page, record);

    await page.goForward();
    await expect(page).toHaveURL(detailUrl(record), { timeout: 15_000 });
    await waitForDetailSettled(page, record, { atStart: false });
    expect(errors).toEqual([]);
  });

  test("the next project hands off, and back and forward between two projects swap colours", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    const first = LIGHT_PROJECT;
    const second = nextRecord(first.slug);
    await page.goto(`/projects/${first.slug}`);
    await waitForDetailSettled(page, first);
    await expect.poll(() => htmlBackground(page)).toBe(themeBackground(first));

    // Focus scrolls the horizontal strip to its end, where the panel rests
    // on the right quarter (the link box runs on off screen, so the click
    // lands near its left edge, halfway down, clear of the header).
    const link = page.getByRole("link", { name: `Next project: ${second.project.title}` });
    await link.focus();
    await expect(link).toBeInViewport({ timeout: 10_000 });
    const box = await link.boundingBox();
    await link.click({ position: { x: 24, y: Math.round((box?.height ?? 200) / 2) } });
    await expect(page).toHaveURL(detailUrl(second), { timeout: 15_000 });
    await waitForDetailSettled(page, second);
    await expect.poll(() => htmlBackground(page)).toBe(themeBackground(second));

    await page.goBack();
    await expect(page).toHaveURL(detailUrl(first), { timeout: 15_000 });
    await waitForDetailSettled(page, first, { atStart: false });
    await expect.poll(() => htmlBackground(page)).toBe(themeBackground(first));

    await page.goForward();
    await expect(page).toHaveURL(detailUrl(second), { timeout: 15_000 });
    await waitForDetailSettled(page, second, { atStart: false });
    await expect.poll(() => htmlBackground(page)).toBe(themeBackground(second));
    expect(errors).toEqual([]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("cards and the Back pill navigate plainly and the list comes back to the card", async ({
      page,
    }) => {
      const errors = trackPageErrors(page);
      const record = fixtureRecord(LIST_ORDER.at(-1)!);
      await page.goto("/projects");
      await waitForListReady(page);

      const card = projectCard(page, record.slug);
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await expect(page).toHaveURL(detailUrl(record), { timeout: 15_000 });
      await waitForDetailSettled(page, record);

      await page.locator("header [data-project-back]").click();
      await expect(page).toHaveURL(listUrl, { timeout: 15_000 });
      await expectListReturnedTo(page, record);
      expect(await everLocked(page)).toBe(false);
      expect(await curtainPeak(page)).toBe(0);
      expect(errors).toEqual([]);
    });
  });
});
