// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test as base } from "@playwright/test";

/**
 * The `test` of every browser spec. It records each `securitypolicyviolation` event of every page of the test context, popups
 * included and also after a navigation, and fails the test when the Content-Security-Policy of the site (report only today)
 * would have blocked something. The browser fires the event for a report only policy too, so a source that the policy list
 * misses shows up here before the policy is enforced.
 *
 * A context that a spec builds itself with `browser.newContext()` or `launch()` is not covered, because only the `context`
 * fixture is wrapped. The guard is built only for a test that asks for a page or a context.
 */
export const test = base.extend({
  context: async ({ context }, provideContext) => {
    const violations = new Set<string>();
    await context.exposeFunction("__reportCspViolation", (summary: string) => {
      violations.add(summary);
    });
    await context.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const report = (window as unknown as { __reportCspViolation?: (summary: string) => void })
          .__reportCspViolation;
        report?.(
          `${event.effectiveDirective} blocked ${event.blockedURI || "inline"} on ${event.documentURI} from ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
        );
      });
    });
    await provideContext(context);
    // A round trip to each page flushes the reports that are still on their way from the browser
    for (const page of context.pages()) await page.evaluate(() => 0).catch(() => undefined);
    expect([...violations], "Content-Security-Policy violations").toEqual([]);
  },
});
