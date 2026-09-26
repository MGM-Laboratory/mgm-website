"use client";

import { Check, Eye, EyeSlash } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";

import {
  FORM_PATTERNS,
  type FormDesign,
  type FormDocument,
  type FormPattern,
  type ProjectThemeId,
} from "@repo/shared";

import { ThemePicker } from "@/components/admin/project-editor/theme-picker";
import { projectThemeId } from "@/lib/project-cms";

import { MediaPicker } from "./media-picker";
import { PreviewFrame, PreviewToolbar } from "./preview-frame";
import type { PreviewDevice, PreviewStage, TabProps } from "./types";
import {
  Section,
  Segmented,
  Switch,
  cardClass,
  eyebrowClass,
  secondaryButtonClass,
  type ButtonRefs,
} from "./ui";

type Tile<T extends string> = { value: T; label: string; hint?: string; visual?: React.ReactNode };

/** A radio group of illustrated tiles (arrow keys move the choice). */
function TileGroup<T extends string>({
  columns = "grid-cols-2 sm:grid-cols-3",
  disabled,
  label,
  onChange,
  tiles,
  value,
}: {
  columns?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: T) => void;
  tiles: Tile<T>[];
  value: T;
}) {
  const refs = useRef<ButtonRefs>(new Map());
  const labelId = useId();
  const index = Math.max(
    0,
    tiles.findIndex((tile) => tile.value === value),
  );
  const move = (next: number) => {
    const target = (next + tiles.length) % tiles.length;
    const tile = tiles.at(target);
    if (!tile) return;
    onChange(tile.value);
    refs.current.get(target)?.focus();
  };
  return (
    <div>
      <p className={`${eyebrowClass} mb-2`} id={labelId}>
        {label}
      </p>
      <div
        aria-labelledby={labelId}
        className={`grid gap-2 ${columns}`}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            move(index + 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            move(index - 1);
          }
        }}
        role="radiogroup"
      >
        {tiles.map((tile, position) => {
          const selected = tile.value === value;
          return (
            <button
              aria-checked={selected}
              className={`group relative flex min-w-0 flex-col gap-1.5 rounded-xl p-2 text-left transition focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "bg-brand-blue-50 ring-2 ring-brand-blue dark:bg-brand-blue/15" : "ring-1 ring-[#dfe4ee] hover:bg-[#f5f7fb] hover:ring-brand-blue/40 dark:ring-white/10 dark:hover:bg-white/[0.05]"}`}
              disabled={disabled}
              key={tile.value}
              onClick={() => {
                onChange(tile.value);
              }}
              ref={(element) => {
                refs.current.set(position, element);
              }}
              role="radio"
              tabIndex={selected ? 0 : -1}
              title={tile.hint}
              type="button"
            >
              {tile.visual ? (
                <span className="block overflow-hidden rounded-lg bg-white text-[#5d687d] ring-1 ring-black/[0.05] dark:bg-white/[0.04] dark:text-white/55 dark:ring-white/10">
                  {tile.visual}
                </span>
              ) : null}
              <span className="truncate px-0.5 text-[12px] font-semibold text-[#3c4659] dark:text-white/80">
                {tile.label}
              </span>
              {tile.hint ? (
                <span className="-mt-1 line-clamp-2 px-0.5 text-[10px] leading-4 text-[#8490a5] dark:text-white/40">
                  {tile.hint}
                </span>
              ) : null}
              {selected ? (
                <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-brand-blue text-white shadow">
                  <Check size={9} weight="bold" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Range({
  disabled,
  label,
  max,
  onChange,
  suffix = "%",
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className={eyebrowClass} htmlFor={id}>
          {label}
        </label>
        <span className="font-mono text-[11px] font-bold tabular-nums text-[#5d687d] dark:text-white/55">
          {value}
          {suffix}
        </span>
      </div>
      <input
        className="w-full accent-[var(--brand-blue)]"
        disabled={disabled}
        id={id}
        max={max}
        min={0}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        step={1}
        type="range"
        value={value}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Illustrations (small inline SVG, currentColor + brand tokens)
// ---------------------------------------------------------------------------

const svg = "block h-14 w-full";

const layoutVisuals = {
  classic: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      {[10, 24, 38].map((y) => (
        <g key={y}>
          <rect fill="currentColor" height="3" opacity="0.5" rx="1.5" width="30" x="20" y={y} />
          <rect
            fill="none"
            height="6"
            rx="2"
            stroke="currentColor"
            strokeOpacity="0.35"
            width="80"
            x="20"
            y={y + 5}
          />
        </g>
      ))}
    </svg>
  ),
  conversational: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect fill="currentColor" height="4" opacity="0.6" rx="2" width="60" x="30" y="16" />
      <rect
        fill="none"
        height="9"
        rx="3"
        stroke="currentColor"
        strokeOpacity="0.4"
        width="60"
        x="30"
        y="25"
      />
      <rect fill="var(--brand-blue)" height="6" rx="3" width="18" x="30" y="39" />
    </svg>
  ),
};

const coverVisuals: Record<FormDesign["cover"]["style"], React.ReactNode> = {
  none: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect fill="currentColor" height="3" opacity="0.5" rx="1.5" width="50" x="35" y="20" />
      <rect fill="currentColor" height="3" opacity="0.25" rx="1.5" width="40" x="40" y="28" />
    </svg>
  ),
  banner: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect fill="var(--brand-blue)" height="16" opacity="0.35" width="120" x="0" y="0" />
      <rect fill="currentColor" height="3" opacity="0.5" rx="1.5" width="50" x="35" y="26" />
      <rect fill="currentColor" height="3" opacity="0.25" rx="1.5" width="40" x="40" y="34" />
    </svg>
  ),
  hero: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect fill="var(--brand-blue)" height="56" opacity="0.3" width="120" x="0" y="0" />
      <rect fill="currentColor" height="4" opacity="0.7" rx="2" width="56" x="32" y="22" />
      <rect fill="currentColor" height="3" opacity="0.4" rx="1.5" width="40" x="40" y="30" />
    </svg>
  ),
  split: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect fill="var(--brand-blue)" height="56" opacity="0.3" width="56" x="64" y="0" />
      <rect fill="currentColor" height="4" opacity="0.6" rx="2" width="40" x="12" y="20" />
      <rect fill="currentColor" height="3" opacity="0.3" rx="1.5" width="32" x="12" y="28" />
    </svg>
  ),
};

const sceneVisuals: Record<FormDesign["background"]["scene"], React.ReactNode> = {
  orbit: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <ellipse
        cx="60"
        cy="28"
        fill="none"
        rx="40"
        ry="14"
        stroke="currentColor"
        strokeOpacity="0.35"
      />
      <ellipse
        cx="60"
        cy="28"
        fill="none"
        rx="24"
        ry="22"
        stroke="currentColor"
        strokeOpacity="0.25"
      />
      <circle cx="60" cy="28" fill="var(--brand-blue)" r="5" />
      <circle cx="98" cy="24" fill="var(--brand-yellow)" r="3" />
      <circle cx="46" cy="8" fill="var(--brand-red)" r="2.5" />
    </svg>
  ),
  constellation: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <polyline
        fill="none"
        points="14,40 36,18 58,30 80,12 104,26 90,46"
        stroke="currentColor"
        strokeOpacity="0.35"
      />
      {[
        [14, 40],
        [36, 18],
        [58, 30],
        [80, 12],
        [104, 26],
        [90, 46],
      ].map(([x, y]) => (
        <circle cx={x} cy={y} fill="var(--brand-blue)" key={`${x}-${y}`} r="2.5" />
      ))}
    </svg>
  ),
  paper: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="34"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.3"
        transform="rotate(-8 44 28)"
        width="30"
        x="28"
        y="11"
      />
      <rect
        fill="currentColor"
        fillOpacity="0.12"
        height="34"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.35"
        transform="rotate(6 70 28)"
        width="30"
        x="56"
        y="11"
      />
      <path
        d="M78 11 l8 8 h-8z"
        fill="var(--brand-yellow)"
        opacity="0.8"
        transform="rotate(6 70 28)"
      />
    </svg>
  ),
  blocks: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect fill="var(--brand-blue)" height="16" opacity="0.7" rx="2" width="16" x="38" y="30" />
      <rect fill="var(--brand-green)" height="16" opacity="0.7" rx="2" width="16" x="56" y="30" />
      <rect fill="var(--brand-yellow)" height="16" opacity="0.8" rx="2" width="16" x="47" y="12" />
      <rect fill="var(--brand-red)" height="12" opacity="0.7" rx="2" width="12" x="76" y="34" />
    </svg>
  ),
  none: (
    <svg aria-hidden="true" className={svg} viewBox="0 0 120 56">
      <rect
        fill="none"
        height="40"
        rx="4"
        stroke="currentColor"
        strokeDasharray="3 3"
        strokeOpacity="0.3"
        width="96"
        x="12"
        y="8"
      />
    </svg>
  ),
};

function FieldStyleVisual({ style }: { style: FormDesign["fieldStyle"] }) {
  return (
    <span className="flex h-12 items-center px-3">
      <span
        className={`block h-6 w-full ${style === "boxed" ? "rounded-md border border-current opacity-50" : style === "underline" ? "border-b-2 border-current opacity-50" : "rounded-md bg-current opacity-15"}`}
      />
    </span>
  );
}

function ButtonShapeVisual({ shape }: { shape: FormDesign["buttonShape"] }) {
  return (
    <span className="flex h-12 items-center justify-center">
      <span
        className={`block h-6 w-16 bg-brand-blue ${shape === "pill" ? "rounded-full" : shape === "rounded" ? "rounded-md" : "rounded-none"}`}
      />
    </span>
  );
}

function entranceHoverClass(entrance: FormDesign["motion"]["entrance"]) {
  switch (entrance) {
    case "rise":
      return "motion-safe:group-hover:animate-[builder-rise-in_700ms_ease-out_infinite]";
    case "pop":
      return "motion-safe:group-hover:animate-[builder-pop-in_600ms_ease-out_infinite]";
    case "slide":
      return "motion-safe:group-hover:animate-[builder-dialog-in_700ms_ease-out_infinite]";
    case "blur":
      return "motion-safe:group-hover:animate-[builder-fade-in_700ms_ease-out_infinite]";
    case "type":
      return "motion-safe:group-hover:animate-[builder-fade-in_500ms_steps(4)_infinite]";
  }
}

function EntranceVisual({ entrance }: { entrance: FormDesign["motion"]["entrance"] }) {
  // A dot that plays the entrance on hover, only when motion is allowed.
  const hover = entranceHoverClass(entrance);
  return (
    <span className="flex h-12 items-center justify-center">
      <span className={`block h-3 w-14 rounded-full bg-brand-blue/70 ${hover}`} />
    </span>
  );
}

const PATTERN_FILES = FORM_PATTERNS.filter(
  (name) => name !== "none" && name !== "mixed",
) as Exclude<FormPattern, "none" | "mixed">[];

function PatternVisual({ pattern }: { pattern: FormPattern }) {
  if (pattern === "none") {
    return <span className="block h-12" />;
  }
  if (pattern === "mixed") {
    return (
      <span className="grid h-12 grid-cols-2 grid-rows-2">
        {["arcs", "clover", "plus", "domes"].map((name) => (
          <span
            className="block bg-[length:24px_24px]"
            key={name}
            style={{ backgroundImage: `url(/patterns/${name}-blue-on-white.svg)` }}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      className="block h-12 bg-[length:28px_28px]"
      style={{ backgroundImage: `url(/patterns/${pattern}-blue-on-white.svg)` }}
    />
  );
}

const fontFaces: Record<
  FormDesign["font"],
  { name: string; className: string; style?: React.CSSProperties }
> = {
  hanken: { name: "Hanken Grotesk", className: "font-display" },
  geist: { name: "Geist", className: "font-sans" },
  fraunces: {
    name: "Fraunces",
    className: "",
    style: { fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif' },
  },
  mono: { name: "Geist Mono", className: "font-mono" },
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function DesignTab({
  change,
  document,
  previewDocument,
  readOnly,
  record,
  selection,
}: TabProps & { previewDocument: FormDocument | undefined }) {
  const design = document.design;
  const themeLabelId = useId();
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [scheme, setScheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const [stage, setStage] = useState<{ stage: PreviewStage; endingId?: string }>({
    stage: "welcome",
  });
  const [follow, setFollow] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const set = <K extends keyof FormDesign>(key: K, value: FormDesign[K]) => {
    change((doc) => ({ ...doc, design: { ...doc.design, [key]: value } }), `design.${String(key)}`);
  };
  const setCover = (patch: Partial<FormDesign["cover"]>, key: string) => {
    change(
      (doc) => ({ ...doc, design: { ...doc.design, cover: { ...doc.design.cover, ...patch } } }),
      `design.cover.${key}`,
    );
  };
  const setBackground = (patch: Partial<FormDesign["background"]>, key: string) => {
    change(
      (doc) => ({
        ...doc,
        design: { ...doc.design, background: { ...doc.design.background, ...patch } },
      }),
      `design.background.${key}`,
    );
  };
  const setMotion = (patch: Partial<FormDesign["motion"]>, key: string) => {
    change(
      (doc) => ({ ...doc, design: { ...doc.design, motion: { ...doc.design.motion, ...patch } } }),
      `design.motion.${key}`,
    );
  };

  const selectedField =
    selection && !selection.startsWith("ending:") && selection !== "welcome"
      ? selection
      : undefined;
  const focusFieldId = follow ? selectedField : undefined;
  const previewStage = follow && selectedField ? "form" : stage.stage;

  const preview = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PreviewToolbar
        device={device}
        endingId={stage.endingId}
        endings={document.endings}
        follow={follow}
        onDevice={setDevice}
        onFollow={setFollow}
        onScheme={setScheme}
        onStage={(next, endingId) => {
          setStage({ stage: next, endingId });
          setFollow(false);
        }}
        scheme={scheme}
        stage={previewStage}
      />
      <PreviewFrame
        className="min-h-[480px] flex-1"
        device={device}
        document={previewDocument}
        endingId={stage.endingId}
        focusFieldId={focusFieldId}
        onStage={(next) => {
          if (!follow) setStage((current) => ({ ...current, stage: next }));
        }}
        scheme={scheme}
        slug={record.slug}
        stage={previewStage}
      />
    </div>
  );

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className={`${cardClass} p-0`}>
          <Section title="Theme">
            <p className="sr-only" id={themeLabelId}>
              Theme
            </p>
            <ThemePicker
              columnsClassName="grid-cols-3 sm:grid-cols-4"
              labelId={themeLabelId}
              onChange={(theme?: ProjectThemeId) => {
                if (!readOnly) set("theme", theme ?? projectThemeId({ slug: record.slug }));
              }}
              slug={record.slug}
              value={design.theme}
            />
            <div>
              <p className={`${eyebrowClass} mb-2`}>Colour mode</p>
              <Segmented<FormDesign["colorMode"]>
                label="Colour mode"
                onChange={(value) => {
                  if (!readOnly) set("colorMode", value);
                }}
                options={[
                  { value: "auto", label: "Follow device" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                value={design.colorMode}
              />
            </div>
          </Section>
          <Section title="Typography">
            <TileGroup<FormDesign["font"]>
              columns="grid-cols-2"
              disabled={readOnly}
              label="Font"
              onChange={(value) => {
                set("font", value);
              }}
              tiles={(
                Object.entries(fontFaces) as [
                  FormDesign["font"],
                  (typeof fontFaces)[FormDesign["font"]],
                ][]
              ).map(([font, face]) => ({
                value: font,
                label: face.name,
                visual: (
                  <span
                    className={`flex h-12 items-center justify-center text-2xl font-semibold tracking-[-0.03em] text-[#171b25] dark:text-white ${face.className}`}
                    style={face.style}
                  >
                    Aa
                  </span>
                ),
              }))}
              value={design.font}
            />
          </Section>
          <Section title="Layout">
            <TileGroup<FormDesign["layout"]>
              columns="grid-cols-2"
              disabled={readOnly}
              label="Layout"
              onChange={(value) => {
                set("layout", value);
              }}
              tiles={[
                {
                  value: "classic",
                  label: "Classic",
                  hint: "Every question of a page at once",
                  visual: layoutVisuals.classic,
                },
                {
                  value: "conversational",
                  label: "Conversational",
                  hint: "One question per screen",
                  visual: layoutVisuals.conversational,
                },
              ]}
              value={design.layout}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className={`${eyebrowClass} mb-2`}>Alignment</p>
                <Segmented<FormDesign["align"]>
                  label="Alignment"
                  onChange={(value) => {
                    if (!readOnly) set("align", value);
                  }}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Center" },
                  ]}
                  value={design.align}
                />
              </div>
              <div>
                <p className={`${eyebrowClass} mb-2`}>Density</p>
                <Segmented<FormDesign["density"]>
                  label="Density"
                  onChange={(value) => {
                    if (!readOnly) set("density", value);
                  }}
                  options={[
                    { value: "cozy", label: "Cozy" },
                    { value: "comfortable", label: "Comfy" },
                    { value: "airy", label: "Airy" },
                  ]}
                  value={design.density}
                />
              </div>
            </div>
            <TileGroup<FormDesign["fieldStyle"]>
              columns="grid-cols-3"
              disabled={readOnly}
              label="Field style"
              onChange={(value) => {
                set("fieldStyle", value);
              }}
              tiles={(["boxed", "underline", "soft"] as const).map((style) => ({
                value: style,
                label: titleCase(style),
                visual: <FieldStyleVisual style={style} />,
              }))}
              value={design.fieldStyle}
            />
            <TileGroup<FormDesign["buttonShape"]>
              columns="grid-cols-3"
              disabled={readOnly}
              label="Button shape"
              onChange={(value) => {
                set("buttonShape", value);
              }}
              tiles={(["pill", "rounded", "square"] as const).map((shape) => ({
                value: shape,
                label: titleCase(shape),
                visual: <ButtonShapeVisual shape={shape} />,
              }))}
              value={design.buttonShape}
            />
            <div>
              <p className={`${eyebrowClass} mb-2`}>Progress</p>
              <Segmented<FormDesign["progress"]>
                label="Progress indicator"
                onChange={(value) => {
                  if (!readOnly) set("progress", value);
                }}
                options={[
                  { value: "bar", label: "Bar" },
                  { value: "steps", label: "Steps" },
                  { value: "fraction", label: "3 / 8" },
                  { value: "none", label: "None" },
                ]}
                value={design.progress}
              />
            </div>
            <Switch
              checked={design.showLogo}
              description="The MGM Laboratory mark above the form."
              disabled={readOnly}
              label="Show the lab logo"
              onChange={(value) => {
                set("showLogo", value);
              }}
            />
          </Section>
          <Section title="Cover">
            <TileGroup<FormDesign["cover"]["style"]>
              columns="grid-cols-2 sm:grid-cols-4 xl:grid-cols-2"
              disabled={readOnly}
              label="Cover style"
              onChange={(value) => {
                setCover({ style: value }, "style");
              }}
              tiles={(
                Object.entries(coverVisuals) as [FormDesign["cover"]["style"], React.ReactNode][]
              ).map(([style, visual]) => ({
                value: style,
                label: titleCase(style),
                visual,
              }))}
              value={design.cover.style}
            />
            {design.cover.style !== "none" ? (
              <>
                <MediaPicker
                  accept={["image", "video"]}
                  focal
                  formId={record.id}
                  label="Cover image or video"
                  onChange={(media) => {
                    setCover({ media }, "media");
                  }}
                  value={design.cover.media}
                />
                <Range
                  disabled={readOnly}
                  label="Overlay"
                  max={85}
                  onChange={(value) => {
                    setCover({ overlay: value }, "overlay");
                  }}
                  value={design.cover.overlay}
                />
              </>
            ) : null}
          </Section>
          <Section title="Background">
            <TileGroup<FormDesign["background"]["scene"]>
              columns="grid-cols-2 sm:grid-cols-3"
              disabled={readOnly}
              label="Scene"
              onChange={(value) => {
                setBackground({ scene: value }, "scene");
              }}
              tiles={(
                Object.entries(sceneVisuals) as [
                  FormDesign["background"]["scene"],
                  React.ReactNode,
                ][]
              ).map(([scene, visual]) => ({ value: scene, label: titleCase(scene), visual }))}
              value={design.background.scene}
            />
            <div>
              <p className={`${eyebrowClass} mb-2`}>Intensity</p>
              <Segmented<FormDesign["background"]["intensity"]>
                label="Scene intensity"
                onChange={(value) => {
                  if (!readOnly) setBackground({ intensity: value }, "intensity");
                }}
                options={[
                  { value: "calm", label: "Calm" },
                  { value: "lively", label: "Lively" },
                  { value: "wild", label: "Wild" },
                ]}
                value={design.background.intensity}
              />
            </div>
            <TileGroup<FormPattern>
              columns="grid-cols-3 sm:grid-cols-4"
              disabled={readOnly}
              label="Pattern"
              onChange={(value) => {
                setBackground({ pattern: value }, "pattern");
              }}
              tiles={(["none", ...PATTERN_FILES, "mixed"] as FormPattern[]).map((pattern) => ({
                value: pattern,
                label: pattern === "x" ? "X" : titleCase(pattern),
                visual: <PatternVisual pattern={pattern} />,
              }))}
              value={design.background.pattern}
            />
            <MediaPicker
              accept={["image", "video"]}
              formId={record.id}
              label="Background image or video"
              onChange={(media) => {
                setBackground({ media }, "media");
              }}
              value={design.background.media}
            />
            <Range
              disabled={readOnly}
              label="Dim"
              max={90}
              onChange={(value) => {
                setBackground({ dim: value }, "dim");
              }}
              value={design.background.dim}
            />
          </Section>
          <Section title="Motion">
            <TileGroup<FormDesign["motion"]["entrance"]>
              columns="grid-cols-3 sm:grid-cols-5 xl:grid-cols-3"
              disabled={readOnly}
              label="Entrance"
              onChange={(value) => {
                setMotion({ entrance: value }, "entrance");
              }}
              tiles={(["rise", "pop", "slide", "blur", "type"] as const).map((entrance) => ({
                value: entrance,
                label: titleCase(entrance),
                visual: <EntranceVisual entrance={entrance} />,
              }))}
              value={design.motion.entrance}
            />
            <div>
              <p className={`${eyebrowClass} mb-2`}>Speed</p>
              <Segmented<FormDesign["motion"]["speed"]>
                label="Motion speed"
                onChange={(value) => {
                  if (!readOnly) setMotion({ speed: value }, "speed");
                }}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                ]}
                value={design.motion.speed}
              />
            </div>
            <div>
              <p className={`${eyebrowClass} mb-2`}>Celebration on submit</p>
              <Segmented<FormDesign["motion"]["celebration"]>
                label="Celebration on submit"
                onChange={(value) => {
                  if (!readOnly) setMotion({ celebration: value }, "celebration");
                }}
                options={(["confetti", "fireworks", "bloom", "assemble", "none"] as const).map(
                  (value) => ({ value, label: titleCase(value) }),
                )}
                size="sm"
                value={design.motion.celebration}
              />
            </div>
            <Switch
              checked={design.motion.sound}
              description="Soft clicks on answers, off unless the respondent's device allows sound."
              disabled={readOnly}
              label="Sound"
              onChange={(value) => {
                setMotion({ sound: value }, "sound");
              }}
            />
            <Switch
              checked={design.motion.interactive}
              description="Parallax and pointer-reactive decoration. Reduced motion always turns it off."
              disabled={readOnly}
              label="Interactive background"
              onChange={(value) => {
                setMotion({ interactive: value }, "interactive");
              }}
            />
          </Section>
        </div>
        <button
          className={`${secondaryButtonClass} w-full xl:hidden`}
          onClick={() => {
            setShowPreview((current) => !current);
          }}
          type="button"
        >
          {showPreview ? <EyeSlash size={16} /> : <Eye size={16} />}
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
        {showPreview ? <div className="h-[80dvh] min-w-0 xl:hidden">{preview}</div> : null}
      </div>
      <div className="hidden min-w-0 xl:block">
        <div className="sticky top-[calc(var(--builder-top)+1rem)] h-[calc(100dvh-var(--builder-top)-2rem)]">
          {preview}
        </div>
      </div>
    </div>
  );
}
