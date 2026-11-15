import { beforeEach, describe, expect, it, vi } from "vitest";

import { StorageService } from "./storage.service.js";

const presigner = vi.hoisted(() => ({ getSignedUrl: vi.fn(async (..._args: unknown[]) => "") }));
vi.mock("@aws-sdk/s3-request-presigner", () => presigner);

type Send = ReturnType<typeof vi.fn>;
type Internals = { client: { send: Send }; uploadClient: { send: Send } };

function makeService(settings: Record<string, unknown> = {}) {
  const cache = {
    getJson: vi.fn(async (): Promise<string | undefined> => undefined),
    setJson: vi.fn(async (..._args: unknown[]) => undefined),
  };
  const config = { get: (key: string) => ({ AWS_S3_BUCKET: "bucket", ...settings })[key] };
  const service = new StorageService(config as never, cache as never);
  const internals = service as unknown as Internals;
  internals.client = { send: vi.fn() };
  internals.uploadClient = { send: vi.fn(async () => ({})) };
  return { cache, internals, service };
}

beforeEach(() => {
  presigner.getSignedUrl.mockReset();
});

describe("StorageService with a bucket", () => {
  it("uploads with an immutable cache header on the upload client", async () => {
    const { internals, service } = makeService();
    const result = await service.uploadFile({
      body: Buffer.from("x"),
      contentType: "image/png",
      key: "a.png",
    });
    expect(result).toEqual({ key: "a.png" });
    const command = internals.uploadClient.send.mock.calls[0][0] as {
      input: Record<string, unknown>;
    };
    expect(command.input).toMatchObject({
      Bucket: "bucket",
      CacheControl: "public, max-age=31536000, immutable",
      ContentType: "image/png",
      Key: "a.png",
    });
    expect(internals.client.send).not.toHaveBeenCalled();
  });

  it("generates a key when none is given", async () => {
    const { service } = makeService();
    const { key } = await service.uploadFile({ body: new Uint8Array([1]), contentType: "x/y" });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("builds the clients with explicit credentials when both parts are set", () => {
    expect(() =>
      makeService({ AWS_ACCESS_KEY_ID: "id", AWS_REGION: "auto", AWS_SECRET_ACCESS_KEY: "secret" }),
    ).not.toThrow();
  });

  it("returns a cached download URL without signing", async () => {
    const { cache, service } = makeService();
    cache.getJson.mockResolvedValue("https://cached.example/x");
    expect(await service.getSignedDownloadUrl("k")).toBe("https://cached.example/x");
    expect(cache.getJson).toHaveBeenCalledWith("cms:media-url:k");
    expect(presigner.getSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a URL and caches it for a minute less than it lives", async () => {
    const { cache, service } = makeService();
    presigner.getSignedUrl.mockResolvedValue("https://signed.example/x");
    expect(await service.getSignedDownloadUrl("k", 900)).toBe("https://signed.example/x");
    expect(presigner.getSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 900 });
    expect(cache.setJson).toHaveBeenCalledWith("cms:media-url:k", "https://signed.example/x", 840);
  });

  it("never caches a URL for less than one second", async () => {
    const { cache, service } = makeService();
    presigner.getSignedUrl.mockResolvedValue("https://signed.example/x");
    await service.getSignedDownloadUrl("k", 30);
    expect(cache.setJson.mock.calls[0][2]).toBe(1);
  });

  it("uses a one hour expiry by default", async () => {
    const { service } = makeService();
    presigner.getSignedUrl.mockResolvedValue("u");
    await service.getSignedDownloadUrl("k");
    expect(presigner.getSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 3600 });
  });

  it("reads an object into a buffer", async () => {
    const { internals, service } = makeService();
    internals.client.send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentLength: 3,
    });
    const bytes = await service.readFile("k", 10);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(internals.client.send.mock.calls[0][1]).toHaveProperty("abortSignal");
  });

  it("refuses an object that is larger than the limit before reading it", async () => {
    const { internals, service } = makeService();
    const transform = vi.fn();
    internals.client.send.mockResolvedValue({
      Body: { transformToByteArray: transform },
      ContentLength: 11,
    });
    await expect(service.readFile("k", 10)).rejects.toThrow("Object k is larger than 10 bytes");
    expect(transform).not.toHaveBeenCalled();
  });

  it("refuses an object without a body", async () => {
    const { internals, service } = makeService();
    internals.client.send.mockResolvedValue({ ContentLength: 1 });
    await expect(service.readFile("k", 10)).rejects.toThrow("Object k has no body");
  });

  it("treats a missing content length as small and checks the body size by reading it", async () => {
    const { internals, service } = makeService();
    internals.client.send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array() },
    });
    // An empty array is still a body, so the buffer is empty and not an error.
    expect((await service.readFile("k", 10)).length).toBe(0);
  });

  it("deletes through the shared client", async () => {
    const { internals, service } = makeService();
    internals.client.send.mockResolvedValue({});
    await service.deleteFile("k");
    const command = internals.client.send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(command.input).toEqual({ Bucket: "bucket", Key: "k" });
  });
});
