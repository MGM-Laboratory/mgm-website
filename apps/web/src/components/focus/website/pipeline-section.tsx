import { FocusPipelineSection } from "../shared/focus-pipeline-section";
import { INFRA_TOOLS, PIPELINE_STAGES } from "@/data/website-focus";

// Mirrors this repo's own real pipeline (see docs/ci-cd.md) — not a stock
// diagram. Push to main triggers exactly these four stages, in order.
export function PipelineSection() {
  return (
    <FocusPipelineSection
      eyebrow="Infrastructure"
      headline="You build. We ship it."
      body="A dedicated IT & Infrastructure team owns deployment, scaling, and CI/CD end to end — so shipping a change means opening a pull request, not filing a ticket."
      stages={PIPELINE_STAGES}
      accentVar="var(--brand-blue)"
      tools={INFRA_TOOLS}
    />
  );
}
