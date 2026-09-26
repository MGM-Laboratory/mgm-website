import { COMMUNITY_TEMPLATES } from "./community";
import { EDUCATION_TEMPLATES } from "./education";
import { EVENT_TEMPLATES } from "./events";
import { FEEDBACK_TEMPLATES } from "./feedback";
import { OPERATIONS_TEMPLATES } from "./operations";
import { RECRUITMENT_TEMPLATES } from "./recruitment";
import { RESEARCH_TEMPLATES } from "./research";
import type { FormTemplate } from "./types";

export * from "./types";

/** Every built-in template, in gallery category order. */
export const FORM_TEMPLATES: FormTemplate[] = [
  ...EVENT_TEMPLATES,
  ...FEEDBACK_TEMPLATES,
  ...RESEARCH_TEMPLATES,
  ...RECRUITMENT_TEMPLATES,
  ...OPERATIONS_TEMPLATES,
  ...EDUCATION_TEMPLATES,
  ...COMMUNITY_TEMPLATES,
];

/** A few varied templates for the forms list's empty state. */
export function featuredTemplates() {
  return FORM_TEMPLATES.filter((template) => template.featured);
}

export function templateById(id: string) {
  return FORM_TEMPLATES.find((template) => template.id === id);
}
