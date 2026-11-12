# Accessibility statement

This page says what the site does for accessibility, which checks run in CI, where the known gaps are and how to report a barrier. It describes the code in this repository. It makes no claim about any conformance level, because no test in this repository proves one.

## What the site does

- The page language is set to English on the root `html` element.
- The site follows the color scheme of the system by default. A theme toggle with the accessible name "Toggle theme" switches between the light and dark themes. The admin workspace always uses the light theme.
- The animation code checks `prefers-reduced-motion`. Under reduced motion the durations collapse to zero, so content stays reachable and the movement stops. The smooth scrolling of the homepage does not run.
- The menu and the glass of the header follow `prefers-reduced-transparency`. They fall back to the opaque surface of the theme.
- The full screen menu marks its toggle with `aria-expanded`. The closed panel is `inert`. Escape closes the menu, and focus returns to the toggle.
- The film player on the homepage is a dialog with `aria-modal`, a close button, play and pause and sound buttons, and a close action on Escape.
- The public forms offer a conversational layout that shows one question at a time, and the keyboard can drive it. The date and time pickers follow the key bindings of the ARIA Authoring Practices date picker.
- Several controls set a visible focus style with `:focus-visible`, for example the header controls, the back link of a project and the article covers.
- The design system sets contrast targets for both themes in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Body text uses the ink tokens. Red is for large text and fills only. Yellow never carries text on white. The themed project, article and form pages target a ratio of at least 7 to 1 for text and at least 4.5 to 1 for labels and muted text.

## What CI checks

- Lighthouse CI runs on pull requests that change files that can affect the pages. It loads `/`, `/about` and `/contact` three times each. The check fails when the accessibility score is below 0.9. The settings are in [.lighthouserc.json](.lighthouserc.json).
- Playwright runs the end to end tests in Chromium, Firefox, WebKit and two mobile profiles. Some tests emulate reduced motion and the dark color scheme. The tests check behavior and screenshots. They do not run an accessibility engine such as axe.
- Nothing in CI measures color contrast outside the Lighthouse score. The contrast values in the design system come from the design work and are not asserted by a test.

An automated score finds only part of the possible barriers. A score of 0.9 or more does not mean that the pages are free of barriers.

## Known limitations

- Nobody has audited the site with a screen reader or other assistive technology. Nobody has tested the three.js scenes, the 3D form scenes and the page transitions with assistive technology.
- The code has no "skip to main content" link.
- The code has no captions or text track for the videos that editors upload.
- The admin workspace is for editors, and no accessibility check targets it.
- The public pages are in English. Forms can use English or Indonesian text, as the editor of the form chooses.

## Report a barrier

Report a barrier by email to **hi@labmgm.org**, the same address that [SECURITY.md](SECURITY.md) uses. You can also open an issue with the [bug report form](https://github.com/MGM-Laboratory/mgm-website/issues/new?template=bug_report.yml) and say that it is an accessibility barrier.

Describe the page, what you tried to do, where it went wrong and which browser and assistive tools you use. The maintainer reads reports as time allows and does not promise a reply time. Do not use a public issue for a security problem, and follow [SECURITY.md](SECURITY.md) for those.
