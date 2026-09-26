/**
 * Descriptive and inferential statistics for the forms analysis lab. Pure
 * functions over plain number arrays, no React and no DOM, so they can be
 * checked against reference values outside the app.
 *
 * Conventions (they match what most statistics packages report):
 * - variance and standard deviation are the sample versions (n - 1);
 * - quantiles interpolate linearly between order statistics (numpy's default);
 * - skewness is the adjusted Fisher-Pearson G1 and kurtosis the excess G2,
 *   the same as spreadsheet SKEW and KURT;
 * - p-values are two-sided unless a function says otherwise.
 */

// ---------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection keeps the approximation accurate near zero.
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const z = x - 1;
  let sum = 0.99999999999980993;
  for (let index = 0; index < LANCZOS.length; index += 1) {
    sum += LANCZOS[index] / (z + index + 1);
  }
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** The regularized lower incomplete gamma function P(a, x). */
export function regularizedGammaP(a: number, x: number): number {
  if (!(a > 0) || !(x >= 0)) return Number.NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series expansion.
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 1000; n += 1) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
  }
  return 1 - regularizedGammaQ(a, x);
}

/** The regularized upper incomplete gamma function Q(a, x) = 1 - P(a, x). */
export function regularizedGammaQ(a: number, x: number): number {
  if (!(a > 0) || !(x >= 0)) return Number.NaN;
  if (x < a + 1) return 1 - regularizedGammaP(a, x);
  // Continued fraction (modified Lentz).
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.max(0, Math.exp(-x + a * Math.log(x) - logGamma(a)) * h);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (!(x >= 0 && x <= 1) || !(a > 0) || !(b > 0)) return Number.NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

/** P(X ≤ x) for a chi-square variable with k degrees of freedom. */
export function chiSquareCdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return regularizedGammaP(k / 2, x / 2);
}

/** P(X ≥ x) for a chi-square variable (the test's p-value). */
export function chiSquareSf(x: number, k: number): number {
  if (x <= 0) return 1;
  return regularizedGammaQ(k / 2, x / 2);
}

/** P(T ≤ t) for Student's t with `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** Two-sided p-value of a t statistic. */
export function studentTTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}

/** The t quantile: the t with P(T ≤ t) = p (bisection on the CDF). */
export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) return Number.NaN;
  if (p === 0.5) return 0;
  let low = -1e3;
  let high = 1e3;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, df) < p) low = mid;
    else high = mid;
    if (high - low < 1e-12) break;
  }
  return (low + high) / 2;
}

/** P(F ≥ f) for an F variable with (d1, d2) degrees of freedom. */
export function fSf(f: number, d1: number, d2: number): number {
  if (!(f > 0)) return 1;
  return regularizedBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

// ---------------------------------------------------------------------------
// Descriptive statistics
// ---------------------------------------------------------------------------

/** Finite numbers only, in their original order. */
export function finite(values: readonly unknown[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

export function sum(values: readonly number[]): number {
  // Kahan summation keeps long columns exact enough for display.
  let total = 0;
  let carry = 0;
  for (const value of values) {
    const y = value - carry;
    const t = total + y;
    carry = t - total - y;
    total = t;
  }
  return total;
}

export function mean(values: readonly number[]): number {
  return values.length ? sum(values) / values.length : Number.NaN;
}

export function sorted(values: readonly number[]): number[] {
  return Array.from(Float64Array.from(values).sort());
}

/** Linear-interpolation quantile of already sorted values (p in 0..1). */
export function quantileSorted(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (!n) return Number.NaN;
  if (n === 1) return values[0];
  const position = (n - 1) * Math.min(1, Math.max(0, p));
  const base = Math.floor(position);
  const rest = position - base;
  const next = values[Math.min(n - 1, base + 1)];
  return values[base] + rest * (next - values[base]);
}

export function quantile(values: readonly number[], p: number): number {
  return quantileSorted(sorted(values), p);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** The most frequent values (all of them on a tie); empty when every value is unique. */
export function modes(values: readonly number[]): number[] {
  const counts = new Map<number, number>();
  let best = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > best) best = count;
  }
  if (best < 2) return [];
  return [...counts.entries()]
    .filter(([, count]) => count === best)
    .map(([value]) => value)
    .sort((a, b) => a - b);
}

export function variance(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return Number.NaN;
  const m = mean(values);
  let total = 0;
  for (const value of values) total += (value - m) ** 2;
  return total / (n - 1);
}

export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

/** Adjusted Fisher-Pearson skewness (G1). */
export function skewness(values: readonly number[]): number {
  const n = values.length;
  if (n < 3) return Number.NaN;
  const m = mean(values);
  let m2 = 0;
  let m3 = 0;
  for (const value of values) {
    const d = value - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  if (m2 === 0) return Number.NaN;
  const g1 = m3 / m2 ** 1.5;
  return (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
}

/** Sample excess kurtosis (G2). */
export function excessKurtosis(values: readonly number[]): number {
  const n = values.length;
  if (n < 4) return Number.NaN;
  const m = mean(values);
  let m2 = 0;
  let m4 = 0;
  for (const value of values) {
    const d2 = (value - m) ** 2;
    m2 += d2;
    m4 += d2 * d2;
  }
  m2 /= n;
  m4 /= n;
  if (m2 === 0) return Number.NaN;
  const g2 = m4 / (m2 * m2) - 3;
  return ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
}

export type Summary = {
  n: number;
  mean: number;
  median: number;
  modes: number[];
  sd: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  kurtosis: number;
  /** 95% (or the chosen level) confidence interval of the mean, t distribution. */
  ci: [number, number];
  standardError: number;
  /** Values outside [Q1 - 1.5 IQR, Q3 + 1.5 IQR]. */
  outliers: number[];
  fences: [number, number];
  /** Whisker ends: the most extreme values inside the fences. */
  whiskers: [number, number];
};

export function summarize(values: readonly number[], level = 0.95): Summary {
  const data = sorted(values);
  const n = data.length;
  const m = mean(data);
  const sd = standardDeviation(data);
  const q1 = quantileSorted(data, 0.25);
  const q3 = quantileSorted(data, 0.75);
  const iqr = q3 - q1;
  const fences: [number, number] = [q1 - 1.5 * iqr, q3 + 1.5 * iqr];
  const outliers = data.filter((value) => value < fences[0] || value > fences[1]);
  const inside = data.filter((value) => value >= fences[0] && value <= fences[1]);
  const standardError = n > 1 ? sd / Math.sqrt(n) : Number.NaN;
  const critical = n > 1 ? studentTQuantile(1 - (1 - level) / 2, n - 1) : Number.NaN;
  return {
    n,
    mean: m,
    median: quantileSorted(data, 0.5),
    modes: modes(data),
    sd,
    variance: variance(data),
    min: n ? data[0] : Number.NaN,
    max: n ? data[n - 1] : Number.NaN,
    range: n ? data[n - 1] - data[0] : Number.NaN,
    q1,
    q3,
    iqr,
    skewness: skewness(data),
    kurtosis: excessKurtosis(data),
    ci: [m - critical * standardError, m + critical * standardError],
    standardError,
    outliers,
    fences,
    whiskers: inside.length ? [inside[0], inside[inside.length - 1]] : [Number.NaN, Number.NaN],
  };
}

// ---------------------------------------------------------------------------
// Histograms
// ---------------------------------------------------------------------------

export type Bin = { x0: number; x1: number; count: number };

/** Freedman-Diaconis bin count, clamped to a readable range (Sturges when IQR is 0). */
export function suggestedBinCount(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 1;
  const data = sorted(values);
  const spread = data[n - 1] - data[0];
  if (spread === 0) return 1;
  const iqr = quantileSorted(data, 0.75) - quantileSorted(data, 0.25);
  const sturges = Math.ceil(Math.log2(n) + 1);
  if (iqr === 0) return Math.min(40, Math.max(3, sturges));
  const width = (2 * iqr) / Math.cbrt(n);
  return Math.min(40, Math.max(3, Math.ceil(spread / width)));
}

/** A "nice" step (1, 2, 2.5 or 5 times a power of ten) near `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * Equal-width bins over the data. With `integer`, bins snap to whole numbers
 * (so a 1..10 scale gets one bar per value when the count allows).
 */
export function histogram(
  values: readonly number[],
  binCount = suggestedBinCount(values),
  options: { integer?: boolean; domain?: [number, number] } = {},
): Bin[] {
  if (!values.length) return [];
  let low = options.domain?.[0] ?? Math.min(...values);
  let high = options.domain?.[1] ?? Math.max(...values);
  if (low === high) {
    low -= 0.5;
    high += 0.5;
  }
  let width = (high - low) / Math.max(1, binCount);
  if (options.integer) {
    width = Math.max(1, Math.ceil(width));
    low = Math.floor(low);
    const count = Math.max(1, Math.ceil((high - low + 1) / width));
    const bins: Bin[] = Array.from({ length: count }, (_, index) => ({
      x0: low + index * width,
      x1: low + (index + 1) * width,
      count: 0,
    }));
    for (const value of values) {
      const index = Math.min(count - 1, Math.max(0, Math.floor((value - low) / width)));
      bins[index].count += 1;
    }
    return bins;
  }
  const count = Math.max(1, binCount);
  const bins: Bin[] = Array.from({ length: count }, (_, index) => ({
    x0: low + index * width,
    x1: index === count - 1 ? high : low + (index + 1) * width,
    count: 0,
  }));
  for (const value of values) {
    if (value < low || value > high) continue;
    const index = Math.min(count - 1, Math.floor((value - low) / width));
    bins[index].count += 1;
  }
  return bins;
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/** Ranks with ties sharing their average rank (1-based). */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end += 1;
    const rank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k += 1) out[order[k].index] = rank;
    start = end + 1;
  }
  return out;
}

export type Correlation = { r: number; n: number; t: number; p: number };

export function pearson(xs: readonly number[], ys: readonly number[]): Correlation {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { r: Number.NaN, n, t: Number.NaN, p: Number.NaN };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { r: Number.NaN, n, t: Number.NaN, p: Number.NaN };
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const df = n - 2;
  if (Math.abs(r) === 1) return { r, n, t: r * Infinity, p: 0 };
  const t = r * Math.sqrt(df / (1 - r * r));
  return { r, n, t, p: studentTTwoSided(t, df) };
}

/** Spearman's rho: Pearson on the (tie-averaged) ranks, with the same t approximation. */
export function spearman(xs: readonly number[], ys: readonly number[]): Correlation {
  const n = Math.min(xs.length, ys.length);
  return pearson(ranks(xs.slice(0, n)), ranks(ys.slice(0, n)));
}

export type Regression = {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
};

/** Ordinary least squares y = intercept + slope · x. */
export function linearRegression(xs: readonly number[], ys: readonly number[]): Regression {
  const n = Math.min(xs.length, ys.length);
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx ? sxy / sxx : Number.NaN;
  const intercept = my - slope * mx;
  const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : Number.NaN;
  return { slope, intercept, r2, n };
}

// ---------------------------------------------------------------------------
// Categorical association
// ---------------------------------------------------------------------------

export type ChiSquare = {
  statistic: number;
  df: number;
  p: number;
  cramersV: number;
  /** Expected counts under independence, same shape as the table. */
  expected: number[][];
  n: number;
  /** Share of expected cells below 5 (the approximation gets shaky above 20%). */
  lowExpectedShare: number;
};

/** Pearson's chi-square test of independence (no continuity correction). */
export function chiSquareTest(table: readonly (readonly number[])[]): ChiSquare {
  // Rows and columns that are all zero carry no information and would divide by zero.
  const rowsKept = table.filter((row) => row.some((value) => value > 0));
  const columnCount = rowsKept[0]?.length ?? 0;
  const columnsKept: number[] = [];
  for (let c = 0; c < columnCount; c += 1) {
    if (rowsKept.some((row) => row[c] > 0)) columnsKept.push(c);
  }
  const matrix = rowsKept.map((row) => columnsKept.map((c) => row[c]));
  const r = matrix.length;
  const k = columnsKept.length;
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const columnTotals = columnsKept.map((_, c) => matrix.reduce((a, row) => a + row[c], 0));
  const n = rowTotals.reduce((a, b) => a + b, 0);
  const expected = matrix.map((_, i) =>
    columnsKept.map((__, j) => (rowTotals[i] * columnTotals[j]) / n),
  );
  let statistic = 0;
  let low = 0;
  for (let i = 0; i < r; i += 1) {
    for (let j = 0; j < k; j += 1) {
      const e = expected[i][j];
      if (e < 5) low += 1;
      if (e > 0) statistic += (matrix[i][j] - e) ** 2 / e;
    }
  }
  const df = (r - 1) * (k - 1);
  const minDim = Math.min(r, k) - 1;
  return {
    statistic,
    df,
    p: df > 0 ? chiSquareSf(statistic, df) : Number.NaN,
    cramersV: n > 0 && minDim > 0 ? Math.sqrt(statistic / (n * minDim)) : Number.NaN,
    expected,
    n,
    lowExpectedShare: r * k ? low / (r * k) : 0,
  };
}

// ---------------------------------------------------------------------------
// Group comparison
// ---------------------------------------------------------------------------

export type GroupStat = {
  label: string;
  n: number;
  mean: number;
  sd: number;
  ci: [number, number];
};

export type Anova = {
  groups: GroupStat[];
  f: number;
  dfBetween: number;
  dfWithin: number;
  p: number;
  etaSquared: number;
};

/** One-way ANOVA over labelled groups (groups with fewer than one value are dropped). */
export function oneWayAnova(
  groups: readonly { label: string; values: readonly number[] }[],
): Anova {
  const kept = groups.filter((group) => group.values.length > 0);
  const all = kept.flatMap((group) => group.values);
  const grand = mean(all);
  let between = 0;
  let within = 0;
  const stats: GroupStat[] = kept.map((group) => {
    const m = mean(group.values);
    between += group.values.length * (m - grand) ** 2;
    for (const value of group.values) within += (value - m) ** 2;
    const sd = standardDeviation(group.values);
    const n = group.values.length;
    const se = n > 1 ? sd / Math.sqrt(n) : Number.NaN;
    const critical = n > 1 ? studentTQuantile(0.975, n - 1) : Number.NaN;
    return { label: group.label, n, mean: m, sd, ci: [m - critical * se, m + critical * se] };
  });
  const dfBetween = kept.length - 1;
  const dfWithin = all.length - kept.length;
  const f = dfBetween > 0 && dfWithin > 0 ? between / dfBetween / (within / dfWithin) : Number.NaN;
  const total = between + within;
  return {
    groups: stats,
    f,
    dfBetween,
    dfWithin,
    p: Number.isFinite(f) ? fSf(f, dfBetween, dfWithin) : Number.NaN,
    etaSquared: total > 0 ? between / total : Number.NaN,
  };
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export type NpsBreakdown = {
  promoters: number;
  passives: number;
  detractors: number;
  n: number;
  /** -100..100 */
  score: number;
};

export function nps(values: readonly number[]): NpsBreakdown {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const value of values) {
    if (value >= 9) promoters += 1;
    else if (value >= 7) passives += 1;
    else detractors += 1;
  }
  const n = values.length;
  return {
    promoters,
    passives,
    detractors,
    n,
    score: n ? ((promoters - detractors) / n) * 100 : Number.NaN,
  };
}

// ---------------------------------------------------------------------------
// Plain-language readings
// ---------------------------------------------------------------------------

export function describeP(p: number): string {
  if (!Number.isFinite(p)) return "not enough data to test";
  if (p < 0.001) return "very strong evidence";
  if (p < 0.01) return "strong evidence";
  if (p < 0.05) return "evidence";
  if (p < 0.1) return "weak evidence";
  return "no real evidence";
}

export function describeCramersV(v: number, df: number): string {
  if (!Number.isFinite(v)) return "unknown";
  // Cohen's thresholds shrink as the smaller table dimension grows.
  const k = Math.max(1, Math.min(df, 5));
  const small = 0.1 / Math.sqrt(k);
  const medium = 0.3 / Math.sqrt(k);
  const large = 0.5 / Math.sqrt(k);
  if (v >= large) return "strong";
  if (v >= medium) return "moderate";
  if (v >= small) return "weak";
  return "negligible";
}

export function describeCorrelation(r: number): string {
  if (!Number.isFinite(r)) return "undefined";
  const a = Math.abs(r);
  const strength =
    a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "very weak or no";
  if (a < 0.2) return `${strength} relationship`;
  return `${strength} ${r > 0 ? "positive" : "negative"} relationship`;
}

export function formatP(p: number): string {
  if (!Number.isFinite(p)) return "n/a";
  if (p < 0.0001) return "< 0.0001";
  return p.toFixed(4);
}
