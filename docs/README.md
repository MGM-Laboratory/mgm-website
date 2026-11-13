# Documentation

Start with the [README](../README.md) for the stack and the quick start, and with [CONTRIBUTING](../CONTRIBUTING.md) for the workflow. The pages below go deeper. Read them in this order when you are new to the repo.

1. [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) is the design source of truth for the brand, the color tokens, the typography and the icons.
2. [`project-overview.md`](project-overview.md) explains what the site is, lists all pages and shows the content status.
3. [`architecture.md`](architecture.md) describes the monorepo layout, the components, the data and the routing.
4. [`cms-admin.md`](cms-admin.md) covers the CMS collections, the `/admin` workspace, signed sessions, roles, the API proxy boundaries and media storage.
5. [`animation-system.md`](animation-system.md) covers the GSAP setup and its conventions, and the gotchas that have already cost days. Read it before you touch any animation.
6. [`design-system.md`](design-system.md) shows how the design system is wired into the code.
7. [`navigation-menu.md`](navigation-menu.md) specifies the full-screen menu.
8. [`page-transition.md`](page-transition.md) describes the navigation curtain and the homepage entrance behavior.
9. [`projects-page.md`](projects-page.md) covers the `/projects` index and the project detail pages.
10. [`articles-page.md`](articles-page.md) covers the `/articles` library and its WebGL world.
11. [`careers-cms.md`](careers-cms.md) covers job postings, application uploads and the careers inbox.
12. [`shortlinks.md`](shortlinks.md) covers the link shortener.
13. [`domain-connect.md`](domain-connect.md) covers the one click Cloudflare setup for short link domains.
14. [`forms.md`](forms.md) covers the form builder and the public forms.
15. [`mail-system.md`](mail-system.md) covers the three mail providers. Read it before you change mail settings.
16. [`configuration.md`](configuration.md) lists every setting with its default.
17. [`data-model.md`](data-model.md) lists the database tables.
18. [`errors.md`](errors.md) lists the errors that the API and the web handlers return.
19. [`security.md`](security.md) describes the security controls and the limits of the design.
20. [`privacy.md`](privacy.md) describes the personal data that the site handles.
21. [`ci-cd.md`](ci-cd.md) covers GitHub Actions, the Docker images and how they are deployed.
22. [`testing-verification.md`](testing-verification.md) covers how work is verified.
23. [`repo-history.md`](repo-history.md) covers the 2026-09-12 migration and why the git rules are strict.

## Two warnings

- This is Next.js 16, which differs from older versions. Before you write Next-specific code, read the relevant guide in `apps/web/node_modules/next/dist/docs/`.
- Never let a static CSS class set `transform`, `translate-*`, `rotate-*` or `scale-*` on an element that GSAP also animates. GSAP stacks onto the class instead of replacing it. This bug has shipped twice.
