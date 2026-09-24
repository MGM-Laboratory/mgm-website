import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import fixture from "../fixtures/cms/projects.json";

/**
 * Shared data and probes for the project page specs. The records are the
 * ones the CMS fixture API serves (fixtures/cms-fixture-server.mjs), so
 * every expectation below is derived from the same file the pages render.
 */

export type FixtureMedia = {
  id: string;
  kind: "image" | "video";
  size: "normal" | "full";
  key: string;
  width: number;
  height: number;
  alt?: string;
};

export type FixtureProject = {
  slug: string;
  title: string;
  summary: string;
  techStack: string[];
  startDate?: string;
  endDate?: string;
  coverKey?: string;
  coverAlt?: string;
  galleryKeys: string[];
  links: { label: string; url: string }[];
  contributors: { name: string; role?: string }[];
  organizations: { name: string; url?: string }[];
  outputs: { label: string; href: string }[];
  theme?: string;
  description?: string;
  cta?: { label: string; url: string };
  services?: string[];
  media?: FixtureMedia[];
};

export type FixtureRecord = { slug: string; updatedAt: string; project: FixtureProject };

export const records = (fixture as { records: unknown[] }).records as FixtureRecord[];

export function fixtureRecord(slug: string) {
  const record = records.find((entry) => entry.slug === slug);
  if (!record) throw new Error(`No fixture record "${slug}"`);
  return record;
}

/** The two rich records (explicit themes, media sections) and the legacy-shaped one. */
export const LIGHT_PROJECT = fixtureRecord("e2e-solar-atlas");
export const DARK_PROJECT = fixtureRecord("e2e-night-signal");
export const LEGACY_PROJECT = fixtureRecord("e2e-legacy-lantern");

/** The list order the site uses (`publishedProjects`): newest end date, else start date, else save time. */
const sortKey = ({ project, updatedAt }: FixtureRecord) =>
  project.endDate ?? project.startDate ?? updatedAt;
export const LIST_ORDER = [...records]
  .sort((left, right) => sortKey(right).localeCompare(sortKey(left)))
  .map((record) => record.slug);

/** The project a detail page offers next: the following one in list order, wrapping around. */
export function nextRecord(slug: string) {
  const index = LIST_ORDER.indexOf(slug);
  return fixtureRecord(LIST_ORDER[(index + 1) % LIST_ORDER.length]);
}

/** `#FEF6E0` as a computed colour, `rgb(254, 246, 224)`. */
export function cssRgb(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

/**
 * Skips outside CI when the server under test isn't reading the fixture
 * API (a reused dev server pointed at a real CMS). CI never skips.
 */
export async function requireFixtureApi(request: APIRequestContext) {
  if (process.env.CI) return;
  const response = await request.get(`/projects/${LIGHT_PROJECT.slug}`);
  test.skip(
    response.status() !== 200,
    "The server under test isn't reading the CMS fixture API (see docs/testing-verification.md)",
  );
}

export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** WebKit on macOS only moves focus to links with Alt+Tab (the Safari default). */
export function tabKey(browserName: string) {
  return browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
}

type Probed = Window & { __curtainPeak?: number; __everLocked?: boolean };

/**
 * Whether these specs leave WebGL on. By default they switch it off, so the
 * DOM fallbacks run on every engine, locally and in CI alike: Playwright's
 * Chromium starts with SwiftShader enabled, `failIfMajorPerformanceCaveat`
 * doesn't reject it, and a full-screen zoom rendered in software took up to
 * 19 s on a busy machine (GSAP's lag smoothing stretches every frame past
 * 500 ms). `E2E_WEBGL=1` keeps the WebGL paths for a local run on a machine
 * with a GPU.
 */
export const WEBGL_ENABLED = process.env.E2E_WEBGL === "1";

/**
 * Prepares a page for the project specs. Call before the first `goto`.
 *
 * - Switches WebGL off unless `WEBGL_ENABLED` (see above): every WebGL
 *   context request fails, as on a machine without hardware WebGL2.
 * - Samples the route curtain's layers every animation frame from the
 *   first paint on, keeping the highest opacity either reached while
 *   visible. The project zoom handles every navigation between the list
 *   and a project, so on those the peak must stay 0.
 * - Notes whether <html> was ever scroll locked.
 */
export async function installProbes(page: Page) {
  if (!WEBGL_ENABLED) {
    await page.addInitScript(() => {
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
    });
  }
  await page.addInitScript(() => {
    const probed = window as Probed;
    probed.__curtainPeak = 0;
    probed.__everLocked = false;
    const sample = () => {
      for (const layer of document.querySelectorAll<HTMLElement>("[data-route-transition]")) {
        const style = getComputedStyle(layer);
        if (style.visibility === "hidden") continue;
        probed.__curtainPeak = Math.max(probed.__curtainPeak ?? 0, Number(style.opacity) || 0);
      }
      if (document.documentElement.style.overflow === "hidden") probed.__everLocked = true;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

export const curtainPeak = (page: Page) =>
  page.evaluate(() => (window as Probed).__curtainPeak ?? 0);

export const everLocked = (page: Page) =>
  page.evaluate(() => (window as Probed).__everLocked ?? false);

export const htmlOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.style.overflow);

/** Custom properties a transition writes inline on <html> while it runs. */
export const inlineProjectVars = (page: Page) =>
  page.evaluate(() => {
    const style = document.documentElement.style;
    return Array.from({ length: style.length }, (_, index) => style[index]).filter((name) =>
      name.startsWith("--project-"),
    );
  });

/** A themed project page's palette on :root; empty on any other page. */
export const rootProjectBg = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--project-bg").trim(),
  );

export const htmlBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

/**
 * Anything that still takes the pointer over the page: the element hit at
 * the viewport centre must belong to the page content, and the one at the
 * header's centre to the header (the zoom's overlay covers the first and
 * its shield the second while a transition runs).
 */
export const pointerBlockers = (page: Page) =>
  page.evaluate(() => {
    const describe = (element: Element | null) =>
      element
        ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}.${[...element.classList].slice(0, 4).join(".")}`
        : "nothing";
    const problems: string[] = [];
    const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    if (!centre?.closest("#smooth-content")) problems.push(`centre: ${describe(centre)}`);
    const header = document.elementFromPoint(innerWidth / 2, 32);
    if (!header?.closest("header")) problems.push(`header: ${describe(header)}`);
    return problems;
  });

/** Nothing is left locked, tinted or covering the page, and the curtain never showed. */
export async function expectNothingStranded(page: Page) {
  await expect.poll(() => htmlOverflow(page), { timeout: 20_000 }).toBe("");
  await expect.poll(() => inlineProjectVars(page), { timeout: 10_000 }).toEqual([]);
  await expect.poll(() => pointerBlockers(page), { timeout: 10_000 }).toEqual([]);
  expect(await curtainPeak(page), "the route curtain showed").toBe(0);
}

export const listOpacity = (page: Page) =>
  page.evaluate(() => {
    const list = document.getElementById("projects");
    return list ? getComputedStyle(list).opacity : null;
  });

/** The list has finished its intro: unlocked and fully shown. */
export async function waitForListReady(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => htmlOverflow(page), { timeout: 20_000 }).toBe("");
  await expect.poll(() => listOpacity(page), { timeout: 20_000 }).toBe("1");
  // Without WebGL every card keeps its DOM cover.
  if (!WEBGL_ENABLED) await expect(page.locator('[data-stage="gl"]')).toHaveCount(0);
}

export const projectCard = (page: Page, slug: string) =>
  page.locator(`a[data-project-transition][data-project-slug="${slug}"]`);

/**
 * A project page is on screen and its entrance has finished: the media
 * track is fully shown (it fades in over the entrance's second half,
 * whatever the scroll position) and nothing is stranded. `atStart` also
 * checks the meta block, which only shows before the strip is scrolled.
 */
export async function waitForDetailSettled(
  page: Page,
  record: FixtureRecord,
  { atStart = true } = {},
) {
  const root = page.locator(`[data-project-detail][data-project-slug="${record.slug}"]`);
  await expect(root).toBeAttached({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(record.project.title);
  await expect
    .poll(
      () => root.locator("[data-detail-track]").evaluate((el) => getComputedStyle(el).opacity),
      {
        timeout: 20_000,
      },
    )
    .toBe("1");
  // Without WebGL the media stay DOM media (the stage owns none of them).
  if (!WEBGL_ENABLED) await expect(root.locator("[data-detail-item][data-owned]")).toHaveCount(0);
  if (atStart) {
    await expect
      .poll(
        () =>
          root
            .locator("[data-part], h1")
            .evaluateAll((elements) =>
              elements.every((el) => getComputedStyle(el).opacity === "1"),
            ),
        { timeout: 20_000 },
      )
      .toBe(true);
  }
  await expectNothingStranded(page);
}

/** Back on the list from `record`: shown in full, its card in view and uncovered. */
export async function expectListReturnedTo(page: Page, record: FixtureRecord) {
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => listOpacity(page), { timeout: 20_000 }).toBe("1");
  await expect(projectCard(page, record.slug)).toBeInViewport({ ratio: 0.3, timeout: 15_000 });
  await expect(page.locator("[data-project-landing]")).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => rootProjectBg(page), { timeout: 10_000 }).toBe("");
  await expectNothingStranded(page);
}
