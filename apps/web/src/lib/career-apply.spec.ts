import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { submitApplication, type ApplyPayload } from "./career-apply";

class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  status = 0;
  responseText = "";
  body: FormData | undefined;
  upload: {
    onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
  } = {};
  onload?: () => void;
  onerror?: () => void;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
}

function payload(extra: Partial<ApplyPayload> = {}): ApplyPayload {
  return {
    applicantType: "general",
    fullName: "Ada",
    email: "ada@example.test",
    phoneCountry: "ID",
    phoneNumber: "81234",
    motivation: "Because",
    agreedToTerms: true,
    cvFile: new File(["cv"], "cv.pdf", { type: "application/pdf" }),
    ...extra,
  };
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitApplication", () => {
  it("posts the form to the proxy of the job", async () => {
    const result = submitApplication("front end/1", payload());
    const xhr = FakeXhr.last;
    xhr.status = 201;
    xhr.onload?.();

    expect(await result).toEqual({ ok: true });
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/careers-cms/front%20end%2F1/apply");
    expect(xhr.body?.get("fullName")).toBe("Ada");
    expect(xhr.body?.get("agreedToTerms")).toBe("true");
    expect((xhr.body?.get("cv") as File).name).toBe("cv.pdf");
    expect(xhr.body?.has("nim")).toBe(false);
    expect(xhr.body?.has("faculty")).toBe(false);
  });

  it("adds the student fields for a UB student and defaults them to empty", async () => {
    submitApplication(
      "j",
      payload({ applicantType: "ub-student", nim: "245150300111024", faculty: "FILKOM" }),
    );
    expect(FakeXhr.last.body?.get("nim")).toBe("245150300111024");
    expect(FakeXhr.last.body?.get("faculty")).toBe("FILKOM");

    submitApplication("j", payload({ applicantType: "ub-student", agreedToTerms: false }));
    expect(FakeXhr.last.body?.get("nim")).toBe("");
    expect(FakeXhr.last.body?.get("faculty")).toBe("");
    expect(FakeXhr.last.body?.get("agreedToTerms")).toBe("false");
  });

  it("reports upload progress as a fraction, only when it can be computed", () => {
    const onProgress = vi.fn();
    submitApplication("j", payload(), onProgress);
    const { upload } = FakeXhr.last;

    upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 100 });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0.25);
  });

  it("ignores progress when nobody listens", () => {
    submitApplication("j", payload());

    expect(() =>
      FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 }),
    ).not.toThrow();
  });

  it("returns the message of the API for a refusal", async () => {
    const result = submitApplication("j", payload());
    FakeXhr.last.status = 422;
    FakeXhr.last.responseText = JSON.stringify({ message: "The CV is too large." });
    FakeXhr.last.onload?.();

    expect(await result).toEqual({ ok: false, message: "The CV is too large." });
  });

  it.each([
    ["an empty message", JSON.stringify({ message: "" })],
    ["a message that is not text", JSON.stringify({ message: ["a"] })],
    ["a body that is not JSON", "<html>"],
  ])("falls back to a general message for %s", async (_name, text) => {
    const result = submitApplication("j", payload());
    FakeXhr.last.status = 500;
    FakeXhr.last.responseText = text;
    FakeXhr.last.onload?.();

    expect(await result).toEqual({
      ok: false,
      message: "We could not submit your application. Please try again.",
    });
  });

  it("tells the visitor when the server cannot be reached", async () => {
    const result = submitApplication("j", payload());
    FakeXhr.last.onerror?.();

    expect(await result).toEqual({
      ok: false,
      message: "We could not reach the server. Check your connection and try again.",
    });
  });
});
