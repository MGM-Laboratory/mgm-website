import { FORMS_NOSCRIPT_CSS } from "@/components/forms/noscript";

import { fraunces } from "./fonts";

/**
 * Public forms own the whole screen: no site header, no smooth scroller
 * (both stand down on /forms), their own theme and scene.
 */
export default function FormsLayout({ children }: LayoutProps<"/forms">) {
  return (
    <div className={`${fraunces.variable} flex min-h-dvh flex-1 flex-col`}>
      <noscript>
        <style>{FORMS_NOSCRIPT_CSS}</style>
      </noscript>
      {children}
    </div>
  );
}
