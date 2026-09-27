import { expect, test } from "@playwright/test";

// The homepage reel (components/reel). The CMS fixture has no home video, so
// the section keeps its chapter, draws its test card and says the film is on
// its way instead of offering a play button. The suite fails every WebGL
// request, so this is the DOM version of the section.

test("the reel introduces the lab and leads to its story", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const reel = page.getByRole("region", { name: /^Curious Ideas,\s*Built for Real$/ });
  await expect(reel).toHaveCount(1);
  await reel.scrollIntoViewIfNeeded();

  await expect(reel.getByText("Chapter 03: Meet the lab")).toHaveCount(1);
  await expect(reel.getByText(/^We are researchers, designers and engineers/)).toBeVisible();
  await expect(reel.getByText("Our film is on its way.")).toBeVisible();
  // No video, nothing to play.
  await expect(reel.getByRole("button", { name: "Play the company profile video" })).toHaveCount(0);

  const story = reel.getByRole("link", { name: /Our story/ });
  await expect(story).toHaveAttribute("href", "/about");
  expect(errors).toEqual([]);
});
