import { FORMS_NOSCRIPT_CSS } from "@/components/forms/noscript";
import { fraunces } from "@/app/forms/fonts";

/** The builder's live preview wears the public form's fonts. */
export default function FormPreviewLayout({ children }: LayoutProps<"/admin/forms/preview">) {
  return (
    <div className={`${fraunces.variable} flex min-h-dvh flex-1 flex-col`}>
      <noscript>
        <style>{FORMS_NOSCRIPT_CSS}</style>
      </noscript>
      {children}
    </div>
  );
}
