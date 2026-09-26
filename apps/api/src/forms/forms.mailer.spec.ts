import { describe, expect, it } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { buildFormNotificationEmail } from "../mail/templates/form-notification-email.js";
import { buildFormReceiptEmail } from "../mail/templates/form-receipt-email.js";
import { answerRows } from "./forms.mailer.js";

const document = formDocumentSchema.parse({
  title: "Feedback <b>form</b>",
  fields: [
    { id: "name", type: "short_text", label: "Your name" },
    { id: "greet", type: "short_text", label: "Hi {{name}}, anything else?" },
    {
      id: "pick",
      type: "multiple_choice",
      label: "Pick",
      options: [{ id: "a", label: "Apple" }],
    },
    { id: "src", type: "hidden", prefillParam: "src" },
    { id: "h", type: "heading", label: "Section" },
  ],
});

describe("form emails", () => {
  it("renders answered questions in order with piped labels and option labels", () => {
    const rows = answerRows(document, { name: "Ana", greet: "no", pick: "a", src: "ig" });
    expect(rows).toEqual([
      { label: "Your name", value: "Ana" },
      { label: "Hi Ana, anything else?", value: "no" },
      { label: "Pick", value: "Apple" },
    ]);
    expect(answerRows(document, { src: "ig" }, { includeHidden: true })).toEqual([
      { label: "src", value: "ig" },
    ]);
  });

  it("escapes every interpolated value", () => {
    const rows = [{ label: "<script>x</script>", value: `"quoted" & <img src=x onerror=1>` }];
    const notification = buildFormNotificationEmail({
      formTitle: document.title,
      submittedAt: new Date("2026-09-26T10:00:00Z"),
      score: 4,
      rows,
      adminUrl: "https://labmgm.org/admin",
      siteUrl: "https://labmgm.org",
    });
    expect(notification).not.toContain("<script>");
    expect(notification).not.toContain("<img src=x");
    expect(notification).not.toContain("<b>form</b>");
    expect(notification).toContain("&lt;script&gt;");
    expect(notification).toContain("2026-09-26 10:00 UTC");

    const receipt = buildFormReceiptEmail({
      formTitle: "Plain",
      message: "Thanks <u>a lot</u>\nsee you",
      rows,
      siteUrl: "https://labmgm.org",
    });
    expect(receipt).toContain("Thanks &lt;u&gt;a lot&lt;/u&gt;<br />see you");
    expect(receipt).not.toContain("<script>");
  });
});
