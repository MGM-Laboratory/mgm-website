import { expect, test } from "@playwright/test";

const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/labmgmfilkomub/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/mgmlab" },
];

test.describe("footer", () => {
  test("uses the header surface and contains only the requested social links", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    await expect(footer).not.toContainText("Let's make something meaningful.");
    await expect(footer).not.toContainText("Research, technology, and ideas brought together.");
    await expect(footer).not.toContainText("Explore");
    await expect(footer).not.toContainText("Malang (ID)");
    await expect(footer).toContainText(
      "© 2026 MGM Research Laboratory. Built for research. Designed for impact.",
    );
    await expect(footer).toContainText("Location");

    const socialNav = footer.getByRole("navigation", { name: "Social links" });
    const socialLinks = socialNav.getByRole("link");
    await expect(socialLinks).toHaveCount(SOCIAL_LINKS.length);

    for (const social of SOCIAL_LINKS) {
      const link = socialNav.getByRole("link", { name: social.label });
      await expect(link).toHaveAttribute("href", social.href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }

    // The header is frosted glass, a translucent tint of its surface colour,
    // so the footer is compared against that opaque surface (resolved
    // through a probe inside the header), not the header's own background.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const footer = document.querySelector("footer");
          const header = document.querySelector("header");
          if (!footer || !header) return false;
          const probe = document.createElement("span");
          probe.style.backgroundColor = "var(--header-surface)";
          header.append(probe);
          const surface = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return getComputedStyle(footer).backgroundColor === surface;
        }),
      )
      .toBe(true);
  });

  test("reveals the external-link cue on hover", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "Touch-only projects do not have a hover state.",
    );
    // The scroll below may take up to 25 seconds on a slow runner, so the default 30 seconds of a test is not enough
    test.setTimeout(60_000);
    await page.goto("/");

    const instagram = page.locator('footer a[href="https://www.instagram.com/labmgmfilkomub/"]');
    // A native scroll to the bottom, repeated until the link shows. On "/" ScrollSmoother follows the native scroll and catches up
    // a little later. A loop of wheel events never brought the link into view on macOS WebKit.
    await expect
      .poll(
        async () =>
          instagram.evaluate((element) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const box = element.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= window.innerHeight;
          }),
        { intervals: [100], timeout: 25_000 },
      )
      .toBe(true);
    await expect(instagram).toBeInViewport();
    await expect
      .poll(() =>
        instagram.locator("svg").evaluate((element) => Number(getComputedStyle(element).opacity)),
      )
      .toBe(0);
    await expect
      .poll(() =>
        instagram
          .locator("span")
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).scale)),
      )
      .toBe(0);
    await instagram.hover();

    await expect
      .poll(() =>
        instagram.locator("svg").evaluate((element) => Number(getComputedStyle(element).opacity)),
      )
      .toBe(1);
    await expect
      .poll(() =>
        instagram
          .locator("span")
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).scale)),
      )
      .toBe(1);
  });
});
