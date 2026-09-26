"use client";

import type { ReactNode } from "react";
import { useTheme } from "next-themes";
import type { FormDesign } from "@repo/shared";

import { formThemeCss } from "@/lib/forms/public-theme";
import type { ProjectColorScheme } from "@/lib/project-themes";

import { useHydrated } from "./use-hydrated";

import "./forms.css";

/**
 * The themed root every form screen renders inside: the theme's variables
 * on `:root` (a plain <style>, so they leave with the page), and the look
 * settings as data attributes the stylesheet keys on.
 */

type RootDesign = Pick<
  FormDesign,
  "theme" | "colorMode" | "font" | "density" | "fieldStyle" | "buttonShape" | "align" | "layout"
>;

/**
 * The scheme the page shows: forced by the admin preview, forced by the
 * form's own colour mode, or the site's (next-themes) under `auto`. Before
 * mount `auto` reports light; the stylesheet already paints the right one.
 */
export function useFormScheme(
  colorMode: FormDesign["colorMode"],
  forced?: ProjectColorScheme,
): ProjectColorScheme {
  const { resolvedTheme } = useTheme();
  const mounted = useHydrated();
  if (forced) return forced;
  if (colorMode !== "auto") return colorMode;
  return mounted && resolvedTheme === "dark" ? "dark" : "light";
}

export function FormThemeStyle({
  design,
  forced,
}: {
  design: Pick<FormDesign, "theme" | "colorMode">;
  forced?: ProjectColorScheme;
}) {
  return <style>{formThemeCss(design, forced)}</style>;
}

export function FormRoot({
  design,
  forced,
  children,
  className,
  stage,
}: {
  design: RootDesign;
  forced?: ProjectColorScheme;
  children: ReactNode;
  className?: string;
  stage?: string;
}) {
  const hydrated = useHydrated();
  return (
    <div
      className={className ? `fx-root ${className}` : "fx-root"}
      data-hydrated={hydrated ? "" : undefined}
      data-font={design.font}
      data-density={design.density}
      data-field-style={design.fieldStyle}
      data-button={design.buttonShape}
      data-align={design.align}
      data-layout={design.layout}
      data-stage={stage}
    >
      <FormThemeStyle design={design} forced={forced} />
      {children}
    </div>
  );
}
