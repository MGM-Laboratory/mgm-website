import { FocusPipelineSection } from "../shared/focus-pipeline-section";
import { PROCESS_STAGES } from "@/data/ux-focus";

export function ProcessSection() {
  return (
    <FocusPipelineSection
      eyebrow="From data to design"
      headline="Every screen goes through the same four questions."
      body="Not a formality — a real loop. A design that skips validation is just a guess with better typography."
      stages={PROCESS_STAGES}
      accentVar="var(--brand-yellow)"
      dotStyle="border"
    />
  );
}
