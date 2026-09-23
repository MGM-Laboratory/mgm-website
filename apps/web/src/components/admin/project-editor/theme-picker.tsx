"use client";

import { ArrowUpRight, Check, Sparkle } from "@phosphor-icons/react";
import { useRef } from "react";

import { PROJECT_THEME_IDS, projectThemeId, type ProjectThemeId } from "@/lib/project-cms";
import {
  PROJECT_THEMES,
  projectPaletteVars,
  type ProjectPalette,
  type ProjectTheme,
} from "@/lib/project-themes";

/** `undefined` is the "Automatic" choice: the page picks a theme from the slug. */
type ThemeChoice = ProjectThemeId | undefined;
const CHOICES: readonly ThemeChoice[] = [undefined, ...PROJECT_THEME_IDS];

function paletteStyle(palette: ProjectPalette) {
  return projectPaletteVars(palette) as React.CSSProperties;
}

/** One half of a swatch: the variant's background, an "Aa" in its text colour and its highlight. */
function SwatchHalf({ palette }: { palette: ProjectPalette }) {
  return (
    <span
      className="relative flex flex-1 items-center justify-center bg-[var(--project-bg)]"
      style={paletteStyle(palette)}
    >
      <span className="font-display text-base font-semibold tracking-[-0.04em] text-[var(--project-text)]">
        Aa
      </span>
      <span className="absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-[var(--project-highlight)]" />
    </span>
  );
}

function Swatch({ theme }: { theme: ProjectTheme }) {
  return (
    <span className="flex h-12 overflow-hidden rounded-lg border border-black/[0.06]">
      <SwatchHalf palette={theme.light} />
      <SwatchHalf palette={theme.dark} />
    </span>
  );
}

/**
 * The detail page palette as a radio group of split light/dark swatches,
 * led by an "Automatic" choice that shows which theme the slug maps to.
 * Arrow keys move the selection (radio semantics); Tab leaves the group.
 */
export function ThemePicker({
  labelId,
  onChange,
  slug,
  value,
}: {
  labelId: string;
  onChange: (theme: ThemeChoice) => void;
  slug: string;
  value: ThemeChoice;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const automatic = PROJECT_THEMES[projectThemeId({ slug })];
  const selectedIndex = Math.max(0, CHOICES.indexOf(value));

  const choose = (index: number) => {
    const next = (index + CHOICES.length) % CHOICES.length;
    onChange(CHOICES[next]);
    buttons.current[next]?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: selectedIndex - 1,
      ArrowUp: selectedIndex - 1,
      ArrowRight: selectedIndex + 1,
      ArrowDown: selectedIndex + 1,
      Home: 0,
      End: CHOICES.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    choose(moves[event.key]);
  };

  return (
    <div
      aria-labelledby={labelId}
      className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7"
      onKeyDown={onKeyDown}
      role="radiogroup"
    >
      {CHOICES.map((choice, index) => {
        const selected = index === selectedIndex;
        const theme = choice ? PROJECT_THEMES[choice] : automatic;
        return (
          <button
            aria-checked={selected}
            aria-label={
              choice ? `${theme.name} theme` : `Automatic theme, currently ${automatic.name}`
            }
            className={`group relative flex min-w-0 flex-col gap-1.5 rounded-xl p-1.5 text-left transition focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none ${
              selected
                ? "bg-brand-blue-50 ring-2 ring-brand-blue dark:bg-brand-blue/15"
                : "ring-1 ring-[#dfe4ee] hover:bg-[#f5f7fb] hover:ring-brand-blue/40 dark:ring-white/10 dark:hover:bg-white/[0.05]"
            }`}
            key={choice ?? "automatic"}
            onClick={() => choose(index)}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            role="radio"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <Swatch theme={theme} />
            <span className="flex min-w-0 items-center gap-1 px-0.5">
              {choice ? null : (
                <Sparkle className="shrink-0 text-brand-blue" size={11} weight="fill" />
              )}
              <span className="truncate text-[11px] font-semibold text-[#3c4659] dark:text-white/75">
                {choice ? theme.name : "Automatic"}
              </span>
            </span>
            {choice ? null : (
              <span className="-mt-1 truncate px-0.5 text-[10px] text-[#8490a5] dark:text-white/40">
                {automatic.name}
              </span>
            )}
            {selected ? (
              <span className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-brand-blue text-white shadow">
                <Check size={9} weight="bold" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const EXAMPLE_SERVICES = ["Concept", "UX Research", "Web Development"];

function PreviewPanel({
  copy,
  ctaLabel,
  palette,
  services,
  title,
  variant,
}: {
  copy?: string;
  ctaLabel?: string;
  palette: ProjectPalette;
  services: string[];
  title: string;
  variant: "Light" | "Dark";
}) {
  const shownServices = services.length ? services : EXAMPLE_SERVICES;
  return (
    <figure
      className="flex min-h-56 min-w-0 flex-col gap-4 rounded-xl bg-[var(--project-bg)] p-4 text-[var(--project-text)] ring-1 ring-black/[0.06] sm:p-5"
      style={paletteStyle(palette)}
    >
      <figcaption className="font-mono text-[9px] font-bold tracking-[0.16em] text-[var(--project-muted)] uppercase">
        {variant}
      </figcaption>
      <div className="min-w-0">
        <p className="line-clamp-2 font-display text-xl leading-tight font-semibold tracking-[-0.04em] break-words">
          {title}
        </p>
        <p
          className={`mt-2 line-clamp-2 text-[11px] leading-[1.5] text-[var(--project-muted)] ${copy ? "" : "italic"}`}
        >
          {copy || "The description (or the summary) appears here, two short paragraphs at most."}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--project-button-bg)] pr-3 pl-2.5 text-[11px] font-semibold text-[var(--project-button-text)] ${ctaLabel ? "" : "opacity-45"}`}
        >
          <span className="size-1.5 rounded-full bg-[var(--project-highlight)]" />
          {ctaLabel || "Launch Project"}
        </span>
        <span
          className={`grid size-7 place-items-center rounded-full bg-[var(--project-icon-bg)] text-[var(--project-icon-color)] ${ctaLabel ? "" : "opacity-45"}`}
        >
          <ArrowUpRight size={12} weight="bold" />
        </span>
      </div>
      <div className="mt-auto min-w-0">
        <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-[var(--project-muted)] uppercase">
          Services
        </p>
        <ul className={`mt-1.5 text-[11px] leading-5 ${services.length ? "" : "opacity-45"}`}>
          {shownServices.map((service) => (
            <li className="truncate border-t border-[var(--project-line)] py-0.5" key={service}>
              {service}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

/** A sketch of the detail page's title panel in both variants of one theme. */
export function ThemePreview({
  copy,
  ctaLabel,
  services,
  themeId,
  title,
}: {
  copy?: string;
  ctaLabel?: string;
  services: string[];
  themeId: ProjectThemeId;
  title: string;
}) {
  const theme = PROJECT_THEMES[themeId];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <PreviewPanel
        copy={copy}
        ctaLabel={ctaLabel}
        palette={theme.light}
        services={services}
        title={title}
        variant="Light"
      />
      <PreviewPanel
        copy={copy}
        ctaLabel={ctaLabel}
        palette={theme.dark}
        services={services}
        title={title}
        variant="Dark"
      />
    </div>
  );
}
