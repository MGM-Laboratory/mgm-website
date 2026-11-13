import { afterEach, describe, expect, it, vi } from "vitest";

import { OutcomeUnknownError, outcomeUnknown, withTimeout } from "./with-timeout.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("returns the result of work that finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("sent"), 1000, "Mail")).resolves.toBe("sent");
  });

  it("passes on the error of work that fails in time", async () => {
    await expect(withTimeout(Promise.reject(new Error("refused")), 1000, "Mail")).rejects.toThrow(
      "refused",
    );
  });

  it("rejects with the label when work does not finish", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 5000, "Resend");
    const assertion = expect(pending).rejects.toThrow("Resend did not answer within 5000 ms");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("clears its timer when work finishes", async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1), 5000, "Mail");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("marks the timeout as an unknown outcome", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 5000, "Resend");
    const caught = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await caught).toBeInstanceOf(OutcomeUnknownError);
  });
});

describe("outcomeUnknown", () => {
  it("is true for the timeouts of this helper, the AWS SDK and nodemailer", () => {
    expect(outcomeUnknown(new OutcomeUnknownError("x"))).toBe(true);
    const sdk = new Error("socket");
    sdk.name = "TimeoutError";
    expect(outcomeUnknown(sdk)).toBe(true);
    expect(outcomeUnknown(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toBe(true);
  });

  it("is false for a refusal that the provider answered and for other values", () => {
    expect(outcomeUnknown(new Error("Resend: invalid from address"))).toBe(false);
    expect(outcomeUnknown(Object.assign(new Error("x"), { code: "EAUTH" }))).toBe(false);
    expect(outcomeUnknown("timeout")).toBe(false);
    expect(outcomeUnknown(undefined)).toBe(false);
  });
});
