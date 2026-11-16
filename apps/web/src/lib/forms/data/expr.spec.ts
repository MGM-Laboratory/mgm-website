// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import {
  compileExpr,
  evaluate,
  EXPR_FUNCTIONS,
  runExpr,
  toDate,
  toNumber,
  toText,
  tokenize,
  type ExprValue,
} from "./expr";

const row =
  (values: Record<string, ExprValue>) =>
  (name: string): ExprValue =>
    values[name] ?? null;

function errorOf(source: string, known?: (name: string) => boolean) {
  const result = compileExpr(source, known);
  if (result.ok) throw new Error("expected a compile error");
  return result.error;
}

describe("tokenize", () => {
  it("reads numbers with fractions and exponents", () => {
    const kinds = tokenize("12 1.5 .5 3. 1e3 2.5E-4").map((token) => token.value);
    expect(kinds.slice(0, 6)).toEqual([12, 1.5, 0.5, 3, 1000, 0.00025]);
  });

  it("lowercases words and keeps column names as written", () => {
    const tokens = tokenize("IF({Big Name})");
    expect(tokens[0]).toMatchObject({ kind: "ident", value: "if" });
    expect(tokens[2]).toMatchObject({ kind: "column", value: "Big Name" });
  });

  it("reads escapes inside strings", () => {
    const [token] = tokenize(String.raw`"a\nb\tc\"d"`);
    expect(token).toMatchObject({ kind: "string", value: 'a\nb\tc"d' });
    expect(tokenize("'it'")[0]).toMatchObject({ value: "it" });
  });

  it("ends with an eof token", () => {
    expect(tokenize("  ").map((token) => token.kind)).toEqual(["eof"]);
  });

  it("reports an unclosed string, column and an unknown character", () => {
    expect(errorOf('"abc').message).toMatch(/closing "/);
    expect(errorOf("{abc").message).toMatch(/closing }/);
    expect(errorOf("{  }").message).toMatch(/column name/);
    expect(errorOf("1 # 2")).toMatchObject({ start: 2, end: 3 });
  });

  it("treats a lone dot as an unknown character", () => {
    expect(errorOf(".").message).toMatch(/isn't something/);
  });
});

describe("compileExpr", () => {
  it("collects the referenced columns once", () => {
    const result = compileExpr("{A} + {B} * {A}");
    expect(result.ok && result.expr.columns).toEqual(["A", "B"]);
  });

  it("collects columns through unary and call nodes", () => {
    const result = compileExpr("-{A} + if(not {B}, {C}, 1)");
    expect(result.ok && result.expr.columns).toEqual(["A", "B", "C"]);
  });

  it("flags a missing column with its position", () => {
    const error = errorOf("1 + {Nope}", (name) => name === "A");
    expect(error).toEqual({ message: 'No column called "Nope".', start: 4, end: 10 });
  });

  it("finds an unknown column inside a unary, binary or call node", () => {
    const known = (name: string) => name === "A";
    expect(errorOf("-{Z}", known).message).toContain("Z");
    expect(errorOf("{A} + {Z}", known).message).toContain("Z");
    expect(errorOf("max({A}, {Z})", known).message).toContain("Z");
    expect(errorOf("1 + 2 * 3 + upper({Y})", known).message).toContain("Y");
  });

  it("accepts a formula whose columns are all known", () => {
    expect(compileExpr("{A} + 1", () => true).ok).toBe(true);
    expect(compileExpr("1 + 2", () => false).ok).toBe(true);
  });

  it("reports parse errors in plain words", () => {
    expect(errorOf("").message).toBe("Write a formula.");
    expect(errorOf("1 2").message).toMatch(/operator or a comma/);
    expect(errorOf("1 )").message).toMatch(/without a matching/);
    expect(errorOf("(1 + 2").message).toMatch(/missing its closing/);
    expect(errorOf("1 +").message).toMatch(/ends too early/);
    expect(errorOf("* 2").message).toMatch(/missing before "\*"/);
    expect(errorOf("foo").message).toMatch(/Unknown word "foo"/);
    expect(errorOf("upper").message).toMatch(/is a function/);
    expect(errorOf("nope(1)").message).toMatch(/no function called nope/);
    expect(errorOf("upper({A}").message).toMatch(/upper\( is missing its closing/);
  });

  it("checks the argument count of each function", () => {
    expect(errorOf("len()").message).toMatch(/len takes 1 value, got 0/);
    expect(errorOf("round(1, 2, 3)").message).toMatch(/round takes 1 or 2 values, got 3/);
    expect(errorOf("min()").message).toMatch(/min takes at least 1 values, got 0/);
    expect(errorOf("if(1)").message).toMatch(/if takes 2 or 3 values, got 1/);
    expect(errorOf("contains(1)").message).toMatch(/contains takes 2 values, got 1/);
  });

  it("limits the length and the nesting of a formula", () => {
    const long = Array.from({ length: 1001 }, () => "1").join("+");
    expect(errorOf(long).message).toMatch(/too long/);
    expect(errorOf(`${"(".repeat(65)}1${")".repeat(65)}`).message).toMatch(/too many brackets/);
    expect(compileExpr(`${"(".repeat(64)}1${")".repeat(64)}`).ok).toBe(true);
  });

  it("describes every function it supports", () => {
    for (const [name, spec] of Object.entries(EXPR_FUNCTIONS)) {
      expect(spec.help.startsWith(name)).toBe(true);
      expect(spec.min).toBeLessThanOrEqual(spec.max);
    }
  });
});

describe("runExpr", () => {
  it("throws the error message for a bad formula", () => {
    expect(() => runExpr("1 +")).toThrow(/ends too early/);
  });

  it("reads columns through the resolver", () => {
    expect(runExpr("{Age} * 12", row({ Age: 3 }))).toBe(36);
    expect(runExpr("{Missing}")).toBeNull();
  });

  it("applies the operator precedence", () => {
    expect(runExpr("2 + 3 * 4")).toBe(14);
    expect(runExpr("(2 + 3) * 4")).toBe(20);
    expect(runExpr("-2 * -3")).toBe(6);
    expect(runExpr("+5")).toBe(5);
    expect(runExpr("10 - 4 - 3")).toBe(3);
    expect(runExpr("7 % 4")).toBe(3);
    expect(runExpr("true or false and false")).toBe(true);
    expect(runExpr("not 1 = 2")).toBe(true);
  });

  it("yields empty for a failing operation", () => {
    expect(runExpr("1 / 0")).toBeNull();
    expect(runExpr("1 % 0")).toBeNull();
    expect(runExpr("1 - 'x'")).toBeNull();
    expect(runExpr("-'x'")).toBeNull();
    expect(runExpr("2 * null")).toBeNull();
  });

  it("joins text with plus when a side is not a number", () => {
    expect(runExpr("'a' + 'b'")).toBe("ab");
    expect(runExpr("'a' + 1")).toBe("a1");
    expect(runExpr("null + 5")).toBe(5);
    expect(runExpr("5 + null")).toBe(5);
    expect(runExpr("null + 'x'")).toBe("x");
    expect(runExpr("'x' + null")).toBe("x");
  });

  it("always joins text with the ampersand", () => {
    expect(runExpr("1 & 2")).toBe("12");
    expect(runExpr("'a' & null & true")).toBe("atrue");
  });

  it("evaluates keywords and functions named like keywords", () => {
    expect(runExpr("true")).toBe(true);
    expect(runExpr("false")).toBe(false);
    expect(runExpr("null")).toBeNull();
    expect(runExpr("empty")).toBeNull();
  });

  it("short circuits and, or and if", () => {
    const calls: string[] = [];
    const resolve = (name: string): ExprValue => {
      calls.push(name);
      return name === "T";
    };
    expect(runExpr("{F} and {X}", (n) => resolve(n === "F" ? "F" : n))).toBe(false);
    expect(calls).toEqual(["F"]);
    calls.length = 0;
    expect(runExpr("{T} or {X}", resolve)).toBe(true);
    expect(calls).toEqual(["T"]);
    calls.length = 0;
    expect(runExpr("if({T}, 1, {X})", resolve)).toBe(1);
    expect(calls).toEqual(["T"]);
  });

  it("returns empty from a two argument if with a false condition", () => {
    expect(runExpr("if(1 > 2, 'x')")).toBeNull();
    expect(runExpr("if(1 > 2, 'x', 'y')")).toBe("y");
  });
});

describe("comparisons", () => {
  it("compares numbers, numeric text and mixed values", () => {
    expect(runExpr("1 = 1.0")).toBe(true);
    expect(runExpr("'10' = 10")).toBe(true);
    expect(runExpr("'1,000' = 1000")).toBe(true);
    expect(runExpr("2 == 2")).toBe(true);
    expect(runExpr("2 <> 3")).toBe(true);
    expect(runExpr("2 != 2")).toBe(false);
    expect(runExpr("3 > 2 and 2 >= 2 and 1 < 2 and 2 <= 2")).toBe(true);
  });

  it("compares text case-insensitively for equality", () => {
    expect(runExpr("'Pro' = 'pro'")).toBe(true);
    expect(runExpr("'Pro' = 'Free'")).toBe(false);
  });

  it("treats empty values as equal only to each other", () => {
    expect(runExpr("null = ''")).toBe(true);
    expect(runExpr("null = 0")).toBe(false);
    expect(runExpr("null != 'a'")).toBe(true);
    expect(runExpr("null < 1")).toBe(false);
    expect(runExpr("1 >= null")).toBe(false);
  });

  it("compares booleans by truthiness", () => {
    expect(runExpr("true = 'yes'")).toBe(true);
    expect(runExpr("true = 'no'")).toBe(false);
    expect(runExpr("false = 0")).toBe(true);
    expect(runExpr("true = 1")).toBe(true);
  });

  it("orders dates and falls back to text order", () => {
    expect(runExpr("'2024-01-02' > '2024-01-01'")).toBe(true);
    expect(runExpr("'2024-01-02T10:00:00Z' < '2024-01-02T11:00:00Z'")).toBe(true);
    expect(runExpr("'apple' < 'banana'")).toBe(true);
    expect(runExpr("'b' >= 'a'")).toBe(true);
  });

  it("applies truthiness to text and numbers", () => {
    expect(runExpr("not 'false'")).toBe(true);
    expect(runExpr("not 'no'")).toBe(true);
    expect(runExpr("not '0'")).toBe(true);
    expect(runExpr("not ''")).toBe(true);
    expect(runExpr("not 'hello'")).toBe(false);
    expect(runExpr("not 0")).toBe(true);
    expect(runExpr("not 2")).toBe(false);
    expect(runExpr("not null")).toBe(true);
  });
});

describe("functions", () => {
  it("handles text functions", () => {
    expect(runExpr("len('abc')")).toBe(3);
    expect(runExpr("len(null)")).toBe(0);
    expect(runExpr("lower('AbC')")).toBe("abc");
    expect(runExpr("upper('abc')")).toBe("ABC");
    expect(runExpr("trim('  a b  ')")).toBe("a b");
    expect(runExpr("contains('Hello World', 'WORLD')")).toBe(true);
    expect(runExpr("contains('Hello', 'x')")).toBe(false);
    expect(runExpr("concat('a', 1, true, null, 2.5)")).toBe("a1true2.5");
    expect(runExpr("words('  one two   three ')")).toBe(3);
    expect(runExpr("words('   ')")).toBe(0);
    expect(runExpr("text(12)")).toBe("12");
    expect(runExpr("text(true)")).toBe("true");
    expect(runExpr("text(false)")).toBe("false");
  });

  it("rounds a number to the digits asked", () => {
    expect(runExpr("round(2.567)")).toBe(3);
    expect(runExpr("round(2.567, 2)")).toBe(2.57);
    expect(runExpr("round(2.567, 'x')")).toBe(3);
    expect(runExpr("round(2.567, -4)")).toBe(3);
    expect(runExpr("round(1.123456789012, 99)")).toBe(1.123456789);
    expect(runExpr("round('x')")).toBeNull();
  });

  it("handles abs and the aggregates", () => {
    expect(runExpr("abs(-3)")).toBe(3);
    expect(runExpr("abs('x')")).toBeNull();
    expect(runExpr("min(3, 1, 2)")).toBe(1);
    expect(runExpr("max(3, '9', 2)")).toBe(9);
    expect(runExpr("min('a', null)")).toBeNull();
    expect(runExpr("max(null)")).toBeNull();
    expect(runExpr("sum(1, null, 'x', 2)")).toBe(3);
    expect(runExpr("sum(null)")).toBe(0);
    expect(runExpr("avg(2, 4, null, 'x')")).toBe(3);
    expect(runExpr("avg(null)")).toBeNull();
  });

  it("handles number, coalesce and the date parts", () => {
    expect(runExpr("number('1,234.5')")).toBe(1234.5);
    expect(runExpr("number('abc')")).toBeNull();
    expect(runExpr("coalesce(null, '', 'x', 'y')")).toBe("x");
    expect(runExpr("coalesce(null, '')")).toBeNull();
    expect(runExpr("year('2024-03-15')")).toBe(2024);
    expect(runExpr("month('2024-03-15')")).toBe(3);
    expect(runExpr("day('2024-03-15')")).toBe(15);
    expect(runExpr("weekday('2024-03-11')")).toBe(1);
    expect(runExpr("weekday('2024-03-17')")).toBe(7);
    expect(runExpr("year('nope')")).toBeNull();
    expect(runExpr("days_between('2024-03-01', '2024-03-11')")).toBe(10);
    expect(runExpr("days_between('2024-03-11', '2024-03-01')")).toBe(-10);
    expect(runExpr("days_between('2024-03-01', 'x')")).toBeNull();
  });

  it("falls back to empty for a node it does not know", () => {
    const ast: Parameters<typeof evaluate>[0] = {
      type: "call",
      name: "ghost",
      args: [],
      start: 0,
      end: 0,
    };
    expect(evaluate(ast, () => null)).toBeNull();
    const odd = { type: "weird", start: 0, end: 0 } as unknown as Parameters<typeof evaluate>[0];
    expect(evaluate(odd, () => null)).toBeNull();
  });
});

describe("value conversion", () => {
  it("converts to number", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(4)).toBe(4);
    expect(toNumber(true)).toBe(1);
    expect(toNumber(false)).toBe(0);
    expect(toNumber("  ")).toBeNull();
    expect(toNumber(" 1,000,000 ")).toBe(1000000);
    expect(toNumber("12abc")).toBeNull();
    expect(toNumber("Infinity")).toBeNull();
  });

  it("converts to text", () => {
    expect(toText(null)).toBe("");
    expect(toText(3)).toBe("3");
    expect(toText(0.1 + 0.2)).toBe("0.3");
    expect(toText(true)).toBe("true");
    expect(toText("x")).toBe("x");
  });

  it("parses dates strictly", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(true)).toBeNull();
    expect(toDate(5)).toBeNull();
    expect(toDate("2024-02-30")?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(toDate("2024-03-05 10:30")?.toISOString()).toBe("2024-03-05T10:30:00.000Z");
    expect(toDate("2024-03-05T10:30")?.toISOString()).toBe("2024-03-05T10:30:00.000Z");
    expect(toDate("2024-03-05T10:30:15Z")?.toISOString()).toBe("2024-03-05T10:30:15.000Z");
    expect(toDate("2024-03-05Tgarbage")).toBeNull();
    expect(toDate("March 5")).toBeNull();
    expect(toDate("2024-99-99")?.getUTCFullYear()).toBeGreaterThan(2024);
  });
});
