import { FocusPipelineSection } from "../shared/focus-pipeline-section";
import { PUBLISHING_TOOLS, RELEASE_STAGES } from "@/data/game-focus";

export function ReleasePipelineSection() {
  return (
    <FocusPipelineSection
      eyebrow="Prototype to shelf"
      headline="You build the game. We handle getting it out the door."
      body="Publishing accounts, playtesters, and a marketing hand — the parts that aren't game design but still decide whether anyone plays it."
      stages={RELEASE_STAGES}
      accentVar="var(--brand-green)"
      tools={PUBLISHING_TOOLS}
    />
  );
}
