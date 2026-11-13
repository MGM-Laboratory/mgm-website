import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "./fetch-timeout";

// A fetch that never answers until its signal aborts, like a server that accepted the connection and then stalled
function stalledFetch() {
  return vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
}

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects with a TimeoutError when the headers do not arrive in time", async () => {
    vi.stubGlobal("fetch", stalledFetch());

    const pending = fetchWithTimeout("http://api.test/x", undefined, 5_000);
    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(5_000);

    await assertion;
  });

  it("returns the response and does not abort afterwards", async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        seen = init?.signal ?? undefined;
        return new Response("ok");
      }),
    );

    const response = await fetchWithTimeout("http://api.test/x", undefined, 5_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await response.text()).toBe("ok");
    expect(seen?.aborted).toBe(false);
  });

  it("follows a signal of the caller too", async () => {
    vi.stubGlobal("fetch", stalledFetch());
    const caller = new AbortController();

    const pending = fetchWithTimeout("http://api.test/x", { signal: caller.signal }, 5_000);
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    caller.abort();

    await assertion;
  });
});
