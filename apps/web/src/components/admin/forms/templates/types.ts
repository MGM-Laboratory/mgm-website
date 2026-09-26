import type { FormDocumentInput } from "@repo/shared";

export const TEMPLATE_CATEGORIES = [
  { id: "events", label: "Events" },
  { id: "feedback", label: "Feedback" },
  { id: "research", label: "Research" },
  { id: "recruitment", label: "Recruitment" },
  { id: "operations", label: "Operations" },
  { id: "education", label: "Education & quiz" },
  { id: "community", label: "Community" },
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]["id"];

/** A ready-made form the gallery offers; `document` parses with `formDocumentSchema`. */
export type FormTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  /** One sentence for the gallery tile. */
  description: string;
  /** Shown on the empty state of the forms list. */
  featured?: boolean;
  document: FormDocumentInput;
};
