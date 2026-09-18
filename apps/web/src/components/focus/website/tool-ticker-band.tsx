"use client";

import { ALL_TOOL_NAMES } from "@/data/website-focus";
import { TOOL_ICONS } from "@/data/tool-icons";
import { Marquee } from "./marquee";

/**
 * Every tool named in the stack below, as real marks (simple-icons where
 * one exists, a plain glyph otherwise — never an invented logo), scrolling
 * by before any explanation. `Marquee` handles pause-on-hover and the
 * measured-offset loop; this just supplies the content.
 */
export function ToolTickerBand() {
  return (
    <div className="relative overflow-hidden border-y border-white/10 bg-[var(--surface-inverse)] py-6">
      <Marquee
        items={ALL_TOOL_NAMES}
        speed={70}
        pauseOnHover
        renderItem={(tool) => {
          const Icon = TOOL_ICONS[tool];
          return (
            <span className="mr-10 inline-flex items-center gap-2.5 font-display text-lg font-semibold text-white/90 sm:text-xl">
              {Icon ? <Icon size={20} className="shrink-0 text-white/70" /> : null}
              {tool}
            </span>
          );
        }}
      />
    </div>
  );
}
