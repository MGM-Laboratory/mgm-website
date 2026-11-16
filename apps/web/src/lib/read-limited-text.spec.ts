import { describe, expect, it, vi } from "vitest";

import { readLimitedText } from "./read-limited-text";

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request("https://site.test/x", { method: "POST", body, headers });
}

function streamOf(chunks: Uint8Array[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return { stream };
}

describe("readLimitedText", () => {
  it("reads a body that fits", async () => {
    expect(await readLimitedText(post("hello"), 100)).toBe("hello");
  });

  it("reads a body that is exactly the limit", async () => {
    expect(await readLimitedText(post("12345"), 5)).toBe("12345");
  });

  it("returns an empty string for a request without a body", async () => {
    expect(await readLimitedText(new Request("https://site.test/x"), 10)).toBe("");
  });

  it("refuses a declared length over the limit without reading", async () => {
    const request = post("tiny", { "content-length": "999" });
    const getReader = vi.spyOn(request.body as ReadableStream, "getReader");

    expect(await readLimitedText(request, 10)).toBeNull();
    expect(getReader).not.toHaveBeenCalled();
  });

  it("ignores a content length that is not a number", async () => {
    expect(await readLimitedText(post("ok", { "content-length": "abc" }), 10)).toBe("ok");
  });

  it("gives up once the body passes the limit, even without a content length", async () => {
    const { stream } = streamOf([new Uint8Array(4).fill(97), new Uint8Array(4).fill(98)]);
    const request = new Request("https://site.test/x", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);

    expect(await readLimitedText(request, 6)).toBeNull();
  });

  it("joins chunks in order and decodes multi byte text", async () => {
    const bytes = new TextEncoder().encode("héllo wörld");
    const { stream } = streamOf([bytes.slice(0, 3), bytes.slice(3, 8), bytes.slice(8)]);
    const request = new Request("https://site.test/x", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);

    expect(await readLimitedText(request, 100)).toBe("héllo wörld");
  });
});
