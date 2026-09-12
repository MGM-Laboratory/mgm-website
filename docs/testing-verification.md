# Testing & Verification

**Rule: nothing is "done" until it's been seen working in a real browser.** The established workflow is Playwright (screenshots + interaction scripts) against the dev server, followed by `open http://localhost:3000` for a human look. The dev server must stay running at all times (`pnpm dev:web`); check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` before and after changes.

## Playwright methodology (proven patterns from this codebase)

- **SSR / flash checks**: a browser context with `javaScriptEnabled: false` shows exactly what server HTML renders — used to prove the nav menu's reload-flash fix (nothing of the closed panel may be visible pre-hydration).
- **Computed styles**: sample `getComputedStyle(el).transform/opacity` before/after interactions to verify GSAP end states — e.g. confirming the Our Work panel actually moved (it had silently no-op'd once).
- **Animation-timing races**: drive `page.mouse.move()` directly (no `hover()` sugar) to hit precise mid-animation windows, e.g. hovering a Core Competencies card immediately after the section scrolls into view.
- **Stress tests**: repeat a race repro many times (12× single-card, then 4 cards × 5 timing windows × many runs) — the Core Competencies race only showed intermittently; a single pass proves nothing.
- **Emulation**: `reducedMotion: "reduce"` (all reduced-motion paths: mount state, hover/unhover swaps, no snap-to-hovered on mount) and `colorScheme: "dark"` (menu text visibility was a real bug once).
- **Viewport matrix** for the no-scroll menu: 1280×800, 1440×900, 1280×600, mobile 390×844, with both dropdowns open — verify no scrollbar and nothing clipped.

## Regression checklist (bugs that have shipped before)

| Bug                                                         | What to re-check when touching related code                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Menu flashes open on reload/first visit                     | No-JS context must show a fully invisible panel; reload repeatedly                                                  |
| Core Competencies cards stuck lower / invisible after hover | Hover each card at several moments during the entrance animation; repeat many times; also under reduced motion      |
| Reduced-motion snap-to-hovered on mount                     | With `reducedMotion: "reduce"`, cards must mount at rest (`y: 0`, `opacity: 1`, back content hidden)                |
| Menu text invisible in dark mode                            | Dark-mode screenshot of the open menu                                                                               |
| Menu scrolls / content clipped                              | Viewport matrix above, both dropdowns open                                                                          |
| Dropdown panel doesn't move on hover                        | Computed transform before/after hover (yPercent must actually change)                                               |
| Double text on Our Work hover                               | Front title must not paint over the reveal panel (no stray z-10)                                                    |
| GSAP + CSS transform stacking                               | Computed style must never show compounded `translate(...) translate(...)` (gotcha #1 in `docs/animation-system.md`) |

## Type & lint gates

`pnpm typecheck` (web: `next typegen && tsc --noEmit`) and `pnpm lint` (web: eslint; api: oxlint) must be clean before declaring done — these are also the CI gates. `pnpm test` runs api vitest only (web has no test script).

## Commit & push

One discrete change per commit, push immediately after each commit (see `docs/repo-history.md` for the full git rules). Pushing to `main` triggers CI + Railway deploys automatically — the CI run itself is a final verification (watch it with `gh run watch`), and `gh run list -R MGM-Laboratory/mgm-website` should show both workflows green.
