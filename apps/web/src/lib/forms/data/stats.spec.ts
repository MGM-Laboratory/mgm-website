// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import {
  chiSquareCdf,
  chiSquareSf,
  chiSquareTest,
  describeCorrelation,
  describeCramersV,
  describeP,
  excessKurtosis,
  finite,
  formatP,
  fSf,
  histogram,
  linearRegression,
  logGamma,
  mean,
  median,
  modes,
  niceStep,
  nps,
  oneWayAnova,
  pearson,
  quantile,
  quantileSorted,
  ranks,
  regularizedBeta,
  regularizedGammaP,
  regularizedGammaQ,
  skewness,
  sorted,
  spearman,
  standardDeviation,
  studentTCdf,
  studentTQuantile,
  studentTTwoSided,
  suggestedBinCount,
  sum,
  summarize,
  variance,
} from "./stats";

describe("special functions", () => {
  it("computes ln gamma for integers, halves and small values", () => {
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    // Reflection branch
    expect(logGamma(0.25)).toBeCloseTo(1.2880225246980774, 8);
  });

  it("computes the regularized incomplete gamma on both branches", () => {
    expect(regularizedGammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(regularizedGammaP(1, 5)).toBeCloseTo(1 - Math.exp(-5), 12);
    expect(regularizedGammaQ(1, 5)).toBeCloseTo(Math.exp(-5), 12);
    expect(regularizedGammaQ(1, 0.5)).toBeCloseTo(Math.exp(-0.5), 12);
    expect(regularizedGammaP(3, 0)).toBe(0);
  });

  it("returns NaN for an invalid gamma domain", () => {
    expect(regularizedGammaP(0, 1)).toBeNaN();
    expect(regularizedGammaP(1, -1)).toBeNaN();
    expect(regularizedGammaQ(-1, 1)).toBeNaN();
    expect(regularizedGammaQ(1, -1)).toBeNaN();
  });

  it("computes the regularized incomplete beta", () => {
    expect(regularizedBeta(0.5, 1, 1)).toBeCloseTo(0.5, 12);
    expect(regularizedBeta(0.5, 2, 2)).toBeCloseTo(0.5, 12);
    expect(regularizedBeta(0.3, 2, 5)).toBeCloseTo(0.579825, 5);
    expect(regularizedBeta(0.9, 2, 5)).toBeCloseTo(0.999945, 5);
    expect(regularizedBeta(0, 2, 2)).toBe(0);
    expect(regularizedBeta(1, 2, 2)).toBe(1);
    expect(regularizedBeta(2, 2, 2)).toBeNaN();
    expect(regularizedBeta(0.5, 0, 2)).toBeNaN();
    expect(regularizedBeta(0.5, 2, 0)).toBeNaN();
  });
});

describe("distributions", () => {
  it("matches the chi-square table", () => {
    expect(chiSquareSf(3.841459, 1)).toBeCloseTo(0.05, 5);
    expect(chiSquareSf(5.991465, 2)).toBeCloseTo(0.05, 5);
    expect(chiSquareCdf(3.841459, 1)).toBeCloseTo(0.95, 5);
    expect(chiSquareCdf(0, 3)).toBe(0);
    expect(chiSquareSf(-1, 3)).toBe(1);
  });

  it("matches the Student t table", () => {
    expect(studentTCdf(0, 10)).toBeCloseTo(0.5, 12);
    expect(studentTCdf(2.228139, 10)).toBeCloseTo(0.975, 5);
    expect(studentTCdf(-2.228139, 10)).toBeCloseTo(0.025, 5);
    expect(studentTCdf(Infinity, 5)).toBe(1);
    expect(studentTCdf(-Infinity, 5)).toBe(0);
    expect(studentTTwoSided(2.228139, 10)).toBeCloseTo(0.05, 5);
    expect(studentTTwoSided(Infinity, 10)).toBe(0);
  });

  it("finds t quantiles by bisection", () => {
    expect(studentTQuantile(0.975, 10)).toBeCloseTo(2.228139, 5);
    expect(studentTQuantile(0.025, 10)).toBeCloseTo(-2.228139, 5);
    expect(studentTQuantile(0.5, 10)).toBe(0);
    expect(studentTQuantile(0, 10)).toBeNaN();
    expect(studentTQuantile(1, 10)).toBeNaN();
    expect(studentTQuantile(0.9, 0)).toBeNaN();
  });

  it("matches the F table", () => {
    expect(fSf(3.885294, 2, 12)).toBeCloseTo(0.05, 5);
    expect(fSf(0, 2, 12)).toBe(1);
    expect(fSf(-3, 2, 12)).toBe(1);
  });
});

describe("descriptive statistics", () => {
  it("keeps only finite numbers", () => {
    expect(finite([1, "2", NaN, Infinity, null, 3, undefined, -0.5])).toEqual([1, 3, -0.5]);
  });

  it("sums with compensation and averages", () => {
    expect(sum([])).toBe(0);
    expect(sum([0.1, 0.2, 0.3])).toBeCloseTo(0.6, 15);
    expect(sum(Array.from({ length: 10 }, () => 0.1))).toBe(1);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBeNaN();
  });

  it("sorts numerically without touching the input", () => {
    const input = [10, 9, 100, 1];
    expect(sorted(input)).toEqual([1, 9, 10, 100]);
    expect(input).toEqual([10, 9, 100, 1]);
  });

  it("interpolates quantiles like numpy", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(data, 0.25)).toBe(3.25);
    expect(quantile(data, 0.5)).toBe(5.5);
    expect(quantile(data, 0.75)).toBe(7.75);
    expect(quantile(data, 0)).toBe(1);
    expect(quantile(data, 1)).toBe(10);
    expect(quantile(data, -5)).toBe(1);
    expect(quantile(data, 5)).toBe(10);
    expect(quantile([7], 0.9)).toBe(7);
    expect(quantile([], 0.5)).toBeNaN();
    expect(quantileSorted([1, 3], 0.5)).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
  });

  it("finds modes and ties", () => {
    expect(modes([1, 2, 2, 3])).toEqual([2]);
    expect(modes([3, 3, 1, 1, 2])).toEqual([1, 3]);
    expect(modes([1, 2, 3])).toEqual([]);
    expect(modes([])).toEqual([]);
  });

  it("computes sample variance and standard deviation", () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(variance(data)).toBeCloseTo(32 / 7, 12);
    expect(standardDeviation(data)).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(variance([5])).toBeNaN();
  });

  it("computes skewness and kurtosis against reference values", () => {
    const data = [1, 2, 3, 4, 10];
    expect(skewness(data)).toBeCloseTo(1.697056, 5);
    expect(excessKurtosis(data)).toBeCloseTo(3.152, 5);
    expect(skewness([1, 2, 3, 4, 5])).toBeCloseTo(0, 12);
    expect(skewness([1, 2])).toBeNaN();
    expect(skewness([4, 4, 4])).toBeNaN();
    expect(excessKurtosis([1, 2, 3])).toBeNaN();
    expect(excessKurtosis([4, 4, 4, 4])).toBeNaN();
  });
});

describe("summarize", () => {
  it("reports the five number summary, fences and a confidence interval", () => {
    const result = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(result.n).toBe(10);
    expect(result.mean).toBe(14.5);
    expect(result.median).toBe(5.5);
    expect(result.min).toBe(1);
    expect(result.max).toBe(100);
    expect(result.range).toBe(99);
    expect(result.q1).toBe(3.25);
    expect(result.q3).toBe(7.75);
    expect(result.iqr).toBe(4.5);
    expect(result.fences[0]).toBeCloseTo(-3.5, 12);
    expect(result.fences[1]).toBeCloseTo(14.5, 12);
    expect(result.outliers).toEqual([100]);
    expect(result.whiskers).toEqual([1, 9]);
    expect(result.modes).toEqual([]);
    expect(result.ci[0]).toBeLessThan(result.mean);
    expect(result.ci[1]).toBeGreaterThan(result.mean);
    expect(result.standardError).toBeCloseTo(result.sd / Math.sqrt(10), 12);
  });

  it("widens the interval with a higher level", () => {
    const data = [4, 5, 6, 7, 8, 9];
    const narrow = summarize(data, 0.8);
    const wide = summarize(data, 0.99);
    expect(wide.ci[1] - wide.ci[0]).toBeGreaterThan(narrow.ci[1] - narrow.ci[0]);
  });

  it("handles one value and no values", () => {
    const one = summarize([5]);
    expect(one.n).toBe(1);
    expect(one.standardError).toBeNaN();
    expect(one.ci[0]).toBeNaN();
    expect(one.min).toBe(5);
    const none = summarize([]);
    expect(none.n).toBe(0);
    expect(none.min).toBeNaN();
    expect(none.max).toBeNaN();
    expect(none.range).toBeNaN();
    expect(none.whiskers.every(Number.isNaN)).toBe(true);
  });
});

describe("histograms", () => {
  it("suggests a bin count", () => {
    expect(suggestedBinCount([1])).toBe(1);
    expect(suggestedBinCount([4, 4, 4])).toBe(1);
    // IQR of zero falls back to Sturges, clamped at 3 or more
    expect(suggestedBinCount([1, 5, 5, 5, 5, 5, 5, 9])).toBe(4);
    expect(suggestedBinCount([1, 5, 5, 5, 9])).toBe(4);
    const data = Array.from({ length: 200 }, (_, index) => index);
    const bins = suggestedBinCount(data);
    expect(bins).toBeGreaterThanOrEqual(3);
    expect(bins).toBeLessThanOrEqual(40);
    const heavyTail = [...Array.from({ length: 10000 }, (_, index) => index), 1e6];
    expect(suggestedBinCount(heavyTail)).toBe(40);
    expect(suggestedBinCount([1, 2, 2, 2, 2, 2, 2, 2, 3, 100])).toBeGreaterThanOrEqual(3);
  });

  it("picks a nice step", () => {
    expect(niceStep(0.8)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(70)).toBe(100);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-3)).toBe(1);
    expect(niceStep(Infinity)).toBe(1);
  });

  it("bins values with equal widths and includes the maximum", () => {
    const bins = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.map((bin) => bin.count)).toEqual([2, 2, 2, 2, 3]);
    expect(bins[0].x0).toBe(0);
    expect(bins[4].x1).toBe(10);
  });

  it("returns nothing for no values and pads a single value", () => {
    expect(histogram([])).toEqual([]);
    const bins = histogram([5, 5, 5], 3);
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(3);
    expect(bins[0].x0).toBe(4.5);
    expect(bins[2].x1).toBe(5.5);
  });

  it("ignores values outside a given domain", () => {
    const bins = histogram([-5, 1, 2, 15], 2, { domain: [0, 10] });
    expect(bins.map((bin) => bin.count)).toEqual([2, 0]);
  });

  it("snaps to whole numbers in integer mode", () => {
    const bins = histogram([1, 2, 2, 3, 10], 10, { integer: true });
    expect(bins.map((bin) => bin.x0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(bins[1].count).toBe(2);
    expect(bins[9].count).toBe(1);
    const coarse = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, { integer: true });
    expect(coarse[0].x1 - coarse[0].x0).toBe(3);
    expect(coarse.reduce((total, bin) => total + bin.count, 0)).toBe(10);
    // A value under the domain lands in the first bin
    const clamped = histogram([0, 5], 5, { integer: true, domain: [1, 5] });
    expect(clamped[0].count).toBe(1);
  });

  it("falls back to the suggested count", () => {
    const bins = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(10);
    expect(histogram([1, 2], 0)).toHaveLength(1);
  });
});

describe("relationships", () => {
  it("shares average ranks among ties", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(ranks([3, 1, 2])).toEqual([3, 1, 2]);
    expect(ranks([5, 5, 5])).toEqual([2, 2, 2]);
    expect(ranks([])).toEqual([]);
  });

  it("computes Pearson correlation and its p-value", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const ys = [2, 1, 4, 3, 7, 8, 6, 9];
    const result = pearson(xs, ys);
    expect(result.n).toBe(8);
    expect(result.r).toBeCloseTo(0.896421457, 8);
    expect(result.p).toBeCloseTo(0.0025667661, 6);
    expect(result.t).toBeCloseTo(result.r * Math.sqrt(6 / (1 - result.r ** 2)), 12);
  });

  it("handles perfect, constant and tiny inputs", () => {
    const perfect = pearson([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(perfect).toMatchObject({ r: 1, p: 0, t: Infinity });
    const inverse = pearson([1, 2, 3, 4], [8, 6, 4, 2]);
    expect(inverse).toMatchObject({ r: -1, p: 0, t: -Infinity });
    expect(pearson([1, 1, 1], [1, 2, 3]).r).toBeNaN();
    expect(pearson([1, 2, 3], [4, 4, 4]).r).toBeNaN();
    expect(pearson([1, 2], [1, 2]).r).toBeNaN();
  });

  it("uses the shorter series", () => {
    const result = pearson([1, 2, 3, 4, 99], [2, 4, 6, 8]);
    expect(result.n).toBe(4);
    expect(result.r).toBe(1);
  });

  it("computes Spearman rho with ties", () => {
    const monotonic = spearman([1, 2, 3, 4, 5], [1, 8, 27, 64, 125]);
    expect(monotonic.r).toBe(1);
    const tied = spearman([1, 2, 2, 4, 5], [5, 6, 7, 8, 7]);
    expect(tied.r).toBeCloseTo(0.763158, 6);
    expect(spearman([1, 2, 3, 4, 5, 6], [1, 2, 3]).n).toBe(3);
  });

  it("fits a line by least squares", () => {
    const result = linearRegression([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(result.slope).toBeCloseTo(2, 12);
    expect(result.intercept).toBeCloseTo(1, 12);
    expect(result.r2).toBeCloseTo(1, 12);
    expect(result.n).toBe(4);
    const flat = linearRegression([1, 2, 3], [4, 4, 4]);
    expect(flat.slope).toBe(0);
    expect(flat.r2).toBeNaN();
    const vertical = linearRegression([2, 2, 2], [1, 2, 3]);
    expect(vertical.slope).toBeNaN();
    expect(vertical.r2).toBeNaN();
    expect(linearRegression([1, 2, 3, 4], [2, 4]).n).toBe(2);
  });
});

describe("chiSquareTest", () => {
  it("matches a hand computed 2 by 2 table", () => {
    const result = chiSquareTest([
      [10, 20],
      [30, 40],
    ]);
    expect(result.n).toBe(100);
    expect(result.df).toBe(1);
    expect(result.statistic).toBeCloseTo(0.7937, 3);
    expect(result.p).toBeCloseTo(0.373, 2);
    expect(result.expected[0][0]).toBeCloseTo(12, 12);
    expect(result.cramersV).toBeCloseTo(Math.sqrt(0.79365 / 100), 4);
    expect(result.lowExpectedShare).toBe(0);
  });

  it("drops empty rows and columns", () => {
    const result = chiSquareTest([
      [10, 0, 20],
      [0, 0, 0],
      [30, 0, 40],
    ]);
    expect(result.df).toBe(1);
    expect(result.n).toBe(100);
    expect(result.expected).toHaveLength(2);
    expect(result.expected[0]).toHaveLength(2);
  });

  it("counts cells with low expected counts", () => {
    const result = chiSquareTest([
      [1, 2],
      [3, 1],
    ]);
    expect(result.lowExpectedShare).toBe(1);
  });

  it("returns NaN p when there is nothing to test", () => {
    const empty = chiSquareTest([]);
    expect(empty.n).toBe(0);
    expect(empty.statistic).toBe(0);
    expect(empty.cramersV).toBeNaN();
    expect(empty.lowExpectedShare).toBe(0);
    const single = chiSquareTest([[5, 5]]);
    expect(single.df).toBe(0);
    expect(single.p).toBeNaN();
  });

  it("treats a ragged row's missing cell as NaN instead of throwing", () => {
    const result = chiSquareTest([[5, 5], [5]]);
    expect(result.expected[1].every(Number.isNaN)).toBe(true);
    expect(Number.isFinite(result.statistic)).toBe(true);
  });
});

describe("oneWayAnova", () => {
  it("matches a textbook example", () => {
    const result = oneWayAnova([
      { label: "A", values: [6, 8, 4, 5, 3, 4] },
      { label: "B", values: [8, 12, 9, 11, 6, 8] },
      { label: "C", values: [13, 9, 11, 8, 7, 12] },
    ]);
    expect(result.dfBetween).toBe(2);
    expect(result.dfWithin).toBe(15);
    expect(result.f).toBeCloseTo(9.2647, 3);
    expect(result.p).toBeCloseTo(0.0024, 3);
    expect(result.etaSquared).toBeCloseTo(0.5526316, 6);
    expect(result.groups.map((group) => group.label)).toEqual(["A", "B", "C"]);
    expect(result.groups[0].mean).toBeCloseTo(5, 12);
    expect(result.groups[0].ci[0]).toBeLessThan(5);
  });

  it("drops empty groups and handles singletons", () => {
    const result = oneWayAnova([
      { label: "A", values: [1, 2, 3] },
      { label: "empty", values: [] },
      { label: "B", values: [7] },
    ]);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[1].sd).toBeNaN();
    expect(result.groups[1].ci[0]).toBeNaN();
    expect(result.dfBetween).toBe(1);
    expect(result.dfWithin).toBe(2);
  });

  it("returns NaN when a test is impossible", () => {
    const one = oneWayAnova([{ label: "A", values: [1, 2, 3] }]);
    expect(one.f).toBeNaN();
    expect(one.p).toBeNaN();
    const same = oneWayAnova([
      { label: "A", values: [2, 2] },
      { label: "B", values: [2, 2] },
    ]);
    expect(same.etaSquared).toBeNaN();
    const none = oneWayAnova([]);
    expect(none.groups).toEqual([]);
    expect(none.f).toBeNaN();
  });
});

describe("nps", () => {
  it("splits promoters, passives and detractors", () => {
    const result = nps([10, 9, 8, 7, 6, 0, 9]);
    expect(result).toMatchObject({ promoters: 3, passives: 2, detractors: 2, n: 7 });
    expect(result.score).toBeCloseTo((1 / 7) * 100, 12);
  });

  it("is NaN without answers", () => {
    expect(nps([]).score).toBeNaN();
  });
});

describe("plain language readings", () => {
  it("describes p values", () => {
    expect(describeP(Number.NaN)).toBe("not enough data to test");
    expect(describeP(0.0001)).toBe("very strong evidence");
    expect(describeP(0.005)).toBe("strong evidence");
    expect(describeP(0.03)).toBe("evidence");
    expect(describeP(0.07)).toBe("weak evidence");
    expect(describeP(0.5)).toBe("no real evidence");
  });

  it("describes Cramer's V by the table size", () => {
    expect(describeCramersV(Number.NaN, 1)).toBe("unknown");
    expect(describeCramersV(0.6, 1)).toBe("strong");
    expect(describeCramersV(0.3, 1)).toBe("moderate");
    expect(describeCramersV(0.1, 1)).toBe("weak");
    expect(describeCramersV(0.05, 1)).toBe("negligible");
    // A bigger table lowers the bar
    expect(describeCramersV(0.25, 4)).toBe("strong");
    expect(describeCramersV(0.25, 100)).toBe("strong");
    expect(describeCramersV(0.25, 0)).toBe("weak");
  });

  it("describes correlations by size and sign", () => {
    expect(describeCorrelation(Number.NaN)).toBe("undefined");
    expect(describeCorrelation(0.1)).toBe("very weak or no relationship");
    expect(describeCorrelation(-0.1)).toBe("very weak or no relationship");
    expect(describeCorrelation(0.3)).toBe("weak positive relationship");
    expect(describeCorrelation(-0.5)).toBe("moderate negative relationship");
    expect(describeCorrelation(0.9)).toBe("strong positive relationship");
  });

  it("formats p values", () => {
    expect(formatP(Number.NaN)).toBe("n/a");
    expect(formatP(0.00001)).toBe("< 0.0001");
    expect(formatP(0.04321)).toBe("0.0432");
  });
});
