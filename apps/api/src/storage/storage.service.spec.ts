import { describe, expect, it } from "vitest";

import { StorageConfigurationError, StorageService } from "./storage.service.js";

function makeService(settings: Record<string, unknown> = {}) {
  const config = { get: (key: string) => settings[key] };
  const cache = { getJson: async () => undefined, setJson: async () => undefined };
  return new StorageService(config as never, cache as never);
}

describe("StorageService without a bucket", () => {
  it("builds its clients from the settings and refuses an upload", async () => {
    const service = makeService({ AWS_REGION: "auto", AWS_S3_FORCE_PATH_STYLE: false });
    await expect(
      service.uploadFile({ body: Buffer.from("x"), contentType: "text/plain" }),
    ).rejects.toBeInstanceOf(StorageConfigurationError);
  });

  it("refuses a delete and a read", async () => {
    const service = makeService({ AWS_REGION: "auto" });
    await expect(service.deleteFile("a.png")).rejects.toBeInstanceOf(StorageConfigurationError);
    await expect(service.readFile("a.png", 1024)).rejects.toBeInstanceOf(StorageConfigurationError);
  });
});
