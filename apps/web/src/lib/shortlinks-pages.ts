/**
 * The public short-link pages (passphrase gate, expired, not found) as
 * complete standalone HTML documents. They are served from route handlers,
 * so the marketing site's layout, scripts and animations never load: a
 * click lands on the tiniest page possible and a passphrase gate is all
 * the page there is. The inline theme script mirrors next-themes' storage
 * key so light/dark carries over from the main site.
 */

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@500;600;700&family=Geist:wght@400;500;600&display=swap"
  rel="stylesheet"
/>`;

const STYLES = `
:root {
  --bg: #f7f7f5;
  --surface: #ffffff;
  --ink: #0e1116;
  --ink-2: #3b4150;
  --ink-3: #6b7280;
  --line: #ececea;
  --brand-blue: #3a6dc5;
  --brand-red: #f94141;
  --brand-yellow: #f7bf33;
  --brand-green: #0f8657;
}
.dark {
  --bg: #15181e;
  --surface: #1c212a;
  --ink: #ededed;
  --ink-2: #c4c9d4;
  --ink-3: #8b93a3;
  --line: #262a33;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--ink);
  font-family: "Geist", ui-sans-serif, system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  -webkit-font-smoothing: antialiased;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 6px 24px -8px rgba(14, 17, 22, 0.1), 0 2px 6px -2px rgba(14, 17, 22, 0.05);
  width: 100%;
  max-width: 420px;
  padding: 40px 36px 32px;
  position: relative;
  overflow: hidden;
}
.eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--brand-blue);
  margin-bottom: 14px;
}
h1 {
  font-family: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.hint {
  margin-top: 10px;
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink-2);
}
form { margin-top: 24px; }
label { display: none; }
input {
  width: 100%;
  height: 46px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  font-family: inherit;
  font-size: 15px;
  padding: 0 14px;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
input:focus {
  border-color: var(--brand-blue);
  box-shadow: 0 0 0 4px rgba(58, 109, 197, 0.12);
}
input::placeholder { color: var(--ink-3); }
button {
  width: 100%;
  height: 46px;
  margin-top: 12px;
  border: none;
  border-radius: 12px;
  background: var(--brand-blue);
  color: #ffffff;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 120ms ease;
}
button:hover { filter: brightness(1.06); }
button:active { filter: brightness(0.96); }
.error {
  margin-top: 16px;
  background: var(--brand-red);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  border-radius: 10px;
  padding: 10px 14px;
}
.footer {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  color: var(--ink-3);
}
.footer a { color: var(--brand-blue); text-decoration: none; font-weight: 500; }
.footer a:hover { text-decoration: underline; }
.theme-toggle {
  background: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 500;
  height: 28px;
  width: auto;
  margin: 0;
  padding: 0 12px;
  flex-shrink: 0;
}
.theme-toggle:hover { filter: none; background: var(--bg); }
.motif {
  position: fixed;
  right: -30px;
  bottom: -34px;
  width: 170px;
  height: 150px;
  pointer-events: none;
  opacity: 0.95;
  z-index: -1;
}
@media (max-width: 520px) {
  .card { padding: 32px 24px 26px; }
  .motif { opacity: 0.55; }
}
`;

const MOTIF = `<svg class="motif" viewBox="0 0 170 150" aria-hidden="true">
  <circle cx="38" cy="98" r="30" fill="var(--brand-blue)" />
  <path d="M 52 26 A 30 30 0 0 0 112 26 L 112 46 A 30 30 0 0 1 52 46 Z" fill="var(--brand-yellow)" />
  <rect x="96" y="66" width="26" height="26" rx="6" fill="none" stroke="var(--ink)" stroke-width="5" />
</svg>`;

const THEME_SCRIPT = `<script>(function () {
  try {
    var theme = localStorage.getItem("theme");
    var dark = theme === "dark" || ((theme === null || theme === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();</script>`;

const TOGGLE_SCRIPT = `<script>(function () {
  var button = document.getElementById("theme-toggle");
  if (!button) return;
  button.addEventListener("click", function () {
    var dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    button.textContent = dark ? "Light" : "Dark";
  });
})();</script>`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type PageContent = {
  title: string;
  eyebrow: string;
  heading: string;
  hint: string;
  form?: { slug: string; error?: string };
  unavailable?: boolean;
};

function page({ title, eyebrow, heading, hint, form }: PageContent): string {
  const statusNote = form?.error ? `<p class="error">${escapeHtml(form.error)}</p>` : "";
  const formHtml = form
    ? `<form method="post" action="/s/${encodeURIComponent(form.slug)}">
        <label for="passphrase">Passphrase</label>
        <input id="passphrase" name="passphrase" type="password" placeholder="Passphrase"
          autocomplete="current-password" required autofocus ${form.error ? 'aria-invalid="true"' : ""} />
        <button type="submit">Unlock link</button>
      </form>${statusNote}`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/logo.svg" type="image/svg+xml" />
  ${FONTS}
  ${THEME_SCRIPT}
  <style>${STYLES}</style>
</head>
<body>
  ${MOTIF}
  <main class="card">
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(heading)}</h1>
    <p class="hint">${escapeHtml(hint)}</p>
    ${formHtml}
    <footer class="footer">
      <span>Short links by MGM Laboratory · <a href="https://labmgm.org">labmgm.org</a></span>
      <button id="theme-toggle" class="theme-toggle" type="button">Theme</button>
    </footer>
  </main>
  ${TOGGLE_SCRIPT}
</body>
</html>`;
}

export function renderShortlinkPage(
  kind: "passphrase" | "expired" | "consumed" | "not_found",
  opts: { slug?: string; error?: string } = {},
): string {
  switch (kind) {
    case "passphrase":
      return page({
        title: "Protected link · MGM Laboratory",
        eyebrow: "MGM Laboratory",
        heading: "Protected link",
        hint: "This link needs a passphrase. Enter it to continue.",
        form: { slug: opts.slug ?? "", error: opts.error },
      });
    case "expired":
      return page({
        title: "Link expired · MGM Laboratory",
        eyebrow: "Link expired",
        heading: "This link has expired",
        hint: "Short links can be set to stop working after a while. Ask whoever shared it for a new one.",
      });
    case "consumed":
      return page({
        title: "Link used · MGM Laboratory",
        eyebrow: "Link used",
        heading: "This link was already used",
        hint: "It was set to work a single time, and that time has passed. Ask whoever shared it for a new one.",
      });
    default:
      return page({
        title: "Link not found · MGM Laboratory",
        eyebrow: "Link not found",
        heading: "This link does not exist",
        hint: "Check the link for typos and try again, or ask whoever shared it with you.",
      });
  }
}

export function renderShortlinkUnavailable(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Short links unavailable · MGM Laboratory</title>
  <link rel="icon" href="/logo.svg" type="image/svg+xml" />
  ${FONTS}
  ${THEME_SCRIPT}
  <style>${STYLES}</style>
</head>
<body>
  ${MOTIF}
  <main class="card">
    <div class="eyebrow">MGM Laboratory</div>
    <h1>Short links are unavailable</h1>
    <p class="hint">Something went wrong on our side. Please try again in a moment.</p>
    <footer class="footer">
      <span>Short links by MGM Laboratory · <a href="https://labmgm.org">labmgm.org</a></span>
      <button id="theme-toggle" class="theme-toggle" type="button">Theme</button>
    </footer>
  </main>
  ${TOGGLE_SCRIPT}
</body>
</html>`;
}
