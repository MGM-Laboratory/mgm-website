import { describe, expect, it, vi } from "vitest";

import { buildContactConfirmationEmail } from "./contact-confirmation-email.js";
import { buildEventRegistrationConfirmationEmail } from "./event-registration-confirmation-email.js";
import { renderFormAnswersTable } from "./form-answers-table.js";
import { buildFormNotificationEmail } from "./form-notification-email.js";
import { buildFormReceiptEmail } from "./form-receipt-email.js";
import { buildJobApplicationConfirmationEmail } from "./job-application-confirmation-email.js";
import { sendConfirmationEmail } from "../send-confirmation-email.js";

const SITE = "https://site.example.org/";

describe("contact confirmation email", () => {
  it("escapes the name and message and keeps line breaks", () => {
    const html = buildContactConfirmationEmail({
      message: "line one\n<b>line two</b>",
      name: "<script>x</script>",
      siteUrl: SITE,
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("line one<br />&lt;b&gt;line two&lt;/b&gt;");
    expect(html).toContain("https://site.example.org");
  });
});

describe("job application confirmation email", () => {
  it("names the role and links to the careers page", () => {
    const html = buildJobApplicationConfirmationEmail({
      jobTitle: "Research <Assistant>",
      name: "Ayu",
      siteUrl: SITE,
    });
    expect(html).toContain("Research &lt;Assistant&gt;");
    expect(html).toContain("https://site.example.org/careers");
    expect(html).toContain("Hi Ayu");
  });
});

describe("event registration confirmation email", () => {
  const base = {
    eventSlug: "open day/2030",
    eventTitle: "Open Day",
    name: "Budi",
    siteUrl: SITE,
    timezoneOffset: 7,
  };

  it("formats a same day timed event in the event timezone", () => {
    const html = buildEventRegistrationConfirmationEmail({
      ...base,
      allDay: false,
      endAt: "2030-03-05T05:30:00Z",
      startAt: "2030-03-05T02:00:00Z",
    });
    expect(html).toContain("Tuesday, March 5, 2030, 9:00 AM - 12:30 PM (GMT+7)");
    expect(html).toContain("https://site.example.org/events/open%20day%2F2030");
  });

  it("formats a multi day timed event with both dates", () => {
    const html = buildEventRegistrationConfirmationEmail({
      ...base,
      allDay: false,
      endAt: "2030-03-06T10:00:00Z",
      startAt: "2030-03-05T02:00:00Z",
      timezoneOffset: -5,
    });
    expect(html).toContain("(GMT-5)");
    expect(html).toContain("Monday, March 4, 2030 9:00 PM");
    expect(html).toContain("Wednesday, March 6, 2030 5:00 AM");
  });

  it("formats an all day event on one day and across days", () => {
    const single = buildEventRegistrationConfirmationEmail({
      ...base,
      allDay: true,
      endAt: "2030-03-05T10:00:00Z",
      startAt: "2030-03-05T02:00:00Z",
    });
    expect(single).toContain("Tuesday, March 5, 2030");
    expect(single).not.toContain("GMT+7");
    const range = buildEventRegistrationConfirmationEmail({
      ...base,
      allDay: true,
      endAt: "2030-03-07T02:00:00Z",
      startAt: "2030-03-05T02:00:00Z",
    });
    expect(range).toContain("Tuesday, March 5, 2030 - Thursday, March 7, 2030");
  });

  it("adds the location row only when a location is given", () => {
    const withLocation = buildEventRegistrationConfirmationEmail({
      ...base,
      allDay: true,
      endAt: "2030-03-05T10:00:00Z",
      location: "Room <3>",
      startAt: "2030-03-05T02:00:00Z",
    });
    expect(withLocation).toContain("Room &lt;3&gt;");
    const without = buildEventRegistrationConfirmationEmail({
      ...base,
      allDay: true,
      endAt: "2030-03-05T10:00:00Z",
      startAt: "2030-03-05T02:00:00Z",
    });
    expect(without).not.toContain("Location");
  });
});

describe("form answers table", () => {
  it("says so when there are no answers", () => {
    expect(renderFormAnswersTable([])).toContain("No answers were given.");
  });

  it("escapes labels and values and separates rows with a border", () => {
    const html = renderFormAnswersTable([
      { label: "Name <1>", value: "a\nb" },
      { label: "Mail", value: "<x@y>" },
    ]);
    expect(html).toContain("Name &lt;1&gt;");
    expect(html).toContain("a<br />b");
    expect(html).toContain("&lt;x@y&gt;");
    expect(html.match(/border-top:1px solid/g)).toHaveLength(1);
  });
});

describe("form notification email", () => {
  const rows = [{ label: "Q", value: "A" }];

  it("shows the score when the form is scored", () => {
    const html = buildFormNotificationEmail({
      adminUrl: "https://admin.example.org/forms?a=1&b=2",
      formTitle: "Survey",
      rows,
      score: 7,
      siteUrl: SITE,
      submittedAt: new Date("2030-03-05T10:15:59Z"),
    });
    expect(html).toContain("2030-03-05 10:15 UTC");
    expect(html).toContain("Score:");
    expect(html).toContain("a=1&amp;b=2");
  });

  it("omits the score line when the form is not scored", () => {
    const html = buildFormNotificationEmail({
      adminUrl: "https://admin.example.org",
      formTitle: "Survey",
      rows,
      score: null,
      siteUrl: SITE,
      submittedAt: new Date("2030-03-05T10:15:59Z"),
    });
    expect(html).not.toContain("Score:");
  });
});

describe("form receipt email", () => {
  it("uses the default thanks line without a message", () => {
    const html = buildFormReceiptEmail({
      formTitle: "Survey",
      rows: [],
      siteUrl: SITE,
    });
    expect(html).toContain("Thanks for responding to");
  });

  it("uses a trimmed and escaped admin message when given", () => {
    const html = buildFormReceiptEmail({
      formTitle: "Survey",
      message: "  hello <b>\nthere  ",
      rows: [{ label: "Q", value: "A" }],
      siteUrl: SITE,
    });
    expect(html).toContain("hello &lt;b&gt;<br />there");
    expect(html).not.toContain("Thanks for responding to");
  });

  it("falls back to the default line for a blank message", () => {
    const html = buildFormReceiptEmail({
      formTitle: "Survey",
      message: "   ",
      rows: [],
      siteUrl: SITE,
    });
    expect(html).toContain("Thanks for responding to");
  });
});

describe("sendConfirmationEmail", () => {
  const params = { html: "<p/>", subject: "s", to: "a@example.org" };

  it("sends without waiting and stays quiet on success", async () => {
    const mail = { sendEmail: vi.fn(async () => undefined) };
    const logger = { warn: vi.fn() };
    sendConfirmationEmail(mail as never, logger as never, "failed", params);
    await Promise.resolve();
    expect(mail.sendEmail).toHaveBeenCalledWith(params);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs only the stack when the send fails", async () => {
    const error = new Error("secret transport detail");
    const mail = { sendEmail: vi.fn(async () => Promise.reject(error)) };
    const logger = { warn: vi.fn() };
    sendConfirmationEmail(mail as never, logger as never, "failed", params);
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.warn).toHaveBeenCalledWith("failed", error.stack);
  });

  it("logs a non Error rejection as a string", async () => {
    const mail = { sendEmail: vi.fn(async () => Promise.reject("boom")) };
    const logger = { warn: vi.fn() };
    sendConfirmationEmail(mail as never, logger as never, "failed", params);
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.warn).toHaveBeenCalledWith("failed", "boom");
  });
});
