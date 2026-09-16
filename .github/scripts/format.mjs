// Shared Markdown formatting helpers for the ren-automation PR comments —
// kept in one place so every bot comment (status, preview, merge) reads the
// same way instead of each script inventing its own layout.

export const ICON = {
  success: "✅",
  failure: "❌",
  crashed: "❌",
  timed_out: "❌",
  action_required: "❌",
  error: "❌",
  cancelled: "⚪",
  skipped: "⚪",
  neutral: "⚪",
  stale: "⚪",
  pending: "🟡",
  in_progress: "🟡",
  queued: "🟡",
  retrying: "🟠",
  waiting: "🟡",
};

export function iconFor(state) {
  return ICON[String(state).toLowerCase()] ?? "⚪";
}

// A GitHub-Flavored-Markdown table from an array of {label, value} pairs —
// used for the small "fact sheet" blocks (links, environment, credentials).
export function factTable(rows) {
  const body = rows.map(([label, value]) => `| ${label} | ${value} |`).join("\n");
  return `| | |\n|---|---|\n${body}`;
}

// A status table: columns are Check / Status / Detail, one row per item.
// `items`: [{ label, state, detail?, link? }]
export function statusTable(items) {
  const header = "| | Check | Status | Detail |\n|---|---|---|---|";
  const rows = items.map((item) => {
    const label = item.link ? `[${item.label}](${item.link})` : item.label;
    const detail = item.detail ?? "";
    return `| ${iconFor(item.state)} | ${label} | ${item.state} | ${detail} |`;
  });
  return [header, ...rows].join("\n");
}

// A collapsed <details> block for a log excerpt or long error — keeps the
// comment scannable while still making the full detail one click away.
export function collapsible(summary, body, { open = false } = {}) {
  return [
    `<details${open ? " open" : ""}>`,
    `<summary>${summary}</summary>`,
    "",
    body,
    "",
    "</details>",
  ].join("\n");
}

export function codeBlock(text, lang = "") {
  return `\`\`\`${lang}\n${text}\n\`\`\``;
}

export function logExcerpt(lines, { limit = 25 } = {}) {
  if (!lines?.length) return "_(no logs captured)_";
  return codeBlock(
    lines
      .slice(-limit)
      .map((l) => `[${l.severity ?? "info"}] ${l.message}`)
      .join("\n"),
  );
}

export function heading(text, level = 2) {
  return `${"#".repeat(level)} ${text}`;
}

export function mentionAll(handles) {
  return [...new Set(handles)].map((h) => `@${h.replace(/^@/, "")}`).join(" ");
}

export const BOT_NAME = "ren-automation";

export function footer(note) {
  return `<sub>${BOT_NAME}${note ? ` — ${note}` : ""}</sub>`;
}
