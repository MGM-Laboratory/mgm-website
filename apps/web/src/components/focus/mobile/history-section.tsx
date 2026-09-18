import { FocusStoryRows } from "../shared/focus-story-rows";
import { HISTORY_HIGHLIGHTS } from "@/data/mobile-focus";

// Unlike /website, this page can't point at itself as proof — so instead of
// a "built here" trick, it closes on real documented history: work this lab
// actually shipped, dated and sourced, not an invented showcase.
export function HistorySection() {
  return (
    <FocusStoryRows
      eyebrow="Some of it, on record"
      eyebrowClassName="text-brand-red"
      headline="We've been shipping to phones for a while."
      items={HISTORY_HIGHLIGHTS}
    />
  );
}
