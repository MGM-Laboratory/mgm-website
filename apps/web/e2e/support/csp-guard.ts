// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test as base } from "@playwright/test";

/**
 * The `test` of every browser spec. It records each `securitypolicyviolation` event of the page, also after a navigation,
 * and fails the test when the Content-Security-Policy of the site (report only today) would have blocked something.
 * The browser fires the event for a report only policy too, so a source that the policy list misses shows up here before
 * the policy is enforced.
 */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.exposeFunction("__reportCspViolation", (summary: string) => {
        violations.push(summary);
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          const report = (window as unknown as { __reportCspViolation?: (summary: string) => void })
            .__reportCspViolation;
          report?.(
            `${event.effectiveDirective} blocked ${event.blockedURI || "inline"} on ${event.documentURI}`,
          );
        });
      });
      await use();
      expect(violations, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
