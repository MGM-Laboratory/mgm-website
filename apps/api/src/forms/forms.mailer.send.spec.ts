import { describe, expect, it, vi } from "vitest";

import { formDocumentSchema } from "@repo/shared";

import { FormsMailer } from "./forms.mailer.js";

function documentWith(settings: Record<string, unknown>, title = "Feedback") {
  return formDocumentSchema.parse({
    title,
    fields: [
      { id: "email", type: "email", label: "Email" },
      { id: "name", type: "short_text", label: "Name" },
      { id: "src", type: "hidden", prefillParam: "src" },
    ],
    settings,
  });
}

function response(answers: Record<string, unknown>) {
  return { answers, createdAt: new Date("2030-01-01T10:00:00Z"), score: null } as never;
}

function make() {
  const mail = { sendEmail: vi.fn(async (..._args: unknown[]) => undefined) };
  const config = { get: () => "https://site.example.org/" };
  return { mail, mailer: new FormsMailer(mail as never, config as never) };
}

describe("FormsMailer.responseReceived", () => {
  it("sends nothing when there are no notify addresses and receipts are off", () => {
    const { mail, mailer } = make();
    mailer.responseReceived(documentWith({}), response({ name: "Ana" }));
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it("sends one notification to each notify address, with hidden answers included", () => {
    const { mail, mailer } = make();
    mailer.responseReceived(
      documentWith({ notifyEmails: ["a@example.org", "b@example.org"] }),
      response({ name: "Ana", src: "instagram" }),
    );
    expect(mail.sendEmail).toHaveBeenCalledTimes(2);
    const first = mail.sendEmail.mock.calls[0][0] as { html: string; subject: string; to: string };
    expect(first.to).toBe("a@example.org");
    expect(first.subject).toBe("New response: Feedback");
    expect(first.html).toContain("instagram");
    expect(first.html).toContain("https://site.example.org/admin");
    expect((mail.sendEmail.mock.calls[1][0] as { to: string }).to).toBe("b@example.org");
  });

  it("caps the subject at 200 characters", () => {
    const { mail, mailer } = make();
    mailer.responseReceived(
      documentWith({ notifyEmails: ["a@example.org"] }, "T".repeat(200)),
      response({ name: "Ana" }),
    );
    const subject = (mail.sendEmail.mock.calls[0][0] as { subject: string }).subject;
    expect(subject).toHaveLength(200);
  });

  it("sends a receipt to the address in the chosen question, without the hidden answers", () => {
    const { mail, mailer } = make();
    mailer.responseReceived(
      documentWith({
        receipt: { enabled: true, emailFieldId: "email", message: "Thank you", subject: "Got it" },
      }),
      response({ email: " ana@example.org ", name: "Ana", src: "secret-source" }),
    );
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    const params = mail.sendEmail.mock.calls[0][0] as { html: string; subject: string; to: string };
    expect(params.to).toBe("ana@example.org");
    expect(params.subject).toBe("Got it");
    expect(params.html).toContain("Thank you");
    expect(params.html).not.toContain("secret-source");
  });

  it("uses a default receipt subject when none is set", () => {
    const { mail, mailer } = make();
    mailer.responseReceived(
      documentWith({ receipt: { enabled: true, emailFieldId: "email", subject: "" } }),
      response({ email: "ana@example.org" }),
    );
    expect((mail.sendEmail.mock.calls[0][0] as { subject: string }).subject).toBe(
      "Your response to Feedback",
    );
  });

  it("sends no receipt when the answer is not an address or is missing", () => {
    const { mail, mailer } = make();
    const document = documentWith({ receipt: { enabled: true, emailFieldId: "email" } });
    mailer.responseReceived(document, response({ email: "not-an-address" }));
    mailer.responseReceived(document, response({ email: 42 }));
    mailer.responseReceived(document, response({}));
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it("sends no receipt when receipts are on but no question is chosen", () => {
    const { mail, mailer } = make();
    mailer.responseReceived(
      documentWith({ receipt: { enabled: true } }),
      response({ email: "ana@example.org" }),
    );
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it("falls back to the field id when a question has no label and no prefill name", async () => {
    const { answerRows } = await import("./forms.mailer.js");
    const document = formDocumentSchema.parse({
      title: "T",
      fields: [{ id: "q1", type: "short_text" }],
    });
    expect(answerRows(document, { q1: "x" })).toEqual([{ label: "q1", value: "x" }]);
  });
});
