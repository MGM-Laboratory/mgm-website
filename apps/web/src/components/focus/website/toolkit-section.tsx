import { FocusToolkitSection } from "../shared/focus-toolkit-section";
import { TOOLKIT_ROLES } from "@/data/website-focus";

const ACCENT_VARS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-red)"];

export function ToolkitSection() {
  return (
    <FocusToolkitSection
      eyebrow="The desk"
      eyebrowClassName="text-brand-blue"
      headline="Every role gets the tools it actually needs."
      body="Not a shared spreadsheet of logins — a real practice per discipline, kept current instead of frozen at whatever was approved three years ago."
      roles={TOOLKIT_ROLES}
      accentVars={ACCENT_VARS}
    />
  );
}
