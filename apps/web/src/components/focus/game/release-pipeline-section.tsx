import { FocusPipelineSection } from "../shared/focus-pipeline-section";
import { PUBLISHING_TOOLS } from "@/data/game-focus";
import { pipelineStagesFor } from "@/data/focus-pipelines";

export function ReleasePipelineSection() {
  return (
    <FocusPipelineSection
      eyebrow="Prototype to shelf"
      headline="You build the game. We handle getting it out the door."
      body="Publishing accounts, playtesters, and a marketing hand — the parts that aren't game design but still decide whether anyone plays it."
      stages={pipelineStagesFor("game")}
      accentVar="var(--brand-green)"
      tools={PUBLISHING_TOOLS}
    />
  );
}
