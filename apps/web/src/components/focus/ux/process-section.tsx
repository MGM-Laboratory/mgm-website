import { FocusPipelineSection } from "../shared/focus-pipeline-section";
import { pipelineStagesFor } from "@/data/focus-pipelines";

export function ProcessSection() {
  return (
    <FocusPipelineSection
      eyebrow="From data to design"
      headline="Every screen goes through the same four questions."
      body="Not a formality — a real loop. A design that skips validation is just a guess with better typography."
      stages={pipelineStagesFor("ux")}
      accentVar="var(--brand-yellow)"
      dotStyle="border"
    />
  );
}
