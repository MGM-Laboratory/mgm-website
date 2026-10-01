/**
 * The card box's dieline for the site loader, as data (loader-view.tsx draws
 * it, loader-show.ts folds it).
 *
 * Units are the pixels of the owner's wrap artwork (`~/tmp/cards/packaging.svg`,
 * 1376 units = 63.5 mm), with the origin at the front panel's top left corner,
 * x to the right and y down. The net is a reverse tuck end box: the four
 * walls in a row (front, side, back, side) with a glue flap, the lid and its
 * tuck flap on the back's top edge, the bottom and its tuck flap on the
 * front's bottom edge, and a dust flap above and below each side.
 *
 * Every number here is static, so the server render and the first client
 * render are the same markup (no hydration mismatch).
 */

/** Panel sizes: walls W x H, depth D, tuck flap T, glue flap G, dust flap F. */
export const BOX = { W: 1376, H: 1945, D: 446, T: 228, G: 260, F: 300 } as const;

const { W, H, D, T, G, F } = BOX;
/** The tuck flaps' rounded corners. */
const TUCK_R = 110;
/** Dust flap chamfers: the long one on the outside, the short one on the lid side. */
const CH_OUT = 70;
const CH_IN = 30;
/** Folded flaps sit this far inside the walls, so no two faces share a plane. */
export const INSET = 3;

const XA = W;
const XB = W + D;
const XC = 2 * W + D;
const XD = 2 * W + 2 * D;
const XE = XD + G;

/** The drawing sheet around the net: margins for the dimensions and the marks. */
export const SHEET = { x0: -170, y0: -840, width: 4300, height: 3630 } as const;

export type Pt = readonly [number, number];

/** A four-point star (the card back's compass star, inner radius 0.314 of the outer one). */
export function starPoints(cx: number, cy: number, r: number, ratio = 0.314): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * ratio;
    points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return points;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

export function polyPath(points: readonly Pt[], close = true) {
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`).join("");
  return close ? `${d}Z` : d;
}

function circlePath(cx: number, cy: number, r: number) {
  return `M${round(cx - r)} ${round(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

function framePath(x: number, y: number, w: number, h: number, inset: number) {
  return polyPath([
    [x + inset, y + inset],
    [x + w - inset, y + inset],
    [x + w - inset, y + h - inset],
    [x + inset, y + h - inset],
  ]);
}

/**
 * The printed linework, white on the box blue. The front (also used for the
 * back) and the side are the owner's artwork, coordinates rounded to whole
 * units; the closures are drawn here in the same language.
 */
export const ART = {
  front:
    "M33 23H1341a10 10 0 0 1 10 10V1910a10 10 0 0 1 -10 10H33a10 10 0 0 1 -10 -10V33a10 10 0 0 1 10 -10ZM80 62H1294a5 5 0 0 1 5 5V1876a5 5 0 0 1 -5 5H80a5 5 0 0 1 -5 -5V67a5 5 0 0 1 5 -5ZM813 1545L1118 1709V232L812 391M560 1545L254 1709V232L560 391M802 1506L1082 1655V284L804 430M572 1506L288 1655V284L572 435M1046 1606V337L688 538L325 337V1606L689 1399L1046 1606ZM560 1559a127 127 0 1 0 254 0a127 127 0 1 0 -254 0M560 380a127 127 0 1 0 254 0a127 127 0 1 0 -254 0M687 1451L711 1535L795 1559L711 1583L687 1667L663 1583L579 1559L663 1535L687 1451ZM443 742L480 736L509 758L503 722L525 693L489 699L460 676L466 713L443 742ZM403 556L436 539L471 552L454 519L467 485L434 501L400 488L416 521L403 556ZM480 626L513 610L547 623L531 590L544 556L511 572L477 559L493 592L480 626ZM531 690L568 685L597 707L591 671L642 631L577 647L548 625L554 661L531 690ZM935 742L899 736L870 758L876 722L854 693L890 699L919 676L913 713L935 742ZM976 556L943 539L908 552L925 519L912 485L945 501L979 488L963 521L976 556ZM899 626L866 610L831 623L848 590L835 556L868 572L902 559L886 592L899 626ZM847 690L811 685L782 707L788 671L736 631L802 647L831 625L825 661L847 690ZM688 678L702 644L736 631L702 617L688 583L675 617L641 631L675 644L688 678ZM442 1187L479 1193L508 1170L502 1207L524 1236L488 1230L459 1252L465 1216L442 1187ZM402 1373L435 1389L470 1376L453 1409L466 1444L433 1427L399 1440L415 1407L402 1373ZM479 1302L512 1319L546 1306L530 1339L543 1373L510 1357L476 1370L492 1337L479 1302ZM530 1238L567 1244L596 1222L590 1258L641 1298L576 1281L547 1303L553 1267L530 1238ZM934 1187L898 1193L869 1170L875 1207L853 1236L889 1230L918 1252L912 1216L934 1187ZM975 1373L942 1389L907 1376L924 1409L911 1444L944 1427L978 1440L962 1407L975 1373ZM898 1302L865 1319L830 1306L847 1339L834 1373L867 1357L901 1370L885 1337L898 1302ZM846 1238L810 1244L781 1222L787 1258L735 1298L801 1281L830 1303L824 1267L846 1238ZM687 1250L701 1284L735 1298L701 1311L687 1345L674 1311L640 1298L674 1284L687 1250ZM686 273L710 357L794 380L710 404L686 488L663 404L579 380L663 357L686 273ZM125 1627L161 1740L125 1817M125 1439L161 1552L125 1629M125 1251L161 1364L125 1441M125 1063L161 1175L125 1253M125 875L161 987L125 1065M125 687L161 799L125 877M125 499L161 611L125 689M125 311L161 423L125 501M125 123L161 235L125 313M1249 1627L1213 1740L1249 1817M1249 1439L1213 1552L1249 1629M1249 1251L1213 1364L1249 1441M1249 1063L1213 1175L1249 1253M1249 875L1213 987L1249 1065M1249 687L1213 799L1249 877M1249 499L1213 611L1249 689M1249 311L1213 423L1249 501M1249 123L1213 235L1249 313M125 123L261 151L354 123M351 123L486 151L578 123M575 123L711 151L804 123M801 123L935 151L1027 123M1020 123L1156 151L1249 123M125 1817L261 1788L354 1817M351 1817L486 1788L578 1817M575 1817L711 1788L804 1817M801 1817L935 1788L1027 1817M1020 1817L1156 1788L1249 1817M163 1606L197 1715L163 1790M163 1425L197 1534L163 1609M163 1243L197 1352L163 1427M163 1061L197 1170L163 1245M163 880L197 989L163 1063M163 698L197 807L163 882M163 516L197 625L163 700M163 334L197 443L163 518M163 153L197 262L163 337M1208 1606L1175 1715L1208 1790M1208 1425L1175 1534L1208 1609M1208 1243L1175 1352L1208 1427M1208 1061L1175 1170L1208 1245M1208 880L1175 989L1208 1063M1208 698L1175 807L1208 882M1208 516L1175 625L1208 700M1208 334L1175 443L1208 518M1208 153L1175 262L1208 337M163 153L289 180L376 153M374 153L498 180L584 153M582 153L708 180L794 153M792 153L917 180L1002 153M996 153L1122 180L1208 153M163 1790L289 1763L376 1790M374 1790L498 1763L584 1790M582 1790L708 1763L794 1790M792 1790L917 1763L1002 1790M996 1790L1122 1763L1208 1790M688 678L687 1251M938 744V1185M441 744V1185M508 759V1169M870 760V1170M782 708V1223M596 707V1222M402 558V1371M367 417V1534M1011 417V1534M976 557V1371",
  /** The side panel (448 x 1945 in the artwork): a line, a circle and the star. */
  side: `M226 111V854M226 1092V1835${circlePath(225, 973, 119)}${polyPath(starPoints(225, 973, 101))}`,
  /** The lid: a frame, the star in a circle and a line of small stars. */
  lid: `${framePath(0, 0, W, D, 40)}${circlePath(W / 2, D / 2, 120)}${polyPath(starPoints(W / 2, D / 2, 100))}M120 ${D / 2}H${W / 2 - 150}M${W / 2 + 150} ${D / 2}H${W - 120}${polyPath(starPoints(330, D / 2, 34))}${polyPath(starPoints(W - 330, D / 2, 34))}`,
  tuck: `${polyPath(starPoints(W / 2, T / 2 + 6, 62))}M${W / 2 - 340} ${T / 2 + 6}H${W / 2 - 110}M${W / 2 + 110} ${T / 2 + 6}H${W / 2 + 340}`,
  bottom: `${framePath(0, 0, W, D, 40)}${polyPath(starPoints(W / 2, D / 2, 88))}M140 ${D / 2}H${W / 2 - 130}M${W / 2 + 130} ${D / 2}H${W - 140}${polyPath(starPoints(260, D / 2, 30))}${polyPath(starPoints(W - 260, D / 2, 30))}`,
  dust: polyPath(starPoints(D / 2, F / 2, 46)),
  glue: `M${G / 2} 160V${H - 160}`,
} as const;

/** The artwork's own size for each print, so its viewBox maps onto the panel. */
export const ART_BOX: Record<keyof typeof ART, readonly [number, number]> = {
  front: [1374, 1945],
  side: [448, 1945],
  lid: [W, D],
  tuck: [W, T],
  bottom: [W, D],
  dust: [D, F],
  glue: [G, H],
};

export type PanelId =
  | "front"
  | "sideA"
  | "back"
  | "sideB"
  | "glue"
  | "lid"
  | "tuck"
  | "dustAt"
  | "dustAb"
  | "dustBt"
  | "dustBb"
  | "bottom"
  | "btuck";

export type NetPanel = Readonly<{
  id: PanelId;
  parent: PanelId | null;
  /** Top left corner in the parent panel's frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The hinge, as a CSS transform-origin. */
  origin: string;
  /** The folded transform, about the hinge. */
  fold: string;
  art: keyof typeof ART;
  /** Which quarter of the deal prints it (1 to 4). */
  print: 1 | 2 | 3 | 4;
  /** The face's outline when it is not a rectangle (CSS clip-path or border-radius). */
  clip?: string;
  radius?: string;
  /** How much the folded face darkens (sides) or lightens (top), for a little light. */
  shade: number;
  /** Fold order in the outro (0 first). */
  order: number;
}>;

function pct(points: readonly Pt[], w: number, h: number) {
  return `polygon(${points.map(([x, y]) => `${round((x / w) * 100)}% ${round((y / h) * 100)}%`).join(", ")})`;
}

/** Parent first, so a loop can attach each panel to one made before it. */
export const PANELS: readonly NetPanel[] = [
  {
    id: "front",
    parent: null,
    x: 0,
    y: 0,
    w: W,
    h: H,
    origin: "50% 50%",
    fold: "none",
    art: "front",
    print: 1,
    shade: 0,
    order: 0,
  },
  {
    id: "sideA",
    parent: "front",
    x: W,
    y: 0,
    w: D,
    h: H,
    origin: "0 50%",
    fold: "rotateY(90deg)",
    art: "side",
    print: 2,
    shade: -0.16,
    order: 0,
  },
  {
    id: "back",
    parent: "sideA",
    x: D,
    y: 0,
    w: W,
    h: H,
    origin: "0 50%",
    fold: "rotateY(90deg)",
    art: "front",
    print: 3,
    shade: -0.3,
    order: 1,
  },
  {
    id: "sideB",
    parent: "back",
    x: W,
    y: 0,
    w: D,
    h: H,
    origin: "0 50%",
    fold: "rotateY(90deg)",
    art: "side",
    print: 4,
    shade: -0.16,
    order: 2,
  },
  {
    id: "glue",
    parent: "sideB",
    // The hinge sits a hair inside the side, so the glued flap lies behind the front.
    x: D - INSET,
    y: 0,
    w: G,
    h: H,
    origin: "0 50%",
    fold: "rotateY(90deg)",
    art: "glue",
    print: 4,
    clip: pct(
      [
        [0, 0],
        [G, 120],
        [G, H - 120],
        [0, H],
      ],
      G,
      H,
    ),
    shade: -0.4,
    order: 3,
  },
  {
    id: "dustAb",
    parent: "sideA",
    x: 0,
    y: H - INSET,
    w: D,
    h: F,
    origin: "50% 0",
    fold: "rotateX(-90deg)",
    art: "dust",
    print: 2,
    clip: pct(
      [
        [0, 0],
        [D, 0],
        [D, F - CH_IN],
        [D - CH_IN, F],
        [CH_OUT, F],
        [0, F - CH_OUT],
      ],
      D,
      F,
    ),
    shade: -0.36,
    order: 4,
  },
  {
    id: "dustBb",
    parent: "sideB",
    x: 0,
    y: H - INSET,
    w: D,
    h: F,
    origin: "50% 0",
    fold: "rotateX(-90deg)",
    art: "dust",
    print: 4,
    clip: pct(
      [
        [0, 0],
        [D, 0],
        [D, F - CH_OUT],
        [D - CH_OUT, F],
        [CH_IN, F],
        [0, F - CH_IN],
      ],
      D,
      F,
    ),
    shade: -0.36,
    order: 4,
  },
  {
    id: "bottom",
    parent: "front",
    x: 0,
    y: H,
    w: W,
    h: D,
    origin: "50% 0",
    fold: "rotateX(-90deg)",
    art: "bottom",
    print: 1,
    shade: -0.42,
    order: 5,
  },
  {
    id: "btuck",
    parent: "bottom",
    x: 0,
    y: D - INSET,
    w: W,
    h: T,
    origin: "50% 0",
    fold: "rotateX(-90deg)",
    art: "tuck",
    print: 1,
    radius: `0 0 ${round((TUCK_R / W) * 100)}% ${round((TUCK_R / W) * 100)}% / 0 0 ${round((TUCK_R / T) * 100)}% ${round((TUCK_R / T) * 100)}%`,
    shade: -0.3,
    order: 6,
  },
  {
    id: "dustAt",
    parent: "sideA",
    x: 0,
    y: -F + INSET,
    w: D,
    h: F,
    origin: "50% 100%",
    fold: "rotateX(90deg)",
    art: "dust",
    print: 2,
    clip: pct(
      [
        [0, F],
        [0, CH_OUT],
        [CH_OUT, 0],
        [D - CH_IN, 0],
        [D, CH_IN],
        [D, F],
      ],
      D,
      F,
    ),
    shade: 0.1,
    order: 7,
  },
  {
    id: "dustBt",
    parent: "sideB",
    x: 0,
    y: -F + INSET,
    w: D,
    h: F,
    origin: "50% 100%",
    fold: "rotateX(90deg)",
    art: "dust",
    print: 4,
    clip: pct(
      [
        [0, F],
        [0, CH_IN],
        [CH_IN, 0],
        [D - CH_OUT, 0],
        [D, CH_OUT],
        [D, F],
      ],
      D,
      F,
    ),
    shade: 0.1,
    order: 7,
  },
  {
    id: "lid",
    parent: "back",
    x: 0,
    y: -D,
    w: W,
    h: D,
    origin: "50% 100%",
    fold: "rotateX(90deg)",
    art: "lid",
    print: 3,
    shade: 0.14,
    order: 8,
  },
  {
    id: "tuck",
    parent: "lid",
    x: 0,
    y: -T + INSET,
    w: W,
    h: T,
    origin: "50% 100%",
    fold: "rotateX(90deg)",
    art: "tuck",
    print: 3,
    radius: `${round((TUCK_R / W) * 100)}% ${round((TUCK_R / W) * 100)}% 0 0 / ${round((TUCK_R / T) * 100)}% ${round((TUCK_R / T) * 100)}% 0 0`,
    shade: -0.2,
    order: 9,
  },
];

export type Segment = Readonly<{ a: Pt; b: Pt }>;

/**
 * The cut line, clockwise from the front panel's top left corner, as the
 * pen traces it. Arcs are flattened into short segments (the pen follows
 * them; the drawing shows them as quarter circles).
 */
const CONTOUR: readonly Pt[] = [
  [0, 0],
  [XA, 0],
  [XA, -F + CH_OUT],
  [XA + CH_OUT, -F],
  [XB - CH_IN, -F],
  [XB, -F + CH_IN],
  [XB, -D - T + TUCK_R],
  [XB + TUCK_R, -D - T],
  [XC - TUCK_R, -D - T],
  [XC, -D - T + TUCK_R],
  [XC, -F + CH_IN],
  [XC + CH_IN, -F],
  [XD - CH_OUT, -F],
  [XD, -F + CH_OUT],
  [XD, 0],
  [XE, 120],
  [XE, H - 120],
  [XD, H],
  [XD, H + F - CH_OUT],
  [XD - CH_OUT, H + F],
  [XC + CH_IN, H + F],
  [XC, H + F - CH_IN],
  [XC, H],
  [XB, H],
  [XB, H + F - CH_IN],
  [XB - CH_IN, H + F],
  [XA + CH_OUT, H + F],
  [XA, H + F - CH_OUT],
  [XA, H + D + T - TUCK_R],
  [XA - TUCK_R, H + D + T],
  [TUCK_R, H + D + T],
  [0, H + D + T - TUCK_R],
  [0, 0],
];

/** Indices into CONTOUR whose segment is a tuck flap's rounded corner. */
const ARC_SEGMENTS = new Set([6, 8, 28, 30]);

export type Arc = Readonly<{ cx: number; cy: number; corner: "tl" | "tr" | "bl" | "br" }>;

/** The four rounded corners, as the circle centre and which corner it rounds. */
export const ARCS: readonly (Arc & { segment: number })[] = [
  { cx: XB + TUCK_R, cy: -D - T + TUCK_R, corner: "tl", segment: 6 },
  { cx: XC - TUCK_R, cy: -D - T + TUCK_R, corner: "tr", segment: 8 },
  { cx: XA - TUCK_R, cy: H + D + T - TUCK_R, corner: "br", segment: 28 },
  { cx: TUCK_R, cy: H + D + T - TUCK_R, corner: "bl", segment: 30 },
];
export const ARC_RADIUS = TUCK_R;

export type Stroke = Readonly<{
  a: Pt;
  b: Pt;
  length: number;
  /** Degrees, for a line drawn along +x and rotated. */
  angle: number;
  /** Start and duration as fractions of the pen's trace (cuts) or of the fold pass (folds). */
  at: number;
  span: number;
}>;

function strokesOf(segments: readonly Segment[]): Stroke[] {
  const total = segments.reduce((sum, { a, b }) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
  let run = 0;
  return segments.map(({ a, b }) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const stroke: Stroke = {
      a,
      b,
      length,
      angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
      at: run / total,
      span: length / total,
    };
    run += length;
    return stroke;
  });
}

const contourSegments: Segment[] = CONTOUR.slice(1).map((b, i) => ({ a: CONTOUR.at(i) ?? b, b }));

const contourStrokes = strokesOf(contourSegments);

/** The cut line's straight strokes, in the pen's order (arcs are drawn by `ARCS`). */
export const CUTS: readonly Stroke[] = contourStrokes.filter((_, i) => !ARC_SEGMENTS.has(i));

/** Where the pen reaches each arc (fraction of the trace), keyed by segment index. */
export const ARC_TIMES: ReadonlyMap<number, { at: number; span: number }> = new Map(
  [...ARC_SEGMENTS].map((i) => {
    const stroke = contourStrokes.at(i);
    return [i, { at: stroke?.at ?? 0, span: stroke?.span ?? 0 }];
  }),
);

/** The pen's path: every contour vertex with the fraction of the trace where it gets there. */
export const PEN_PATH: readonly { p: Pt; at: number }[] = CONTOUR.map((p, i) => {
  const before = i > 0 ? contourStrokes.at(i - 1) : undefined;
  return { p, at: before ? before.at + before.span : 0 };
});

/** The slits between the closures and the dust flaps (cut, drawn after the trace). */
export const SLITS: readonly Stroke[] = strokesOf([
  { a: [XB, 0], b: [XB, -F + CH_IN] },
  { a: [XC, 0], b: [XC, -F + CH_IN] },
  { a: [XA, H], b: [XA, H + F - CH_OUT] },
]);

/** Fold lines (dashed), in drawing order. */
export const FOLDS: readonly Stroke[] = strokesOf([
  { a: [XA, 0], b: [XA, H] },
  { a: [XB, 0], b: [XB, H] },
  { a: [XC, 0], b: [XC, H] },
  { a: [XD, 0], b: [XD, H] },
  { a: [XB, 0], b: [XC, 0] },
  { a: [XB, -D], b: [XC, -D] },
  { a: [XA, 0], b: [XB, 0] },
  { a: [XC, 0], b: [XD, 0] },
  { a: [0, H], b: [XA, H] },
  { a: [0, H + D], b: [XA, H + D] },
  { a: [XA, H], b: [XB, H] },
  { a: [XC, H], b: [XD, H] },
]);

export type Dimension = Readonly<{
  a: Pt;
  b: Pt;
  label: string;
  /** Which side of the line the label sits on. */
  side: "above" | "below" | "right";
}>;

/** Dimension lines, in millimetres like a real drawing. */
export const DIMENSIONS: readonly Dimension[] = [
  { a: [0, -200], b: [W, -200], label: "63.5", side: "above" },
  { a: [XD + G + 150, 0], b: [XD + G + 150, H], label: "89.6", side: "right" },
  { a: [XC, H + F + 190], b: [XD, H + F + 190], label: "20.6", side: "below" },
];

/** The title block under the back panel, and the registration marks at the sheet's corners. */
export const TITLE_BLOCK = { x: XB + 130, y: H + 170, w: W - 260, h: 420 } as const;

export const MARKS: readonly Pt[] = [
  [SHEET.x0 + 90, SHEET.y0 + 90],
  [SHEET.x0 + SHEET.width - 90, SHEET.y0 + 90],
  [SHEET.x0 + 90, SHEET.y0 + SHEET.height - 90],
  [SHEET.x0 + SHEET.width - 90, SHEET.y0 + SHEET.height - 90],
];

/** The colour bar of a print proof, one swatch per quarter of the deal plus ink. */
export const SWATCHES = {
  x: 40,
  y: H + D + T + 120,
  size: 74,
  gap: 26,
} as const;

/** The front panel's centre on the sheet (where dealt cards leave from). */
export const FRONT_CENTRE: Pt = [W / 2, H / 2];

/** The sheet's own centre (where the star waits on the first frame). */
export const SHEET_CENTRE: Pt = [SHEET.x0 + SHEET.width / 2, SHEET.y0 + SHEET.height / 2];

/** When the first frame's drawing happens, in seconds after the first paint. */
export const DRAW = {
  /** The star waits at the sheet's centre, then darts to the first corner. */
  penMove: 0.18,
  traceStart: 0.32,
  trace: 1.0,
  /** The pen's whole animation (it vanishes into the last corner). */
  pen: 1.5,
  folds: 0.7,
  foldStep: 0.045,
  foldDraw: 0.32,
  slits: 1.3,
  marks: 1.08,
  dims: 1.16,
  title: 1.3,
  swatches: 1.24,
  /** Everything is on the sheet. */
  done: 1.62,
  /** The star reappears at the hub. */
  hubStar: 1.36,
} as const;

export type ToyKind =
  "circle" | "half" | "triangle" | "plus" | "ring" | "leaf" | "cross" | "square" | "star";

export type Toy = Readonly<{
  kind: ToyKind;
  colour: string;
  /** Position (% of the screen) on landscape screens, portrait screens and short landscape ones. */
  at: readonly [number, number];
  portrait: readonly [number, number];
  short: readonly [number, number];
  size: number;
  drift: readonly [number, number, number];
  /** Shown on wide screens only. */
  wide?: boolean;
}>;

export const TOYS: readonly Toy[] = [
  {
    kind: "circle",
    colour: "var(--brand-yellow)",
    at: [9, 24],
    portrait: [13, 53],
    short: [62, 16],
    size: 46,
    drift: [6, -10, 0],
  },
  {
    kind: "half",
    colour: "var(--brand-red)",
    at: [16, 58],
    portrait: [85, 57],
    short: [95, 34],
    size: 42,
    drift: [-8, 6, 14],
  },
  {
    kind: "triangle",
    colour: "var(--brand-blue)",
    at: [7, 82],
    portrait: [7, 82],
    short: [60, 90],
    size: 36,
    drift: [5, -6, -10],
    wide: true,
  },
  {
    kind: "plus",
    colour: "var(--brand-green)",
    at: [21, 85],
    portrait: [10, 90],
    short: [60, 86],
    size: 30,
    drift: [-5, -7, 45],
  },
  {
    kind: "ring",
    colour: "var(--brand-blue)",
    at: [90, 20],
    portrait: [88, 91],
    short: [94, 84],
    size: 40,
    drift: [-6, 8, 0],
  },
  {
    kind: "leaf",
    colour: "var(--brand-green)",
    at: [84, 50],
    portrait: [70, 49],
    short: [88, 13],
    size: 36,
    drift: [7, 5, -18],
  },
  {
    kind: "cross",
    colour: "var(--ld-ink)",
    at: [93, 72],
    portrait: [87, 5],
    short: [59, 52],
    size: 26,
    drift: [-4, -6, 30],
  },
  {
    kind: "square",
    colour: "var(--brand-red)",
    at: [80, 86],
    portrait: [80, 86],
    short: [96, 60],
    size: 28,
    drift: [6, -5, 20],
    wide: true,
  },
  {
    kind: "star",
    colour: "var(--brand-yellow)",
    at: [14, 40],
    portrait: [12, 5],
    short: [73, 10],
    size: 24,
    drift: [4, 6, 40],
  },
];

const BAR_SLOTS = 16;

/** The reduced motion bar, `[======----------] 18 / 52`. */
export function barText(cards: number) {
  const filled = Math.round((cards / 52) * BAR_SLOTS);
  return `[${"=".repeat(filled)}${"-".repeat(BAR_SLOTS - filled)}]  ${String(cards).padStart(2, "0")} / 52`;
}
