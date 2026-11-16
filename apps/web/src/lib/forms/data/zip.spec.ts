// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import { ZipWriter, crc32, safeZipPath, uniqueName } from "./zip";

const text = (value: string) => new TextEncoder().encode(value);

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("continues from a previous checksum", () => {
    const whole = crc32(text("hello world"));
    const first = crc32(text("hello "));
    expect(crc32(text("world"), first)).toBe(whole);
  });
});

describe("safeZipPath", () => {
  it("replaces unsafe characters and drops empty and dot parts", () => {
    expect(safeZipPath("a/b:c/d?.txt")).toBe("a/b_c/d_.txt");
    expect(safeZipPath("/abs//path/")).toBe("abs/path");
    expect(safeZipPath("../../etc/passwd")).toBe("_/_/etc/passwd");
    expect(safeZipPath("./x")).toBe("_/x");
    expect(safeZipPath("  spaced  /name")).toBe("spaced/name");
    expect(safeZipPath("back\\slash")).toBe("back_slash");
    expect(safeZipPath("")).toBe("");
  });

  it("limits each part to 120 characters", () => {
    expect(safeZipPath("x".repeat(300))).toHaveLength(120);
  });
});

describe("uniqueName", () => {
  it("keeps a free name and numbers a taken one before the extension", () => {
    const taken = new Set<string>();
    expect(uniqueName("a.txt", taken)).toBe("a.txt");
    expect(uniqueName("A.txt", taken)).toBe("A (2).txt");
    expect(uniqueName("a.txt", taken)).toBe("a (3).txt");
  });

  it("numbers names without an extension and dotfiles", () => {
    const taken = new Set<string>();
    expect(uniqueName("readme", taken)).toBe("readme");
    expect(uniqueName("readme", taken)).toBe("readme (2)");
    expect(uniqueName(".env", taken)).toBe(".env");
    expect(uniqueName(".env", taken)).toBe(".env (2)");
  });
});

describe("ZipWriter", () => {
  const date = new Date(2024, 2, 5, 10, 30, 14);

  it("writes a readable archive with correct headers", () => {
    const zip = new ZipWriter();
    zip.addText("hello.txt", "hello", date);
    zip.add({ name: "dir/données.bin", data: Uint8Array.from([1, 2, 3]), date });
    const bytes = zip.toBytes();
    const view = new DataView(bytes.buffer);

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true)).toBe(0x0800);
    expect(view.getUint32(14, true)).toBe(crc32(text("hello")));
    expect(view.getUint32(18, true)).toBe(5);
    expect(view.getUint16(26, true)).toBe(9);
    expect(new TextDecoder().decode(bytes.slice(30, 39))).toBe("hello.txt");
    expect(new TextDecoder().decode(bytes.slice(39, 44))).toBe("hello");
    // The DOS time packs the hour, minute and half seconds, and the date packs the year since 1980, month and day
    expect(view.getUint16(10, true)).toBe((10 << 11) | (30 << 5) | 7);
    expect(view.getUint16(12, true)).toBe(((2024 - 1980) << 9) | (3 << 5) | 5);

    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 8, true)).toBe(2);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralSize = view.getUint32(end + 12, true);
    const centralOffset = view.getUint32(end + 16, true);
    expect(centralOffset + centralSize).toBe(end);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    expect(view.getUint32(centralOffset + 42, true)).toBe(0);
    const second = centralOffset + 46 + 9;
    expect(view.getUint16(second + 28, true)).toBe(text("dir/données.bin").length);
    expect(view.getUint32(second, true)).toBe(0x02014b50);
    expect(view.getUint32(second + 42, true)).toBe(30 + 9 + 5);
    const secondName = text("dir/données.bin").length;
    expect(zip.size).toBe(30 + 9 + 5 + 30 + secondName + 3);
  });

  it("tracks the written size and returns chunks that sum to the archive", () => {
    const zip = new ZipWriter();
    zip.add({ name: "a", data: new Uint8Array(10), date });
    const chunks = zip.finish();
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(total).toBe(zip.toBytes().length);
    expect(zip.size).toBe(30 + 1 + 10);
  });

  it("clamps dates before 1980 and defaults to now", () => {
    const zip = new ZipWriter();
    zip.add({ name: "old", data: new Uint8Array(), date: new Date(1970, 0, 1) });
    zip.add({ name: "now", data: new Uint8Array() });
    const view = new DataView(zip.toBytes().buffer);
    expect(view.getUint16(12, true) >> 9).toBe(0);
  });

  it("refuses an entry over 4 GB", () => {
    const zip = new ZipWriter();
    const huge = { length: 0xffffffff + 1, *[Symbol.iterator]() {} } as unknown as Uint8Array;
    expect(() => zip.add({ name: "big", data: huge })).toThrow(/over 4 GB/);
  });

  it("refuses more than 65,535 files", () => {
    const zip = new ZipWriter();
    const empty = new Uint8Array();
    for (let index = 0; index < 0x10000; index += 1) zip.add({ name: "f", data: empty, date });
    expect(() => zip.finish()).toThrow(/Too many files/);
  });
});
