import { FocusStoryRows } from "../shared/focus-story-rows";
import { BANDOAR_HIGHLIGHT } from "@/data/game-focus";

// One real, documented highlight instead of an invented showcase — a lab
// member's actual award (see mgm.md [S11]), framed as history, not a live
// product.
export function BandoarSection() {
  return (
    <FocusStoryRows
      eyebrow="From the archive"
      eyebrowClassName="text-brand-green"
      headline="Real work, recognized on a real stage."
      items={BANDOAR_HIGHLIGHT}
    />
  );
}
