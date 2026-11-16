import { describe, expect, it } from "vitest";

import {
  documentMediaKeys,
  imageDimensions,
  sniffImage,
  uploadExtension,
  storedUploadType,
  fileExtensionOf,
  sanitizeFileName,
} from "./forms.utils.js";

function pad(buffer: Buffer, size: number) {
  return Buffer.concat([buffer, Buffer.alloc(Math.max(0, size - buffer.length))]);
}

function webp(chunk: string, fill: (buffer: Buffer) => void) {
  const buffer = Buffer.alloc(40);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write(chunk, 12, "ascii");
  fill(buffer);
  return buffer;
}

describe("sniffImage", () => {
  it("recognizes each format by its magic bytes", () => {
    expect(sniffImage(pad(Buffer.from("89504e470d0a1a0a", "hex"), 24))?.extension).toBe("png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.type).toBe("image/jpeg");
    expect(sniffImage(webp("VP8X", () => undefined))?.extension).toBe("webp");
    expect(sniffImage(Buffer.from("GIF89a"))?.extension).toBe("gif");
    expect(sniffImage(Buffer.from("GIF87a"))?.extension).toBe("gif");
  });

  it("refuses short buffers and other bytes", () => {
    expect(sniffImage(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffImage(Buffer.from("GIF90a"))).toBeNull();
    expect(sniffImage(Buffer.from("RIFF0000WAVE0000"))).toBeNull();
    expect(sniffImage(Buffer.from("plain text"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("imageDimensions", () => {
  it("reads a GIF", () => {
    const gif = Buffer.alloc(10);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(30, 6);
    gif.writeUInt16LE(20, 8);
    expect(imageDimensions(gif, "image/gif")).toEqual({ height: 20, width: 30 });
  });

  it("reads the three WebP chunk kinds", () => {
    const extended = webp("VP8X", (buffer) => {
      buffer.writeUIntLE(99, 24, 3);
      buffer.writeUIntLE(49, 27, 3);
    });
    expect(imageDimensions(extended, "image/webp")).toEqual({ height: 50, width: 100 });
    const lossy = webp("VP8 ", (buffer) => {
      buffer.writeUInt16LE(64, 26);
      buffer.writeUInt16LE(32, 28);
    });
    expect(imageDimensions(lossy, "image/webp")).toEqual({ height: 32, width: 64 });
    const lossless = webp("VP8L", (buffer) => {
      buffer.writeUInt32LE(15 | (7 << 14), 21);
    });
    expect(imageDimensions(lossless, "image/webp")).toEqual({ height: 8, width: 16 });
    expect(
      imageDimensions(
        webp("ABCD", () => undefined),
        "image/webp",
      ),
    ).toBeNull();
  });

  it("reads a JPEG frame header after other segments", () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),
      Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0x01, 0x22, 0x00]),
    ]);
    expect(imageDimensions(jpeg, "image/jpeg")).toEqual({ height: 32, width: 64 });
  });

  it("skips stray bytes and standalone markers in a JPEG", () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd0]),
      Buffer.from([0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]),
      Buffer.from([0xff, 0xc2, 0x00, 0x0b, 0x08, 0x00, 0x08, 0x00, 0x10, 0x03, 0x01, 0x22, 0x00]),
    ]);
    expect(imageDimensions(jpeg, "image/jpeg")).toEqual({ height: 8, width: 16 });
  });

  it("returns null for a JPEG without a frame header and for short buffers", () => {
    expect(
      imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0, 0, 0, 0]), "image/jpeg"),
    ).toBeNull();
    expect(imageDimensions(Buffer.alloc(10), "image/png")).toBeNull();
    expect(imageDimensions(Buffer.alloc(4), "image/gif")).toBeNull();
    expect(imageDimensions(Buffer.alloc(20), "image/webp")).toBeNull();
  });

  it("returns null when a header read runs off the end", () => {
    const broken = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]),
      Buffer.alloc(8, 0xff),
    ]);
    expect(() => imageDimensions(broken, "image/jpeg")).not.toThrow();
    expect(imageDimensions(broken, "image/jpeg")).toBeNull();
  });
});

describe("documentMediaKeys", () => {
  const A = "form-abc123-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";
  const B = "form-abc123-1b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a62.mp4";

  it("finds keys and poster keys anywhere and counts each once", () => {
    const keys = documentMediaKeys({
      design: { cover: { media: { key: A, posterKey: B } } },
      fields: [{ media: { key: A } }, [{ key: "not-a-form-key.png" }], null, 3],
    });
    expect(keys.sort()).toEqual([A, B].sort());
  });

  it("returns nothing for a value that is not an object", () => {
    expect(documentMediaKeys(null)).toEqual([]);
    expect(documentMediaKeys("text")).toEqual([]);
    expect(documentMediaKeys({ key: 3 })).toEqual([]);
  });
});

describe("file names and types", () => {
  it("reads the extension in lower case or none", () => {
    expect(fileExtensionOf("A.PDF")).toBe("pdf");
    expect(fileExtensionOf("noext")).toBe("");
  });

  it("stores a known claimed type, else the type of the extension, else octet stream", () => {
    expect(storedUploadType("a.pdf", "application/pdf; x=1")).toBe("application/pdf");
    expect(storedUploadType("a.txt", "text/html")).toBe("text/plain");
    expect(storedUploadType("a.unknown", "text/html")).toBe("application/octet-stream");
  });

  it("keeps a plain extension and derives one from the type otherwise", () => {
    expect(uploadExtension("a.pdf", "application/pdf")).toBe("pdf");
    expect(uploadExtension("a.bad-ext!", "application/pdf")).toBe("pdf");
    expect(uploadExtension("a.bad-ext!", "application/octet-stream")).toBe("bin");
  });

  it("strips paths and control characters from a file name", () => {
    expect(sanitizeFileName(encodeURIComponent("../a/b\\c.pdf"))).toBe("..abc.pdf");
    expect(sanitizeFileName("%E0%A4%A")).toBe("%E0%A4%A");
    expect(sanitizeFileName(undefined)).toBe("file");
    expect(sanitizeFileName("   ")).toBe("file");
    expect(sanitizeFileName("a".repeat(300))).toHaveLength(255);
  });
});
