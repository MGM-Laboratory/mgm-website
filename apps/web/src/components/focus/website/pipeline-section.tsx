import { FocusPipelineSection } from "../shared/focus-pipeline-section";
import { INFRA_TOOLS } from "@/data/website-focus";
import { pipelineStagesFor } from "@/data/focus-pipelines";

export function PipelineSection() {
  return (
    <FocusPipelineSection
      eyebrow="Infrastructure"
      headline="You build. We ship it."
      body="A dedicated IT & Infrastructure team owns deployment, scaling, and CI/CD end to end — so shipping a change means opening a pull request, not filing a ticket."
      stages={pipelineStagesFor("website")}
      accentVar="var(--brand-blue)"
      tools={INFRA_TOOLS}
    />
  );
}
