import { expect, test, type Page } from "@playwright/test";

import { installProbes } from "./support/projects";

// The public form experience against the CMS fixture's forms
// (e2e/fixtures/cms/forms.json). The fixture records every submission under
// its session id and serves them back at /__forms-fixture/submissions, so
// these specs check what the page actually sent. WebGL is off here
// (`installProbes`), so the DOM scene runs on every engine.

const FIXTURE = `http://127.0.0.1:${process.env.CMS_FIXTURE_PORT ?? "4000"}`;

type Submission = {
  slug: string;
  sessionId: string;
  answers: Record<string, unknown>;
  website?: string;
  deviceId?: string;
  startedAt?: string;
  context?: { timezone?: string; screen?: string };
};

test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await installProbes(page);
});

/** Uncaught errors, and React's hydration complaints (console errors). */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|did not match/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function sessionId(page: Page, slug: string) {
  return page.evaluate((key) => sessionStorage.getItem(key) ?? "", `mgm-form-session:${slug}`);
}

async function submissions(page: Page, slug: string): Promise<Submission[]> {
  const id = await sessionId(page, slug);
  const response = await page.request.get(
    `${FIXTURE}/__forms-fixture/submissions?sessionId=${encodeURIComponent(id)}`,
  );
  return ((await response.json()) as { submissions: Submission[] }).submissions;
}

/** Waits for hydration, so keys and clicks reach React's handlers. */
async function open(page: Page, path: string) {
  const response = await page.goto(path);
  await expect(page.locator(".fx-root[data-hydrated]")).toBeAttached();
  return response;
}

const question = (page: Page, fieldId: string) => page.locator(`[data-field-id="${fieldId}"]`);

test.describe("classic layout", () => {
  test("welcomes, runs its logic, validates, jumps and submits", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/forms/e2e-classic?ref=poster");

    await expect(
      page.getByRole("heading", { level: 1, name: "Come build something with us" }),
    ).toBeVisible();
    await expect(page.getByText("Takes about 2 minutes")).toBeVisible();
    await page.getByRole("button", { name: /Let's begin/ }).click();

    // Page 1: Next without answers shows every required error.
    await expect(
      page.getByRole("heading", { level: 1, name: "Lab open day sign-up" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(question(page, "name").getByRole("alert")).toHaveText("This one needs an answer.");
    await expect(page.locator("#fx-q-name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#fx-q-name")).toBeFocused();

    await page.locator("#fx-q-name").fill("Rahma");
    await page.locator("#fx-q-email").fill("rahma@example");
    await page.locator("#fx-q-email").blur();
    await expect(question(page, "email").getByRole("alert")).toContainText("email address");
    await page.locator("#fx-q-email").fill("rahma@example.com");

    // Logic: the follow-up (with the name piped in) shows for students only.
    const followUp = page.getByRole("textbox", { name: "What do you hope to learn, Rahma?" });
    await expect(followUp).toBeHidden();
    await page.getByRole("radio", { name: "Student" }).check();
    await expect(followUp).toBeVisible();
    await page.getByRole("radio", { name: "Lab staff" }).check();
    await expect(followUp).toBeHidden();

    // The jump: staff skip "Your visit" and land on the last page.
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Almost there" })).toBeVisible();
    await expect(page.getByText("Page 2 of 2", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: /Submit/ }).click();
    await expect(question(page, "photos").getByRole("alert")).toHaveText(
      "This one needs an answer.",
    );
    await expect(question(page, "consent").getByRole("alert")).toHaveText(
      "Please agree to continue.",
    );
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Submit/ }).click();

    // The ending picked by the fixture (staff) and what was sent.
    await expect(page.getByRole("heading", { level: 1, name: "See you backstage" })).toBeVisible();
    await expect.poll(async () => (await submissions(page, "e2e-classic")).length).toBe(1);
    const [sent] = await submissions(page, "e2e-classic");
    expect(sent.answers).toEqual({
      name: "Rahma",
      email: "rahma@example.com",
      role: "staff",
      photos: true,
      consent: true,
      ref: "poster",
    });
    expect(sent.website).toBe("");
    expect(sent.deviceId).toBeTruthy();
    expect(sent.startedAt).toBeTruthy();
    expect(sent.context?.timezone).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test("shows the server's field errors next to their fields", async ({ page }) => {
    await open(page, "/forms/e2e-classic");
    await page.getByRole("button", { name: /Let's begin/ }).click();
    await page.locator("#fx-q-name").fill("server-error");
    await page.locator("#fx-q-email").fill("rahma@example.com");
    await page.getByRole("radio", { name: "Lab staff" }).check();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("radio", { name: "No" }).check();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Submit/ }).click();
    // The fixture refuses the answer: the page goes back to its question.
    await expect(
      page.getByRole("heading", { level: 1, name: "Lab open day sign-up" }),
    ).toBeVisible();
    await expect(question(page, "name").getByRole("alert")).toHaveText(
      "That answer doesn't look right.",
    );
  });
});

test.describe("conversational layout", () => {
  test("runs on the keyboard alone", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/forms/e2e-chat");
    const nickname = page.getByRole("textbox", { name: /your nickname/ });
    await expect(nickname).toBeVisible();
    await nickname.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("This one needs an answer.")).toBeVisible();
    await page.keyboard.type("Kopi");
    await page.keyboard.press("Enter");

    // A letter picks a choice, and a single pick moves on by itself.
    await expect(page.getByRole("heading", { name: "Pick a brew, Kopi" })).toBeVisible();
    await page.keyboard.press("b");
    await expect(page.getByRole("heading", { name: "How was today's cup?" })).toBeVisible();
    await page.keyboard.press("4");
    const notes = page.getByRole("textbox", { name: "Anything else to tell the barista?" });
    await expect(notes).toBeFocused();
    await page.keyboard.type("More foam");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("please");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 1, name: "Cheers!" })).toBeVisible();
    await expect.poll(async () => (await submissions(page, "e2e-chat")).length).toBe(1);
    const [sent] = await submissions(page, "e2e-chat");
    // Without a welcome, the first answer is the start.
    expect(sent.startedAt).toBeTruthy();
    expect(sent.answers).toEqual({
      nickname: "Kopi",
      flavour: "latte",
      rating: 4,
      notes: "More foam\nplease",
    });
    expect(errors).toEqual([]);
  });
});

test.describe("date and time pickers", () => {
  // A fixed clock and zone, so "today" and the fixture's allowed range agree.
  test.use({ timezoneId: "Asia/Jakarta" });
  test.beforeEach(async ({ page }) => {
    // Time still flows (the layouts animate), from a known morning.
    await page.clock.install({ time: new Date("2026-09-26T10:00:00+07:00") });
    await page.clock.resume();
  });

  const dialog = (page: Page) => page.getByRole("dialog");
  const field = (page: Page, fieldId: string) => page.locator(`#fx-q-${fieldId}`);

  test("picks, types and bounds dates and times", async ({ page, isMobile }) => {
    const errors = collectErrors(page);
    await open(page, "/forms/e2e-dates");

    // The calendar opens on today, and the keyboard picks a day.
    await question(page, "visit").getByRole("button", { name: "Choose a date" }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator("th").first()).toHaveText("Sun");
    const today = dialog(page).getByRole("gridcell", {
      name: "Today, Saturday, 26 September 2026",
    });
    await expect(today).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeHidden();
    await expect(field(page, "visit")).toHaveValue("Sun, 27 September 2026");
    await expect(field(page, "visit")).toBeFocused();

    // Outside min and max, days are disabled and the keyboard stops at the edge.
    await question(page, "visit").getByRole("button", { name: "Choose a date" }).click();
    await expect(dialog(page).locator('[data-day="2026-09-09"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("PageDown");
    await page.keyboard.press("PageDown");
    await expect(
      dialog(page).getByRole("gridcell", { name: "Tuesday, 20 October 2026" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(
      dialog(page).getByRole("gridcell", { name: "Tuesday, 20 October 2026" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field(page, "visit")).toHaveValue("Tue, 20 October 2026");

    // A birth date by the year list and the month grid.
    await question(page, "birthday").getByRole("button", { name: "Choose a date" }).click();
    await dialog(page)
      .getByRole("button", { name: /^Choose a year/ })
      .click();
    await dialog(page).getByRole("button", { name: "1994", exact: true }).click();
    await dialog(page).getByRole("button", { name: "March 1994" }).click();
    await dialog(page).getByRole("gridcell", { name: "Monday, 14 March 1994" }).click();
    await expect(field(page, "birthday")).toHaveValue("Mon, 14 March 1994");

    // A time from the columns.
    await question(page, "arrival").getByRole("button", { name: "Choose a time" }).click();
    await dialog(page)
      .getByRole("listbox", { name: "Hours" })
      .getByRole("option", { name: "2", exact: true })
      .click();
    await dialog(page)
      .getByRole("listbox", { name: "Minutes" })
      .getByRole("option", { name: "30", exact: true })
      .click();
    await dialog(page)
      .getByRole("listbox", { name: "AM or PM" })
      .getByRole("option", { name: "PM" })
      .click();
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expect(field(page, "arrival")).toHaveValue("2:30 PM");

    if (isMobile) {
      // Touch screens tap into the sheet: the day, then the time.
      await field(page, "call").click();
      await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
      await dialog(page).getByRole("gridcell", { name: "Sunday, 27 September 2026" }).click();
      await dialog(page)
        .getByRole("listbox", { name: "Hours" })
        .getByRole("option", { name: "9", exact: true })
        .click();
      await dialog(page)
        .getByRole("listbox", { name: "Minutes" })
        .getByRole("option", { name: "05", exact: true })
        .click();
      await dialog(page).getByRole("button", { name: "Done" }).click();
    } else {
      // A click opens the panel with focus kept in the field; ArrowDown moves
      // in, and focus leaving for another field closes it.
      await field(page, "call").click();
      await expect(dialog(page)).toBeVisible();
      await expect(field(page, "call")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(dialog(page).locator('[role="gridcell"][tabindex="0"]')).toBeFocused();
      await field(page, "arrival").focus();
      await expect(dialog(page)).toBeHidden();

      // Typed values are read leniently; one that can't be read says so.
      await field(page, "call").fill("27/09/2026 9:05 am");
      await field(page, "call").blur();
      await field(page, "birthday").fill("31/02/1994");
      await field(page, "birthday").blur();
      await expect(question(page, "birthday").getByText("Enter a valid date.")).toBeVisible();
      await field(page, "birthday").fill("14 Mar 1994");
      await field(page, "birthday").blur();
      await expect(field(page, "birthday")).toHaveValue("Mon, 14 March 1994");
      await expect(question(page, "birthday").getByText("Enter a valid date.")).toBeHidden();
    }
    // Engines' Intl data abbreviate September as "Sept" or "Sep".
    await expect(field(page, "call")).toHaveValue(/^Sun, 27 Sept? 2026, 9:05 AM$/);

    await page.getByRole("button", { name: /Submit/ }).click();
    await expect.poll(async () => (await submissions(page, "e2e-dates")).length).toBe(1);
    const [sent] = await submissions(page, "e2e-dates");
    expect(sent.answers).toEqual({
      visit: "2026-10-20",
      birthday: "1994-03-14",
      arrival: "14:30",
      call: "2026-09-27T09:05",
    });
    expect(errors).toEqual([]);
  });

  test("speaks Indonesian and keeps Enter for the picker while it is open", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/forms/e2e-dates-id");
    const day = field(page, "hari");
    await expect(day).toBeVisible();
    await day.focus();
    await page.keyboard.press("ArrowDown");
    await expect(dialog(page).locator("th").first()).toHaveText("Sen");
    await expect(
      dialog(page).getByRole("gridcell", { name: "Hari ini, Sabtu, 26 September 2026" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    // Enter picks the day and stays on the question.
    await page.keyboard.press("Enter");
    await expect(day).toHaveValue("Jum, 25 September 2026");
    await expect(page.getByRole("heading", { name: /Hari kunjungan/ })).toBeVisible();
    // Closed, Enter moves on.
    await page.keyboard.press("Enter");
    const time = field(page, "jam");
    await expect(time).toBeFocused();

    await page.keyboard.press("ArrowDown");
    const hours = dialog(page).getByRole("listbox", { name: "Jam" });
    await expect(hours).toBeFocused();
    // Nothing picked yet: the column starts at 09.
    await page.keyboard.press("ArrowDown");
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("ArrowRight");
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(time).toHaveValue("14:30");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeHidden();
    await expect(time).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 1, name: "Terima kasih" })).toBeVisible();
    await expect.poll(async () => (await submissions(page, "e2e-dates-id")).length).toBe(1);
    const [sent] = await submissions(page, "e2e-dates-id");
    expect(sent.answers).toEqual({ hari: "2026-09-25", jam: "14:30" });
    expect(errors).toEqual([]);
  });
});

test.describe("hydration", () => {
  test("country lists from the browser's Intl data hydrate cleanly", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/forms/e2e-intl");
    await expect(page.getByRole("heading", { level: 1, name: "Contact details" })).toBeVisible();
    // The phone's calling codes arrive after hydration, named in Indonesian.
    await expect(page.locator("#fx-q-phone-country option")).not.toHaveCount(1);
    await page.locator("#fx-q-country").fill("jep");
    await expect(page.getByRole("listbox").getByRole("option", { name: /Jepang/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("states", () => {
  test("an unknown slug is a 404", async ({ page }) => {
    const response = await page.goto("/forms/e2e-no-such-form");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "This form isn't here" }),
    ).toBeVisible();
  });

  test("a locked form unlocks without a reload", async ({ page }) => {
    await open(page, "/forms/e2e-locked");
    await expect(page.getByRole("heading", { level: 1, name: "Members' vote" })).toBeVisible();
    await page.getByLabel("Passphrase").fill("open says me");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.locator("#fx-passphrase-error")).toContainText("doesn't open this form");
    await page.getByLabel("Passphrase").fill("sesame");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("textbox", { name: "Your proposal" })).toBeVisible();
  });

  test("a form that isn't open yet counts down, a closed one says so", async ({ page }) => {
    await open(page, "/forms/e2e-soon");
    await expect(page.getByRole("heading", { level: 1, name: "Not open yet" })).toBeVisible();
    await expect(page.getByRole("timer")).not.toContainText("--");
    await open(page, "/forms/e2e-closed");
    await expect(
      page.getByRole("heading", { level: 1, name: "The survey has wrapped up" }),
    ).toBeVisible();
    await expect(page.getByText("Results are coming soon.")).toBeVisible();
  });
});

test.describe("preferences", () => {
  test("reduced motion shows everything at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/forms/e2e-classic");
    const firstLetter = page.locator(".fx-welcome-title .fx-char").first();
    await expect(firstLetter).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: /Let's begin/ }).click();
    const blocks = page.locator(".fx-collapse:not([hidden]) [data-reveal]");
    await expect(blocks.first()).toHaveCSS("opacity", "1");
    await expect(blocks.last()).toHaveCSS("opacity", "1");
    // No loose pieces float.
    await expect(page.locator(".fx-piece-shape").first()).toHaveCSS("animation-name", "none");
  });

  test("dark mode wears the theme's dark palette", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, "/forms/e2e-classic");
    await expect(page.locator("html")).toHaveClass(/dark/);
    // Laboratory's dark background.
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(13, 19, 32)");
    await expect(page.getByRole("button", { name: /Let's begin/ })).toBeVisible();
  });
});
