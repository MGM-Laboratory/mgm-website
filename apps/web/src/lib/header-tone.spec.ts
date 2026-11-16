// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TEXT_CONTRAST,
  compositeLayers,
  contrastRatio,
  decideTone,
  headerToneProviders,
  luminance,
  mixRgb,
  onHeaderToneRequest,
  parseCssColor,
  registerHeaderToneProvider,
  requestHeaderToneSample,
  rgbCss,
  rgbaCss,
  saturateRgb,
  toneOf,
  worstContrast,
  type HeaderToneProvider,
  type Rgb,
  type TonePreferences,
} from "./header-tone";

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

const preferences: TonePreferences = {
  preferred: { ink: [20, 20, 20], surface: [250, 250, 250] },
  light: { ink: [10, 10, 10], surface: [255, 255, 255] },
  dark: { ink: [245, 245, 245], surface: [10, 10, 10] },
  alpha: 0.6,
  saturate: 1,
};

// a thin tint, so the busy backdrops below need a stronger one
const thin: TonePreferences = { ...preferences, alpha: 0.2 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider registry", () => {
  it("answers with the latest provider first and unregisters", () => {
    const first: HeaderToneProvider = () => undefined;
    const second: HeaderToneProvider = () => undefined;
    const offFirst = registerHeaderToneProvider(first);
    const offSecond = registerHeaderToneProvider(second);

    expect(headerToneProviders()).toEqual([second, first]);

    offSecond();
    offSecond();
    expect(headerToneProviders()).toEqual([first]);

    offFirst();
    expect(headerToneProviders()).toEqual([]);
  });
});

describe("resample requests", () => {
  it("notifies every listener until it unsubscribes", () => {
    const one = vi.fn();
    const two = vi.fn();
    const offOne = onHeaderToneRequest(one);
    const offTwo = onHeaderToneRequest(two);

    requestHeaderToneSample();
    expect([one.mock.calls.length, two.mock.calls.length]).toEqual([1, 1]);

    offOne();
    requestHeaderToneSample();
    expect([one.mock.calls.length, two.mock.calls.length]).toEqual([1, 2]);

    offTwo();
  });

  it("lets a listener unsubscribe while it is notified", () => {
    const calls: string[] = [];
    const off = onHeaderToneRequest(() => {
      calls.push("a");
      off();
    });
    const offB = onHeaderToneRequest(() => calls.push("b"));

    requestHeaderToneSample();
    requestHeaderToneSample();

    expect(calls).toEqual(["a", "b", "b"]);
    offB();
  });
});

describe("colour maths", () => {
  it("computes WCAG luminance and contrast", () => {
    expect(luminance(BLACK)).toBe(0);
    expect(luminance(WHITE)).toBeCloseTo(1, 6);
    expect(luminance([0, 0, 10])).toBeCloseTo(0.0722 * (10 / 255 / 12.92), 8);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
  });

  it("mixes colours in sRGB", () => {
    expect(mixRgb(BLACK, WHITE, 0.5)).toEqual([127.5, 127.5, 127.5]);
    expect(mixRgb(BLACK, WHITE, 0)).toEqual(BLACK);
    expect(mixRgb(BLACK, WHITE, 1)).toEqual(WHITE);
  });

  it("saturates like CSS and clamps", () => {
    expect(saturateRgb([100, 150, 200], 1)).toEqual([100, 150, 200]);
    const grey = saturateRgb([255, 0, 0], 0);
    expect(grey[0]).toBeCloseTo(0.213 * 255, 6);
    expect(grey[1]).toBeCloseTo(0.213 * 255, 6);
    const boosted = saturateRgb([255, 0, 0], 5);
    expect(boosted[0]).toBe(255);
    expect(boosted[1]).toBe(0);
    expect(boosted[2]).toBe(0);
  });

  it("serialises colours for CSS", () => {
    expect(rgbCss([1.4, 2.5, 254.6])).toBe("rgb(1 3 255)");
    expect(rgbaCss([1, 2, 3], 0.5)).toBe("rgb(1 2 3 / 0.500)");
  });

  it("composites layers listed top first over a base", () => {
    expect(compositeLayers(WHITE, [])).toEqual(WHITE);
    expect(compositeLayers(WHITE, [{ rgb: BLACK, alpha: 0.5 }])).toEqual([127.5, 127.5, 127.5]);
    // the bottom layer goes on first
    expect(
      compositeLayers(WHITE, [
        { rgb: [255, 0, 0], alpha: 1 },
        { rgb: BLACK, alpha: 1 },
      ]),
    ).toEqual([255, 0, 0]);
  });

  it("splits tone at the crossover luminance", () => {
    expect(toneOf(WHITE)).toBe("light");
    expect(toneOf(BLACK)).toBe("dark");
    expect(toneOf([118, 118, 118])).toBe("light");
    expect(toneOf([110, 110, 110])).toBe("dark");
  });
});

describe("parseCssColor", () => {
  it("returns null for empty input and keeps transparent", () => {
    expect(parseCssColor("   ")).toBeNull();
    expect(parseCssColor("Transparent")).toEqual({ rgb: [0, 0, 0], alpha: 0 });
  });

  it("parses hex forms", () => {
    expect(parseCssColor("#fff")).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseCssColor("#FF000080")?.alpha).toBeCloseTo(128 / 255, 6);
    expect(parseCssColor("#0a0b0c")).toEqual({ rgb: [10, 11, 12], alpha: 1 });
    expect(parseCssColor("#f008")?.rgb).toEqual([255, 0, 0]);
    expect(parseCssColor("#12")).toBeNull();
    expect(parseCssColor("#gggggg")).toBeNull();
  });

  it("parses rgb and rgba in comma, space and slash syntax", () => {
    expect(parseCssColor("rgb(1, 2, 3)")).toEqual({ rgb: [1, 2, 3], alpha: 1 });
    expect(parseCssColor("rgba(1, 2, 3, 0.5)")).toEqual({ rgb: [1, 2, 3], alpha: 0.5 });
    expect(parseCssColor("rgb(1 2 3 / 25%)")).toEqual({ rgb: [1, 2, 3], alpha: 0.25 });
    expect(parseCssColor("rgb(50% 0% 100%)")?.rgb).toEqual([127.5, 0, 255]);
    expect(parseCssColor("rgb(none 2 3)")?.rgb).toEqual([0, 2, 3]);
    expect(parseCssColor("rgb(1 2 3 / 4)")?.alpha).toBe(1);
    expect(parseCssColor("rgb(1 2 3 / -1)")?.alpha).toBe(0);
    expect(parseCssColor("rgb(1 2)")).toBeNull();
  });

  it("parses color(srgb ...)", () => {
    expect(parseCssColor("color(srgb 1 0.5 0 / 0.5)")).toEqual({
      rgb: [255, 127.5, 0],
      alpha: 0.5,
    });
    expect(parseCssColor("color(srgb 1 1 1)")?.alpha).toBe(1);
  });

  it("parses oklab and oklch", () => {
    const white = parseCssColor("oklab(1 0 0)");
    expect(white?.rgb[0]).toBeCloseTo(255, 0);
    expect(white?.rgb[1]).toBeCloseTo(255, 0);
    expect(white?.rgb[2]).toBeCloseTo(255, 0);

    const black = parseCssColor("oklab(0 0 0 / 50%)");
    expect(black?.rgb).toEqual([0, 0, 0]);
    expect(black?.alpha).toBe(0.5);

    const grey = parseCssColor("oklch(50% 0 0deg)");
    expect(grey?.rgb[0]).toBeGreaterThan(90);
    expect(grey?.rgb[0]).toBeLessThan(130);
    expect(grey?.rgb[0]).toBeCloseTo(grey?.rgb[1] ?? 0, 3);

    const red = parseCssColor("oklch(0.628 0.2577 29.23)");
    expect(red?.rgb[0]).toBeGreaterThan(240);
    expect(red?.rgb[1]).toBeLessThan(40);
  });

  it("gives up without a canvas for anything else", () => {
    vi.stubGlobal("document", undefined);

    expect(parseCssColor("rebeccapurple")).toBeNull();
    expect(parseCssColor("hsl(10 20% 30%)")).toBeNull();
    expect(parseCssColor("oklab(1)")).toBeNull();
  });

  it("asks a canvas to resolve other colour names", async () => {
    const fillRect = vi.fn();
    const context = {
      clearRect: vi.fn(),
      fillRect,
      getImageData: () => ({ data: [102, 51, 153, 255] }),
      fillStyle: "",
    };
    const getContext = vi.fn(() => context);
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext }) });
    vi.resetModules();
    const fresh = await import("./header-tone");

    expect(fresh.parseCssColor("rebeccapurple")).toEqual({ rgb: [102, 51, 153], alpha: 1 });
    expect(fresh.parseCssColor("hsl(0 0% 0%)")).toEqual({ rgb: [102, 51, 153], alpha: 1 });
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(fillRect).toHaveBeenCalledTimes(2);
    expect(context.fillStyle).toBe("hsl(0 0% 0%)");
  });

  it("gives up when the canvas has no 2d context", async () => {
    vi.stubGlobal("document", {
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    });
    vi.resetModules();
    const fresh = await import("./header-tone");

    expect(fresh.parseCssColor("rebeccapurple")).toBeNull();
  });
});

describe("worstContrast", () => {
  it("takes the minimum over the backdrops", () => {
    const worst = worstContrast([WHITE, BLACK], BLACK, WHITE, 1, 1);

    expect(worst).toBeCloseTo(21, 5);
    expect(worstContrast([WHITE, BLACK], BLACK, WHITE, 0, 1)).toBeCloseTo(1, 5);
  });

  it("is infinite without a backdrop", () => {
    expect(worstContrast([], BLACK, WHITE, 1, 1)).toBe(Infinity);
  });

  it("weakens the text with textMix", () => {
    expect(worstContrast([WHITE], BLACK, WHITE, 0, 0.5)).toBeLessThan(
      worstContrast([WHITE], BLACK, WHITE, 0, 1),
    );
  });
});

describe("decideTone", () => {
  it("falls back to the preferred palette without samples", () => {
    const choice = decideTone([], preferences, { textMix: 1 });

    expect(choice).toMatchObject({
      tone: "light",
      ink: preferences.preferred.ink,
      surface: preferences.preferred.surface,
      alpha: 0.6,
      flip: false,
      media: false,
    });
    expect(choice.contrast).toBeGreaterThan(TEXT_CONTRAST);
  });

  it("keeps the preferred ink while it reads", () => {
    const choice = decideTone([{ color: [240, 240, 240], media: false }], preferences, {
      textMix: 1,
    });

    expect(choice).toMatchObject({ tone: "light", flip: false, alpha: 0.6 });
    expect(choice.ink).toBe(preferences.preferred.ink);
    expect(choice.contrast).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("flips to the neutral ink and surface of a dark backdrop", () => {
    const choice = decideTone([{ color: [5, 5, 5], media: false }], preferences, { textMix: 1 });

    expect(choice.tone).toBe("dark");
    expect(choice.flip).toBe(true);
    expect(choice.ink).toBe(preferences.dark.ink);
    expect(choice.surface).toBe(preferences.dark.surface);
    expect(choice.contrast).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("keeps the preferred surface when it has the same tone as the backdrop", () => {
    const choice = decideTone([{ color: [255, 255, 255], media: false }], preferences, {
      textMix: 1,
    });

    expect(choice.surface).toBe(preferences.preferred.surface);
  });

  it("holds the previous tone close to the crossover", () => {
    const grey: Rgb = [118, 118, 118];
    const sample = [{ color: grey, media: false }];

    expect(decideTone(sample, preferences, { textMix: 1, previous: "dark" }).tone).toBe("dark");
    expect(decideTone(sample, preferences, { textMix: 1, previous: "light" }).tone).toBe("light");
    expect(decideTone(sample, preferences, { textMix: 1 }).tone).toBe("light");
  });

  it("does not hold the previous tone far from the crossover", () => {
    const choice = decideTone([{ color: WHITE, media: false }], preferences, {
      textMix: 1,
      previous: "dark",
    });

    expect(choice.tone).toBe("light");
  });

  it("raises the tint when the ink cannot pass over a busy backdrop", () => {
    const choice = decideTone(
      [
        { color: BLACK, media: true },
        { color: WHITE, media: true },
      ],
      thin,
      { textMix: 1 },
    );

    expect(choice.media).toBe(true);
    expect(choice.alpha).toBeGreaterThan(thin.alpha);
    expect(choice.alpha).toBeLessThanOrEqual(1);
    expect(choice.contrast).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("asks for more contrast over imagery than over a flat colour", () => {
    // A bare tint with the same ink in both tones, over a backdrop where the
    // ink reads (above 4.5) but stays under the 4.5 + margin that imagery needs.
    const bare: TonePreferences = {
      ...preferences,
      alpha: 0,
      light: { ink: preferences.preferred.ink, surface: [255, 255, 255] },
    };
    const color: Rgb = [136, 136, 136];
    const flat = decideTone([{ color, media: false }], bare, { textMix: 1 });
    const imagery = decideTone([{ color, media: true }], bare, { textMix: 1 });

    expect(flat.contrast).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(flat.contrast).toBeLessThan(TEXT_CONTRAST + 0.8);
    expect(flat.alpha).toBe(0);
    expect(imagery.alpha).toBeGreaterThan(flat.alpha);
    expect(imagery.contrast).toBeGreaterThanOrEqual(TEXT_CONTRAST + 0.8);
    expect(imagery.media).toBe(true);
    expect(flat.media).toBe(false);
  });

  it("makes the rule hold over black and white where a point is unreadable", () => {
    const choice = decideTone([{ color: [250, 250, 250], media: false, unknown: true }], thin, {
      textMix: 1,
    });

    expect(choice.alpha).toBeGreaterThan(thin.alpha);
    expect(choice.contrast).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("uses the preferred surface for the tone when every point is unreadable", () => {
    const choice = decideTone([{ color: BLACK, media: false, unknown: true }], preferences, {
      textMix: 1,
    });

    expect(choice.tone).toBe("light");
  });

  it("applies the glass saturation before judging the backdrop", () => {
    const sample = [{ color: [200, 40, 40] as Rgb, media: false }];
    const plain = decideTone(sample, preferences, { textMix: 1 });
    const vivid = decideTone(sample, { ...preferences, saturate: 3 }, { textMix: 1 });

    expect(plain.contrast).not.toBe(vivid.contrast);
  });
});
