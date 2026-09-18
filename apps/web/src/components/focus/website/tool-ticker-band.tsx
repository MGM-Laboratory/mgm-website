import { ALL_TOOL_NAMES } from "@/data/website-focus";
import { Marquee } from "./marquee";

/**
 * A visceral "we already have everything" moment right under the hero —
 * every tool named in the stack below, in one continuous band, before the
 * reader gets to the reasoning for any of them.
 */
export function ToolTickerBand() {
  return (
    <div className="relative overflow-hidden border-y border-white/10 bg-[var(--surface-inverse)] py-5">
      <Marquee
        items={ALL_TOOL_NAMES}
        speed={70}
        itemClassName="mr-10 font-display text-xl font-semibold text-white/90 after:ml-10 after:text-brand-yellow after:content-['+'] sm:text-2xl"
      />
    </div>
  );
}
