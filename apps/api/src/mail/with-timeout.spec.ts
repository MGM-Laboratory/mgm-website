import { afterEach, describe, expect, it, vi } from "vitest";

import { withTimeout } from "./with-timeout.js";

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
});
