import { expect, test, type Locator, type Page } from "@playwright/test";

import { PROJECT_THEMES } from "../src/lib/project-themes";
import {
  cssRgb,
  DARK_PROJECT,
  everLocked,
  htmlBackground,
  htmlOverflow,
  installProbes,
  LEGACY_PROJECT,
  LIGHT_PROJECT,
  nextRecord,
  requireFixtureApi,
  rootProjectBg,
  tabKey,
  trackPageErrors,
  waitForDetailSettled,
  type FixtureProject,
  type FixtureRecord,
} from "./support/projects";

// The project detail page (/projects/<slug>), rendered from the CMS fixture
// API's records (e2e/fixtures/cms). WebGL is switched off by default
// (installProbes), so the DOM media and fallbacks run on every engine.
// Everything here also holds for the WebGL paths (E2E_WEBGL=1).

// An entrance plus a page of assertions per test, on slow CI runners.
test.setTimeout(60_000);

type ThemeId = keyof typeof PROJECT_THEMES;

type ExpectedMedia = {
  id: string;
  kind: "image" | "video";
  full: boolean;
  alt: string;
  /** Stored intrinsic size; 0 when the record leaves it to the API's measurement. */
  width: number;
  height: number;
};

/** The media a record's page shows, with the page's own fallbacks for older records. */
function expectedMedia({ project }: FixtureRecord): ExpectedMedia[] {
  if (project.media?.length) {
    return project.media.map((item) => ({
      id: item.id,
      kind: item.kind,
      full: item.size === "full",
      alt: item.alt ?? "",
      width: item.width,
      height: item.height,
    }));
  }
  const keys = [project.coverKey, ...project.galleryKeys].filter(Boolean);
  return keys.map((_, index) => ({
    id: index === 0 && project.coverKey ? "cover" : `gallery-${index - (project.coverKey ? 1 : 0)}`,
    kind: "image",
    full: index === 0 && Boolean(project.coverKey),
    alt:
      index === 0 && project.coverAlt
        ? project.coverAlt
        : `${project.title}, image ${index + 1} of ${keys.length}`,
    width: 0,
    height: 0,
  }));
}

/** Links, then organisations and outputs with an address, as the page lists them. */
function expectedLinks(project: FixtureProject) {
  return [
    ...project.links.map((link) => ({ label: link.label, href: link.url })),
    ...project.organizations.flatMap((entry) =>
      entry.url ? [{ label: entry.name, href: entry.url }] : [],
    ),
    ...project.outputs.map((output) => ({ label: output.label, href: output.href })),
  ];
}

const isExternal = (href: string) => /^https?:\/\//.test(href);

async function expectOpensSafely(link: Locator, href: string) {
  if (isExternal(href)) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  } else {
    await expect(link).not.toHaveAttribute("target");
  }
}

const canPlayMp4 = (page: Page) =>
  page.evaluate(
    () => document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"') !== "",
  );

const figureIds = (page: Page) =>
  page
    .locator("[data-detail-item]")
    .evaluateAll((figures) => figures.map((figure) => figure.getAttribute("data-id")));

const nextLink = (page: Page, record: FixtureRecord) =>
  page.getByRole("link", { name: `Next project: ${nextRecord(record.slug).project.title}` });

test.beforeEach(async ({ page, request }) => {
  await requireFixtureApi(request);
  await installProbes(page);
});

test.describe("project detail page", () => {
  for (const record of [LIGHT_PROJECT, DARK_PROJECT]) {
    test(`${record.project.title} renders its copy, links, media and theme`, async ({ page }) => {
      const errors = trackPageErrors(page);
      const { project } = record;
      const theme = PROJECT_THEMES[project.theme as ThemeId];
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(`/projects/${record.slug}`);
      await waitForDetailSettled(page, record);
      await expect(page).toHaveTitle(`${project.title} | MGM Laboratory`);

      await expect(page.locator('[data-part="desc"] p')).toHaveText(
        project.description!.split("\n\n"),
      );

      const cta = page.locator('[data-part="cta"] a');
      await expect(cta).toHaveAttribute("href", project.cta!.url);
      await expect(cta).toContainText(project.cta!.label);
      await expectOpensSafely(cta, project.cta!.url);

      const services = page.getByRole("region", { name: "Services", exact: true });
      await expect(services.getByRole("listitem")).toHaveText(project.services!);

      const links = page.getByRole("region", { name: "Links", exact: true }).getByRole("link");
      const wanted = expectedLinks(project);
      await expect(links).toHaveCount(wanted.length);
      for (const [index, link] of wanted.entries()) {
        await expect(links.nth(index)).toHaveAttribute("href", link.href);
        await expect(links.nth(index)).toContainText(link.label);
        await expectOpensSafely(links.nth(index), link.href);
      }

      const credits = page
        .getByRole("region", { name: "Credits", exact: true })
        .getByRole("listitem");
      await expect(credits).toHaveCount(project.contributors.length);
      for (const [index, person] of project.contributors.entries()) {
        await expect(credits.nth(index)).toContainText(person.name);
        if (person.role) await expect(credits.nth(index)).toContainText(person.role);
      }

      // The media in the configured order. A browser without an H.264
      // decoder drops the video, as the page drops any file that fails.
      const playable = await canPlayMp4(page);
      const media = expectedMedia(record).filter((item) => item.kind === "image" || playable);
      await expect.poll(() => figureIds(page), { timeout: 15_000 }).toEqual(media.map((m) => m.id));
      const figures = page.locator("[data-detail-item]");
      for (const [index, item] of media.entries()) {
        const figure = figures.nth(index);
        await expect(figure).toHaveAttribute("data-kind", item.kind);
        if (item.full) await expect(figure).toHaveAttribute("data-full", "");
        else await expect(figure).not.toHaveAttribute("data-full");
        if (item.kind === "image") {
          const image = figure.locator("img");
          await expect(image).toHaveAttribute("alt", item.alt);
          if (item.width) {
            await expect(image).toHaveAttribute("width", String(item.width));
            await expect(image).toHaveAttribute("height", String(item.height));
          }
        } else {
          const video = figure.locator("video");
          await expect(video).toHaveAttribute("aria-label", item.alt);
          await expect(video).toHaveJSProperty("muted", true);
          await expect(video).toHaveJSProperty("loop", true);
          await expect(video).toHaveAttribute("playsinline", "");
          await expect(video).toHaveAttribute("preload", "metadata");
          // The video route relays the fixture's file (with ranges) to the player.
          await expect
            .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), {
              timeout: 15_000,
            })
            .toBeGreaterThanOrEqual(1);
        }
      }
      // The first picture decodes from the fixture through the site's media route.
      await expect
        .poll(
          () =>
            figures
              .first()
              .locator("img")
              .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
          { timeout: 15_000 },
        )
        .toBe(true);

      // The theme paints the page, light or dark with the site's own toggle.
      await expect.poll(() => htmlBackground(page)).toBe(cssRgb(theme.light.bg));
      await page.getByRole("button", { name: "Toggle theme" }).click();
      await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
      await expect.poll(() => htmlBackground(page)).toBe(cssRgb(theme.dark.bg));

      const back = page.locator("header [data-project-back]");
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute("href", "/projects");
      await expect(back).toHaveAccessibleName("Back to projects");

      await expect(nextLink(page, record)).toHaveAttribute(
        "href",
        `/projects/${nextRecord(record.slug).slug}`,
      );
      expect(errors).toEqual([]);
    });
  }

  test("a legacy record renders with its fallbacks", async ({ page }) => {
    const errors = trackPageErrors(page);
    const record = LEGACY_PROJECT;
    const { project } = record;
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/projects/${record.slug}`);
    await waitForDetailSettled(page, record);

    // The summary stands in for the description, the tech stack for services.
    await expect(page.locator('[data-part="desc"] p')).toHaveText([project.summary]);
    await expect(page.locator('[data-part="cta"]')).toHaveCount(0);
    const services = page.getByRole("region", { name: "Services", exact: true });
    await expect(services.getByRole("listitem")).toHaveText(project.techStack);
    await expect(page.getByRole("region", { name: "Links", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Credits", exact: true })).toContainText(
      project.contributors[0].name,
    );

    // The cover runs first and full height, then the gallery at the normal size.
    const media = expectedMedia(record);
    await expect.poll(() => figureIds(page)).toEqual(media.map((item) => item.id));
    const figures = page.locator("[data-detail-item]");
    await expect(figures.first()).toHaveAttribute("data-full", "");
    await expect(figures.nth(1)).not.toHaveAttribute("data-full");
    await expect(figures.first().locator("img")).toHaveAttribute(
      "src",
      `/api/projects-cms/media/${project.coverKey}`,
    );
    for (const [index, item] of media.entries()) {
      await expect(figures.nth(index).locator("img")).toHaveAttribute("alt", item.alt);
    }

    // No theme on the record: the page still wears one, picked from the slug.
    const themeId = await page.locator("[data-project-detail]").getAttribute("data-project-theme");
    expect(Object.keys(PROJECT_THEMES)).toContain(themeId);
    await expect
      .poll(() => htmlBackground(page))
      .toBe(cssRgb(PROJECT_THEMES[themeId as ThemeId].light.bg));

    // The last project in list order wraps around to the first.
    await expect(nextLink(page, record)).toHaveAttribute(
      "href",
      `/projects/${nextRecord(record.slug).slug}`,
    );
    expect(errors).toEqual([]);
  });

  test("an unknown project is a clean 404", async ({ page }) => {
    const errors = trackPageErrors(page);
    const response = await page.goto("/projects/e2e-no-such-project");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.locator("[data-project-detail]")).toHaveCount(0);
    expect(await rootProjectBg(page)).toBe("");
    await expect.poll(() => htmlOverflow(page)).toBe("");
    expect(errors).toEqual([]);
  });

  test("the media routes relay the CMS files, the video with ranges", async ({ request }) => {
    const media = LIGHT_PROJECT.project.media!;
    const image = media.find((item) => item.kind === "image")!;
    const picture = await request.get(`/api/projects-cms/media/${image.key}`);
    expect(picture.status()).toBe(200);
    expect(picture.headers()["content-type"]).toBe("image/jpeg");
    expect((await picture.body()).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));

    const video = media.find((item) => item.kind === "video")!;
    const head = await request.get(`/api/projects-cms/video/${video.key}`, {
      headers: { range: "bytes=0-1" },
    });
    expect(head.status()).toBe(206);
    expect(head.headers()["content-range"]).toMatch(/^bytes 0-1\/\d+$/);
    expect(head.headers()["accept-ranges"]).toBe("bytes");
    expect((await head.body()).length).toBe(2);

    // Keys outside the API's patterns never reach it.
    const stranger = await request.get("/api/projects-cms/video/not-a-demo.mp4");
    expect(stranger.status()).toBe(404);
  });

  test("the keyboard reaches the call to action, the links and the next project", async ({
    page,
    browserName,
  }) => {
    const errors = trackPageErrors(page);
    const record = LIGHT_PROJECT;
    const next = nextRecord(record.slug);
    await page.goto(`/projects/${record.slug}`);
    await waitForDetailSettled(page, record);

    const wanted = [
      record.project.cta!.url,
      ...expectedLinks(record.project).map((link) => link.href),
      `/projects/${next.slug}`,
    ];
    const reached: string[] = [];
    for (let presses = 0; presses < 40 && reached.at(-1) !== wanted.at(-1); presses++) {
      await page.keyboard.press(tabKey(browserName));
      const href = await page.evaluate(
        () =>
          document.activeElement?.closest("[data-project-detail] a")?.getAttribute("href") ?? null,
      );
      if (href && !reached.includes(href)) reached.push(href);
    }
    expect(reached).toEqual(wanted);
    // Focus on the next project brings its panel on screen (the strip
    // scrolls to its end in the horizontal layout).
    await expect(nextLink(page, record)).toBeInViewport({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("shows everything at once, never locks and keeps the plain next link", async ({
      page,
    }) => {
      const errors = trackPageErrors(page);
      const record = LIGHT_PROJECT;
      const next = nextRecord(record.slug);
      await page.goto(`/projects/${record.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(record.project.title);

      const root = page.locator("[data-project-detail]");
      await expect
        .poll(
          () =>
            root
              .locator("[data-enter]:not([data-detail-hint])")
              .evaluateAll((elements) =>
                elements.every((element) => getComputedStyle(element).opacity === "1"),
              ),
          { timeout: 5_000 },
        )
        .toBe(true);
      const firstImage = root.locator("[data-detail-item] img").first();
      await expect
        .poll(() => firstImage.evaluate((image) => getComputedStyle(image).opacity), {
          timeout: 15_000,
        })
        .toBe("1");

      // Nothing autoplays: the video waits for its button, which stays shown.
      if (await canPlayMp4(page)) {
        const figure = root.locator('[data-detail-item][data-kind="video"]');
        await expect
          .poll(
            () => figure.locator("video").evaluate((video: HTMLVideoElement) => video.readyState),
            {
              timeout: 15_000,
            },
          )
          .toBeGreaterThanOrEqual(1);
        await expect(figure.locator("video")).toHaveJSProperty("paused", true);
        await expect(figure.getByRole("button", { name: /^Play video/ })).toHaveAttribute(
          "data-paused",
          "",
        );
      }

      // The next project is a plain link: no hand-off, it just navigates.
      const link = nextLink(page, record);
      await link.focus();
      await expect(link).toBeInViewport({ timeout: 5_000 });
      await link.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/projects/${next.slug}$`), { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(next.project.title);

      expect(await everLocked(page)).toBe(false);
      expect(await htmlOverflow(page)).toBe("");
      expect(errors).toEqual([]);
    });
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    for (const record of [LIGHT_PROJECT, LEGACY_PROJECT]) {
      test(`${record.project.title} is stacked and fully visible`, async ({ page }) => {
        await page.goto(`/projects/${record.slug}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(record.project.title);
        await expect(page.locator("header [data-project-back]")).toBeVisible();

        // Everything the entrance would reveal shows from the server HTML.
        const hidden = await page
          .locator("[data-project-detail] [data-enter]")
          .evaluateAll((elements) =>
            elements
              .filter((element) => getComputedStyle(element).display !== "none")
              .filter((element) => getComputedStyle(element).opacity !== "1")
              .map((element) => element.outerHTML.slice(0, 80)),
          );
        expect(hidden).toEqual([]);

        // The server HTML carries every media section in order, the videos
        // included (nothing can drop them without JavaScript).
        const media = expectedMedia(record);
        expect(await figureIds(page)).toEqual(media.map((item) => item.id));
        const figures = page.locator("[data-detail-item]");
        for (const [index, item] of media.entries()) {
          const figure = figures.nth(index);
          await expect(figure).toHaveAttribute("data-kind", item.kind);
          if (item.full) await expect(figure).toHaveAttribute("data-full", "");
          else await expect(figure).not.toHaveAttribute("data-full");
          if (item.kind === "video") {
            await expect(figure.locator("video")).toHaveAttribute("aria-label", item.alt);
            continue;
          }
          const image = figure.locator("img");
          await expect(image).toHaveAttribute("alt", item.alt);
          await image.scrollIntoViewIfNeeded();
          await expect
            .poll(
              () =>
                image.evaluate(
                  (element: HTMLImageElement) => element.complete && element.naturalWidth > 0,
                ),
              { timeout: 15_000 },
            )
            .toBe(true);
          // Stored sizes, and the API's measured sizes (mediaSizes) for
          // images stored without one, match the files themselves.
          const size = await image.evaluate((element: HTMLImageElement) => ({
            attributes: [element.getAttribute("width"), element.getAttribute("height")],
            natural: [String(element.naturalWidth), String(element.naturalHeight)],
            opacity: getComputedStyle(element).opacity,
          }));
          expect(size.attributes).toEqual(size.natural);
          expect(size.opacity).toBe("1");
        }

        // One column in document order, at every width.
        const boxes = await figures.evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return { top: box.top + window.scrollY, bottom: box.bottom + window.scrollY };
          }),
        );
        for (let index = 1; index < boxes.length; index++) {
          expect(boxes[index].top).toBeGreaterThanOrEqual(boxes[index - 1].bottom - 1);
        }

        await expect(nextLink(page, record)).toBeVisible();
        const panelTop = await nextLink(page, record).evaluate(
          (element) => element.getBoundingClientRect().top + window.scrollY,
        );
        expect(panelTop).toBeGreaterThanOrEqual(boxes.at(-1)!.bottom - 1);
      });
    }
  });
});
