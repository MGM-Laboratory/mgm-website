// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import { STOP_WORDS, summarizeText, words } from "./text";

describe("words", () => {
  it("lowercases, drops apostrophes and splits on punctuation", () => {
    expect(words("Don't STOP, believing! It’s fine.")).toEqual([
      "dont",
      "stop",
      "believing",
      "its",
      "fine",
    ]);
  });

  it("keeps letters and digits from other scripts", () => {
    expect(words("Café 42 日本語")).toEqual(["café", "42", "日本語"]);
  });

  it("returns an empty list for blank text", () => {
    expect(words("  ... ")).toEqual([]);
  });
});

describe("STOP_WORDS", () => {
  it("holds both English and Indonesian words", () => {
    expect(STOP_WORDS.has("the")).toBe(true);
    expect(STOP_WORDS.has("yang")).toBe(true);
    expect(STOP_WORDS.has("laboratory")).toBe(false);
  });
});

describe("summarizeText", () => {
  it("returns zeros for no answers", () => {
    expect(summarizeText([])).toEqual({
      answered: 0,
      averageWords: 0,
      averageCharacters: 0,
      topWords: [],
      topPhrases: [],
    });
    expect(summarizeText(["  ", ""]).answered).toBe(0);
  });

  it("counts a word once per answer and ignores stop words and bare numbers", () => {
    const result = summarizeText([
      "Great workshop workshop workshop",
      "The workshop was 100",
      "great",
    ]);
    expect(result.answered).toBe(3);
    expect(result.topWords).toEqual([
      { term: "great", count: 2 },
      { term: "workshop", count: 2 },
    ]);
  });

  it("averages words and characters over trimmed answers", () => {
    const result = summarizeText(["  one two  ", "three"]);
    expect(result.averageWords).toBe(1.5);
    expect(result.averageCharacters).toBe((7 + 5) / 2);
  });

  it("keeps only phrases that repeat across answers", () => {
    const result = summarizeText(["fast response time", "response time matters", "slow delivery"]);
    expect(result.topPhrases).toEqual([{ term: "response time", count: 2 }]);
  });

  it("breaks a phrase at a stop word", () => {
    const result = summarizeText(["good and fast", "good and fast"]);
    expect(result.topPhrases).toEqual([]);
  });

  it("sorts ties alphabetically and honors the limit", () => {
    const result = summarizeText(["zebra apple mango"], 2);
    expect(result.topWords.map((entry) => entry.term)).toEqual(["apple", "mango"]);
  });
});
