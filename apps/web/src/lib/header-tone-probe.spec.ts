import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A small stand-in for the parts of the DOM that the probe reads. Elements are
// plain objects built from fake classes, so the probe's instanceof checks work.

type Style = Record<string, string>;
type Box = { left: number; top: number; width: number; height: number };

class FakeNode {
  nodeType = 1;
  textContent = "";
}
class FakeElement extends FakeNode {
  style: Style = {};
  box: Box = { left: 0, top: 0, width: 100, height: 100 };
  childNodes: FakeNode[] = [];
  dataset: Record<string, string> = {};
  hintOwner: FakeElement | null = null;
  descendants: FakeElement[] = [];
  getBoundingClientRect() {
    const { left, top, width, height } = this.box;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  closest(selector: string) {
    return selector === "[data-header-tone]" ? this.hintOwner : null;
  }
  querySelectorAll() {
    return this.descendants;
  }
}
class FakeImage extends FakeElement {
  complete = true;
  naturalWidth = 100;
  naturalHeight = 100;
  currentSrc = "";
  src = "";
  crossOrigin: string | null = null;
}
class FakeVideo extends FakeElement {
  poster = "";
  currentSrc = "";
  src = "";
  readyState = 0;
  videoWidth = 0;
  videoHeight = 0;
}
class FakeIframe extends FakeElement {}
class FakeEmbed extends FakeElement {}
class FakeObject extends FakeElement {}
class FakeCanvas extends FakeElement {}
class FakeSvg extends FakeElement {}

function el<T extends FakeElement>(element: T, style: Style = {}, box?: Partial<Box>): T {
  element.style = { backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none", ...style };
  if (box) element.box = { ...element.box, ...box };
  return element;
}

function textOf(element: FakeElement, text = "hello") {
  const node = new FakeNode();
  node.nodeType = 3;
  node.textContent = text;
  element.childNodes = [node];
  return element;
}

type Hit = FakeElement | Element;

let stack: Hit[] = [];
let pixelData: number[] = [];
let drawThrows = false;
let contextMissing = false;
const drawn: { w: number; h: number }[] = [];
const images: {
  onload?: () => void;
  onerror?: () => void;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}[] = [];

const body = el(new FakeElement(), { backgroundColor: "rgb(250, 250, 250)" });
const html = el(new FakeElement(), { backgroundColor: "rgba(0, 0, 0, 0)" });

function installDom() {
  vi.stubGlobal("HTMLImageElement", FakeImage);
  vi.stubGlobal("HTMLVideoElement", FakeVideo);
  vi.stubGlobal("HTMLIFrameElement", FakeIframe);
  vi.stubGlobal("HTMLEmbedElement", FakeEmbed);
  vi.stubGlobal("HTMLObjectElement", FakeObject);
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("SVGElement", FakeSvg);
  vi.stubGlobal("Node", { TEXT_NODE: 3 });
  vi.stubGlobal("window", {
    location: { href: "https://site.test/page", origin: "https://site.test" },
    innerWidth: 1000,
    innerHeight: 800,
  });
  vi.stubGlobal("getComputedStyle", (element: FakeElement) => element.style);
  vi.stubGlobal("document", {
    body,
    documentElement: html,
    elementsFromPoint: () => stack,
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () =>
          contextMissing
            ? null
            : {
                clearRect: () => {},
                fillRect: () => {},
                fillStyle: "",
                imageSmoothingEnabled: false,
                imageSmoothingQuality: "low",
                drawImage: () => {
                  if (drawThrows) throw new Error("tainted");
                  drawn.push({ w: canvas.width, h: canvas.height });
                },
                getImageData: (_x: number, _y: number, w: number, h: number) => ({
                  data: Uint8ClampedArray.from(
                    Array.from(
                      { length: w * h * 4 },
                      (_, index) => pixelData[index % pixelData.length],
                    ),
                  ),
                }),
              },
      };
      return canvas;
    },
  });
  vi.stubGlobal(
    "Image",
    class {
      decoding = "";
      naturalWidth = 80;
      naturalHeight = 40;
      onload?: () => void;
      onerror?: () => void;
      private _src = "";
      get src() {
        return this._src;
      }
      set src(value: string) {
        this._src = value;
        images.push(this as unknown as (typeof images)[number]);
      }
    },
  );
}

async function load() {
  vi.resetModules();
  const probe = await import("./header-tone-probe");
  const tone = await import("./header-tone");
  return { probe, tone };
}

const base: [number, number, number] = [250, 250, 250];
const noSkip = () => false;

function image(extra: Partial<FakeImage> = {}, style: Style = {}, box?: Partial<Box>) {
  const item = el(new FakeImage(), style, box);
  item.currentSrc = "https://site.test/a.png";
  return Object.assign(item, extra);
}

beforeEach(() => {
  stack = [];
  pixelData = [200, 100, 50, 255];
  drawThrows = false;
  contextMissing = false;
  drawn.length = 0;
  images.length = 0;
  // body and html are shared by every test, so each test starts from the same page
  body.style = { backgroundColor: "rgb(250, 250, 250)", backgroundImage: "none" };
  html.style = { backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none" };
  body.descendants = [];
  html.descendants = [];
  installDom();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pageBaseColor", () => {
  it("uses the body background when it is opaque", async () => {
    const { probe } = await load();

    expect(probe.pageBaseColor()).toEqual([250, 250, 250]);
  });

  it("falls back to html, then to white", async () => {
    const { probe } = await load();
    body.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    html.style.backgroundColor = "rgb(1, 2, 3)";
    expect(probe.pageBaseColor()).toEqual([1, 2, 3]);

    html.style.backgroundColor = "rgba(0, 0, 0, 0)";
    expect(probe.pageBaseColor()).toEqual([255, 255, 255]);
  });
});

describe("probePoint hints and unreadable content", () => {
  it("returns the page base when nothing is under the point", async () => {
    const { probe } = await load();

    expect(probe.probePoint(5, 5, noSkip, base)).toEqual({ color: base, media: false });
  });

  it("skips elements the header owns", async () => {
    const { probe } = await load();
    const header = el(new FakeElement(), { backgroundColor: "rgb(0, 0, 0)" });
    stack = [header as unknown as Element];

    expect(probe.probePoint(5, 5, (item) => item === (header as unknown), base).color).toEqual(
      base,
    );
  });

  it("lets data-header-tone decide, by name, by colour, or not at all", async () => {
    const { probe } = await load();
    const dark = el(new FakeElement());
    dark.hintOwner = Object.assign(new FakeElement(), { dataset: { headerTone: "dark" } });
    stack = [dark];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([21, 24, 30]);

    const light = el(new FakeElement());
    light.hintOwner = Object.assign(new FakeElement(), { dataset: { headerTone: " light " } });
    stack = [light];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([247, 247, 245]);

    const custom = el(new FakeElement());
    custom.hintOwner = Object.assign(new FakeElement(), {
      dataset: { headerTone: "rgb(10, 20, 30)" },
    });
    stack = [custom];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([10, 20, 30]);
  });

  it("ignores a hint that is not a colour and keeps walking", async () => {
    const { probe } = await load();
    contextMissing = true;
    const odd = el(new FakeElement(), { backgroundColor: "rgb(9, 9, 9)" });
    odd.hintOwner = Object.assign(new FakeElement(), { dataset: { headerTone: "nonsense(" } });
    stack = [odd];

    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([9, 9, 9]);
  });

  it("treats an ignore hint as transparent to the probe", async () => {
    const { probe } = await load();
    const hidden = el(new FakeElement(), { backgroundColor: "rgb(0, 0, 0)" });
    hidden.hintOwner = Object.assign(new FakeElement(), { dataset: { headerTone: "ignore" } });
    stack = [hidden];

    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual(base);
  });

  it("blends translucent layers above a hint", async () => {
    const { probe } = await load();
    const veil = el(new FakeElement(), { backgroundColor: "rgba(255, 255, 255, 0.5)" });
    const dark = el(new FakeElement());
    dark.hintOwner = Object.assign(new FakeElement(), { dataset: { headerTone: "dark" } });
    stack = [veil, dark];

    const { color } = probe.probePoint(5, 5, noSkip, base);

    expect(color[0]).toBeCloseTo(138, 0);
  });

  it("calls an embedded document unknown", async () => {
    const { probe } = await load();
    for (const Kind of [FakeIframe, FakeEmbed, FakeObject]) {
      stack = [el(new Kind())];
      expect(probe.probePoint(5, 5, noSkip, base)).toMatchObject({ media: true, unknown: true });
    }
  });

  it("calls a css url() picture unknown", async () => {
    const { probe } = await load();
    stack = [el(new FakeElement(), { backgroundImage: 'url("a.png")' })];

    expect(probe.probePoint(5, 5, noSkip, base)).toMatchObject({ media: true, unknown: true });
  });

  it("falls through canvases and svg", async () => {
    const { probe } = await load();
    stack = [
      el(new FakeCanvas()),
      el(new FakeSvg()),
      el(new FakeElement(), { backgroundColor: "rgb(5, 6, 7)" }),
    ];

    expect(probe.probePoint(5, 5, noSkip, base)).toEqual({ color: [5, 6, 7], media: false });
  });
});

describe("probePoint backgrounds and text", () => {
  it("composites translucent backgrounds down to the first opaque one", async () => {
    const { probe } = await load();
    stack = [
      el(new FakeElement(), { backgroundColor: "rgba(0, 0, 0, 0.5)" }),
      el(new FakeElement(), { backgroundColor: "rgb(100, 100, 100)" }),
      el(new FakeElement(), { backgroundColor: "rgb(1, 1, 1)" }),
    ];

    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([50, 50, 50]);
  });

  it("ignores almost invisible backgrounds", async () => {
    const { probe } = await load();
    stack = [el(new FakeElement(), { backgroundColor: "rgba(0, 0, 0, 0.005)" })];

    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual(base);
  });

  it("darkens the backdrop by the first element's own text, more for big type", async () => {
    const { probe } = await load();
    const small = textOf(el(new FakeElement(), { color: "rgb(0, 0, 0)", fontSize: "14px" }));
    stack = [small];
    const smallResult = probe.probePoint(5, 5, noSkip, base).color;
    expect(smallResult[0]).toBeCloseTo(250 * (1 - 0.06), 3);

    const big = textOf(el(new FakeElement(), { color: "rgb(0, 0, 0)", fontSize: "200px" }));
    stack = [big];
    expect(probe.probePoint(5, 5, noSkip, base).color[0]).toBeCloseTo(250 * (1 - 0.4), 3);

    const noSize = textOf(el(new FakeElement(), { color: "rgb(0, 0, 0)", fontSize: "" }));
    stack = [noSize];
    expect(probe.probePoint(5, 5, noSkip, base).color[0]).toBeCloseTo(250 * (1 - 0.069), 3);
  });

  it("skips text that is blank, transparent or unparseable, and only counts the first element", async () => {
    const { probe } = await load();
    stack = [textOf(el(new FakeElement(), { color: "rgb(0, 0, 0)", fontSize: "20px" }), "   ")];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual(base);

    stack = [textOf(el(new FakeElement(), { color: "rgba(0, 0, 0, 0)" }))];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual(base);

    contextMissing = true;
    stack = [textOf(el(new FakeElement(), { color: "mystery" }))];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual(base);
    contextMissing = false;

    stack = [
      el(new FakeElement(), { backgroundColor: "rgba(255, 255, 255, 0.1)" }),
      textOf(el(new FakeElement(), { color: "rgb(0, 0, 0)", fontSize: "20px" })),
    ];
    expect(probe.probePoint(5, 5, noSkip, base).color[0]).toBeGreaterThan(240);
  });

  it("weights the text colour by its own alpha", async () => {
    const { probe } = await load();
    stack = [textOf(el(new FakeElement(), { color: "rgba(0, 0, 0, 0.5)", fontSize: "14px" }))];

    expect(probe.probePoint(5, 5, noSkip, base).color[0]).toBeCloseTo(250 * (1 - 0.03), 3);
  });
});

describe("probePoint images", () => {
  it("reads a same-origin picture from a downscaled copy", async () => {
    const { probe } = await load();
    stack = [image({}, { objectFit: "fill" })];

    const result = probe.probePoint(50, 50, noSkip, base);

    expect(result).toEqual({ color: [200, 100, 50], media: true });
    expect(drawn).toEqual([{ w: 48, h: 48 }]);
  });

  it("caches the copy per url and shares a failed draw", async () => {
    const { probe } = await load();
    stack = [image()];
    probe.probePoint(10, 10, noSkip, base);
    probe.probePoint(90, 90, noSkip, base);
    expect(drawn).toHaveLength(1);

    drawThrows = true;
    stack = [image({ currentSrc: "https://site.test/b.png" })];
    expect(probe.probePoint(10, 10, noSkip, base)).toMatchObject({ unknown: true });
    expect(probe.probePoint(10, 10, noSkip, base)).toMatchObject({ unknown: true });
  });

  it("calls a picture unknown when the canvas has no context", async () => {
    const { probe } = await load();
    contextMissing = true;
    stack = [image({ currentSrc: "https://site.test/c.png" })];

    expect(probe.probePoint(10, 10, noSkip, base)).toMatchObject({ unknown: true });
  });

  it("stops at an opaque picture and keeps going through a translucent one", async () => {
    const { probe } = await load();
    pixelData = [0, 0, 0, 255];
    stack = [image(), el(new FakeElement(), { backgroundColor: "rgb(9, 9, 9)" })];
    expect(probe.probePoint(10, 10, noSkip, base).color).toEqual([0, 0, 0]);

    pixelData = [0, 0, 0, 128];
    stack = [
      image({ currentSrc: "https://site.test/d.png" }),
      el(new FakeElement(), { backgroundColor: "rgb(100, 100, 100)" }),
    ];
    const blended = probe.probePoint(10, 10, noSkip, base);
    expect(blended.media).toBe(true);
    expect(blended.color[0]).toBeGreaterThan(40);
    expect(blended.color[0]).toBeLessThan(60);
  });

  it("treats a point outside the drawn picture as see-through", async () => {
    const { probe } = await load();
    stack = [
      image(
        { naturalWidth: 100, naturalHeight: 50 },
        { objectFit: "contain", objectPosition: "left top" },
      ),
      el(new FakeElement(), { backgroundColor: "rgb(7, 7, 7)" }),
    ];

    // contain on a 100x100 box draws 100x50 at the top, so y = 90 is below it
    expect(probe.probePoint(10, 90, noSkip, base)).toEqual({ color: [7, 7, 7], media: false });
  });

  it("honours cover, none, scale-down and the position keywords", async () => {
    const { probe } = await load();
    const point = (style: Style, extra: Partial<FakeImage> = {}, x = 50, y = 50) => {
      stack = [image({ currentSrc: `https://site.test/${Math.random()}.png`, ...extra }, style)];
      return probe.sampleImageAt(stack[0] as FakeImage as unknown as HTMLImageElement, x, y);
    };

    expect(point({ objectFit: "cover" }, { naturalWidth: 200, naturalHeight: 100 })?.alpha).toBe(1);
    expect(point({ objectFit: "none" }, { naturalWidth: 400, naturalHeight: 400 })?.alpha).toBe(1);
    expect(
      point(
        { objectFit: "scale-down", objectPosition: "right bottom" },
        { naturalWidth: 50, naturalHeight: 50 },
        99,
        99,
      )?.alpha,
    ).toBe(1);
    expect(
      point(
        { objectFit: "scale-down", objectPosition: "right bottom" },
        { naturalWidth: 50, naturalHeight: 50 },
        10,
        10,
      )?.alpha,
    ).toBe(0);
    expect(
      point(
        { objectFit: "contain", objectPosition: "10px 20%" },
        { naturalWidth: 50, naturalHeight: 50 },
        30,
        30,
      )?.alpha,
    ).toBe(1);
    expect(
      point(
        { objectFit: "contain", objectPosition: "weird" },
        { naturalWidth: 50, naturalHeight: 50 },
        50,
        50,
      )?.alpha,
    ).toBe(1);
    expect(point({ objectFit: "", objectPosition: "" })?.alpha).toBe(1);
  });

  it("returns null for pictures that cannot be read", async () => {
    const { probe } = await load();
    const asImage = (item: FakeImage) => item as unknown as HTMLImageElement;

    expect(probe.sampleImageAt(asImage(image({ complete: false })), 5, 5)).toBeNull();
    expect(probe.sampleImageAt(asImage(image({ naturalWidth: 0 })), 5, 5)).toBeNull();
    expect(
      probe.sampleImageAt(asImage(image({ currentSrc: "https://other.test/a.png" })), 5, 5),
    ).toBeNull();
    expect(
      probe.sampleImageAt(
        asImage(image({ currentSrc: "https://other.test/a.png", crossOrigin: "anonymous" })),
        5,
        5,
      ),
    ).not.toBeNull();
    expect(probe.sampleImageAt(asImage(image({ currentSrc: "" })), 5, 5)).toBeNull();
    // an element with no area shows nothing
    expect(probe.sampleImageAt(asImage(image({}, {}, { width: 0 })), 5, 5)).toEqual({
      rgb: [0, 0, 0],
      alpha: 0,
    });
  });

  it("accepts data and blob urls and falls back to src and relative urls", async () => {
    const { probe } = await load();
    const asImage = (item: FakeImage) => item as unknown as HTMLImageElement;

    expect(
      probe.sampleImageAt(asImage(image({ currentSrc: "data:image/png;base64,AA" })), 5, 5),
    ).not.toBeNull();
    expect(
      probe.sampleImageAt(asImage(image({ currentSrc: "blob:https://x.test/1" })), 5, 5),
    ).not.toBeNull();
    expect(
      probe.sampleImageAt(asImage(image({ currentSrc: "", src: "/local/a.png" })), 5, 5),
    ).not.toBeNull();
    expect(probe.sampleImageAt(asImage(image({ currentSrc: "http://[bad" })), 5, 5)).toBeNull();
  });

  it("evicts the oldest copy after sixty four", async () => {
    const { probe } = await load();
    const asImage = (item: FakeImage) => item as unknown as HTMLImageElement;

    for (let index = 0; index < 66; index += 1) {
      probe.sampleImageAt(asImage(image({ currentSrc: `https://site.test/${index}.png` })), 5, 5);
    }
    expect(drawn).toHaveLength(66);

    probe.sampleImageAt(asImage(image({ currentSrc: "https://site.test/0.png" })), 5, 5);
    expect(drawn).toHaveLength(67);
    probe.sampleImageAt(asImage(image({ currentSrc: "https://site.test/65.png" })), 5, 5);
    expect(drawn).toHaveLength(67);
  });

  it("calls an unloaded picture nothing and a loaded unreadable one unknown", async () => {
    const { probe } = await load();
    stack = [
      image({ complete: false }),
      el(new FakeElement(), { backgroundColor: "rgb(3, 3, 3)" }),
    ];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([3, 3, 3]);

    stack = [image({ currentSrc: "https://other.test/a.png" })];
    expect(probe.probePoint(5, 5, noSkip, base)).toMatchObject({ unknown: true });
  });

  it("skips a fully transparent sample", async () => {
    const { probe } = await load();
    pixelData = [10, 10, 10, 0];
    stack = [
      image({ currentSrc: "https://site.test/clear.png" }),
      el(new FakeElement(), { backgroundColor: "rgb(4, 4, 4)" }),
    ];

    expect(probe.probePoint(5, 5, noSkip, base)).toEqual({ color: [4, 4, 4], media: false });
  });
});

describe("probePoint videos", () => {
  const asVideo = (item: FakeVideo) => item as unknown as HTMLVideoElement;

  function video(extra: Partial<FakeVideo> = {}, style: Style = {}) {
    return Object.assign(el(new FakeVideo(), style), extra);
  }

  it("loads a same-origin poster once, then samples it and asks the header to resample", async () => {
    const { probe, tone } = await load();
    const resample = vi.fn();
    const off = tone.onHeaderToneRequest(resample);
    const item = video({ poster: "https://site.test/poster.png" });

    expect(probe.sampleVideoAt(asVideo(item), 5, 5)).toBeNull();
    expect(probe.sampleVideoAt(asVideo(item), 5, 5)).toBeNull();
    expect(images).toHaveLength(1);

    images[0].onload?.();
    expect(resample).toHaveBeenCalledTimes(1);

    const sample = probe.sampleVideoAt(asVideo(item), 50, 50);
    expect(sample).toEqual({ rgb: [200, 100, 50], alpha: 1 });
    expect(probe.sampleVideoAt(asVideo(item), 500, 500)).toEqual({ rgb: [0, 0, 0], alpha: 0 });
    off();
  });

  it("remembers a poster that failed to load", async () => {
    const { probe } = await load();
    const item = video({ poster: "https://site.test/missing.png" });
    probe.sampleVideoAt(asVideo(item), 5, 5);
    images[0].onerror?.();

    expect(probe.sampleVideoAt(asVideo(item), 5, 5)).toBeNull();
    expect(images).toHaveLength(1);
  });

  it("remembers a poster that could not be drawn", async () => {
    const { probe } = await load();
    drawThrows = true;
    const item = video({ poster: "https://site.test/tainted.png" });
    probe.sampleVideoAt(asVideo(item), 5, 5);
    images[0].onload?.();

    expect(probe.sampleVideoAt(asVideo(item), 5, 5)).toBeNull();
  });

  it("reads one frame of a same-origin video that has data", async () => {
    const { probe } = await load();
    const item = video({
      currentSrc: "https://site.test/v.mp4",
      readyState: 4,
      videoWidth: 160,
      videoHeight: 90,
    });

    expect(probe.sampleVideoAt(asVideo(item), 50, 50)).toEqual({ rgb: [200, 100, 50], alpha: 1 });
    expect(drawn[0]).toEqual({ w: 48, h: 27 });
    expect(probe.sampleVideoAt(asVideo(item), 50, 50)).not.toBeNull();
    expect(drawn).toHaveLength(1);
  });

  it("gives up on a video it cannot read", async () => {
    const { probe } = await load();

    expect(
      probe.sampleVideoAt(
        asVideo(video({ currentSrc: "https://other.test/v.mp4", readyState: 4, videoWidth: 1 })),
        5,
        5,
      ),
    ).toBeNull();
    expect(
      probe.sampleVideoAt(
        asVideo(video({ currentSrc: "https://site.test/v.mp4", readyState: 1, videoWidth: 1 })),
        5,
        5,
      ),
    ).toBeNull();
    expect(
      probe.sampleVideoAt(
        asVideo(video({ currentSrc: "https://site.test/v.mp4", readyState: 4, videoWidth: 0 })),
        5,
        5,
      ),
    ).toBeNull();
    expect(
      probe.sampleVideoAt(asVideo(video({ src: "https://site.test/w.mp4" })), 5, 5),
    ).toBeNull();
  });

  it("is see-through outside a frame and null when the frame cannot be drawn", async () => {
    const { probe } = await load();
    const item = video(
      { currentSrc: "https://site.test/f.mp4", readyState: 4, videoWidth: 100, videoHeight: 50 },
      { objectFit: "contain", objectPosition: "left top" },
    );
    expect(probe.sampleVideoAt(asVideo(item), 10, 90)).toEqual({ rgb: [0, 0, 0], alpha: 0 });

    drawThrows = true;
    const broken = video({
      currentSrc: "https://site.test/g.mp4",
      readyState: 4,
      videoWidth: 100,
      videoHeight: 100,
    });
    expect(probe.sampleVideoAt(asVideo(broken), 50, 50)).toBeNull();
  });

  it("marks a video unknown in the stack unless a same-origin poster is still loading", async () => {
    const { probe } = await load();
    stack = [video({ currentSrc: "https://other.test/v.mp4", readyState: 4 })];
    expect(probe.probePoint(5, 5, noSkip, base)).toMatchObject({ unknown: true });

    stack = [video({ poster: "https://other.test/p.png" })];
    expect(probe.probePoint(5, 5, noSkip, base)).toMatchObject({ unknown: true });

    stack = [
      video({ poster: "https://site.test/pending.png" }),
      el(new FakeElement(), { backgroundColor: "rgb(8, 8, 8)" }),
    ];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([8, 8, 8]);

    stack = [video(), el(new FakeElement(), { backgroundColor: "rgb(6, 6, 6)" })];
    expect(probe.probePoint(5, 5, noSkip, base).color).toEqual([6, 6, 6]);
  });
});

describe("hidden pictures under the first element", () => {
  function card(descendants: FakeElement[], box: Partial<Box> = { width: 200, height: 200 }) {
    const element = el(new FakeElement(), {}, box);
    element.descendants = descendants;
    return element;
  }

  it("reads a picture that hit testing cannot see", async () => {
    const { probe } = await load();
    const hiddenImage = image({ currentSrc: "https://site.test/hidden.png" }, { opacity: "1" });
    stack = [card([hiddenImage])];

    expect(probe.probePoint(50, 50, noSkip, base)).toEqual({ color: [200, 100, 50], media: true });
  });

  it("skips see-through copies, pictures elsewhere, and pictures it cannot read", async () => {
    const { probe } = await load();
    const faded = image({ currentSrc: "https://site.test/faded.png" }, { opacity: "0.2" });
    const away = image(
      { currentSrc: "https://site.test/away.png" },
      { opacity: "1" },
      { left: 500 },
    );
    const foreign = image({ currentSrc: "https://other.test/f.png" }, { opacity: "1" });
    stack = [card([faded, away, foreign])];

    expect(probe.probePoint(50, 50, noSkip, base)).toEqual({ color: base, media: false });
  });

  it("reads a hidden video too", async () => {
    const { probe } = await load();
    const item = Object.assign(el(new FakeVideo(), { opacity: "1" }), {
      currentSrc: "https://site.test/h.mp4",
      readyState: 4,
      videoWidth: 50,
      videoHeight: 50,
    });
    stack = [card([item])];

    expect(probe.probePoint(50, 50, noSkip, base).media).toBe(true);
  });

  it("stops at an opaque hidden picture", async () => {
    const { probe } = await load();
    pixelData = [1, 2, 3, 255];
    stack = [
      card([image({ currentSrc: "https://site.test/o.png" }, { opacity: "1" })]),
      el(new FakeElement(), { backgroundColor: "rgb(9, 9, 9)" }),
    ];

    expect(probe.probePoint(50, 50, noSkip, base).color).toEqual([1, 2, 3]);
  });

  it("does not search the body, page sized wrappers, or crowded subtrees", async () => {
    const { probe } = await load();
    const hiddenImage = image({ currentSrc: "https://site.test/p.png" }, { opacity: "1" });

    stack = [Object.assign(body, { descendants: [hiddenImage] })];
    expect(probe.probePoint(50, 50, noSkip, base).media).toBe(false);

    stack = [card([hiddenImage], { width: 2000, height: 1000 })];
    expect(probe.probePoint(50, 50, noSkip, base).media).toBe(false);

    const crowd = Array.from({ length: 17 }, () => hiddenImage);
    stack = [card(crowd)];
    expect(probe.probePoint(50, 50, noSkip, base).media).toBe(false);

    stack = [card([])];
    expect(probe.probePoint(50, 50, noSkip, base).media).toBe(false);

    stack = [Object.assign(html, { descendants: [hiddenImage] })];
    expect(probe.probePoint(50, 50, noSkip, base).media).toBe(false);
  });
});
