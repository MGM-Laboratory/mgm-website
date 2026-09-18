import { FocusToolkitSection } from "../shared/focus-toolkit-section";
import { toolkitRolesFor } from "@/data/focus-toolkits";

const ACCENT_VARS = ["var(--brand-red)", "var(--brand-yellow)", "var(--brand-blue)"];

export function ToolkitSection() {
  return (
    <FocusToolkitSection
      eyebrow="The desk"
      eyebrowClassName="text-brand-red"
      headline="Every role gets the tools it actually needs."
      body="Same discipline as our web team — a real toolkit per role, not one shared login sheet nobody's updated since the app was approved."
      roles={toolkitRolesFor("mobile")}
      accentVars={ACCENT_VARS}
    />
  );
}
