import { FocusToolkitSection } from "../shared/focus-toolkit-section";
import { TOOLKIT_ROLES } from "@/data/mobile-focus";

const ACCENT_VARS = ["var(--brand-red)", "var(--brand-yellow)", "var(--brand-blue)"];

export function ToolkitSection() {
  return (
    <FocusToolkitSection
      eyebrow="The desk"
      eyebrowClassName="text-brand-red"
      headline="Every role gets the tools it actually needs."
      body="Same discipline as our web team — a real toolkit per role, not one shared login sheet nobody's updated since the app was approved."
      roles={TOOLKIT_ROLES}
      accentVars={ACCENT_VARS}
    />
  );
}
