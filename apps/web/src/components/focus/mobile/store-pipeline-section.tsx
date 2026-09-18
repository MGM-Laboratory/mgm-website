import { FocusPipelineSection } from "../shared/focus-pipeline-section";
import { PIPELINE_STAGES } from "@/data/mobile-focus";

export function StorePipelineSection() {
  return (
    <FocusPipelineSection
      eyebrow="Prototype to app store"
      headline="From a Figma frame to a store listing."
      body="The same dedicated IT & Infrastructure team behind our web builds handles backend scaling here too — app developers ship features, not servers."
      stages={PIPELINE_STAGES}
      accentVar="var(--brand-red)"
    />
  );
}
