import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { assertVersion, orConflict, parseExpectedVersion } from "./record-version.js";

const LOADED = new Date("2026-11-14T05:00:00.123Z");

describe("parseExpectedVersion", () => {
  it("returns nothing for a missing or blank header, so an old client still saves", () => {
    expect(parseExpectedVersion(undefined)).toBeUndefined();
    expect(parseExpectedVersion("")).toBeUndefined();
    expect(parseExpectedVersion("   ")).toBeUndefined();
  });

  it("reads an ISO timestamp with its milliseconds", () => {
    expect(parseExpectedVersion(LOADED.toISOString())?.getTime()).toBe(LOADED.getTime());
  });

  it("answers 400 for a header that is not a date", () => {
    expect(() => parseExpectedVersion("yesterday")).toThrow(BadRequestException);
  });
});

describe("assertVersion", () => {
  it("passes when no version was sent", () => {
    expect(() => assertVersion({ updatedAt: LOADED }, undefined)).not.toThrow();
  });

  it("passes when the stored version is the one that was loaded", () => {
    expect(() => assertVersion({ updatedAt: LOADED }, new Date(LOADED))).not.toThrow();
  });

  it("answers 409 when the record changed after it was loaded", () => {
    const later = new Date(LOADED.getTime() + 1);
    expect(() => assertVersion({ updatedAt: later }, LOADED)).toThrow(ConflictException);
  });
});

describe("orConflict", () => {
  it("turns the no match answer of the guarded update into a 409", async () => {
    await expect(orConflict(() => Promise.reject({ code: "P2025" }))).rejects.toThrow(
      ConflictException,
    );
  });

  it("lets every other error through and returns a result", async () => {
    const other = new Error("db down");
    await expect(orConflict(() => Promise.reject(other))).rejects.toBe(other);
    await expect(orConflict(() => Promise.resolve(7))).resolves.toBe(7);
  });
});
