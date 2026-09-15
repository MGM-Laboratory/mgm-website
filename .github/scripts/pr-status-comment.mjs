import { ghRequest } from "./gh-api.mjs";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const sha = process.env.HEAD_SHA;

const MARKER = "<!-- ren-automation:status -->";

const STATE_ICON = {
  success: "✅",
  failure: "❌",
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
};

function iconFor(state) {
  return STATE_ICON[state] ?? "⚪";
}

const gh = (path, opts) => ghRequest(token, path, opts);

const [checkRuns, combinedStatus] = await Promise.all([
  gh(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`),
  gh(`/repos/${repo}/commits/${sha}/status`),
]);

const seen = new Set();
const lines = [];

for (const c of checkRuns.check_runs) {
  if (seen.has(c.name)) continue;
  seen.add(c.name);
  const state = c.status === "completed" ? (c.conclusion ?? "neutral") : c.status;
  lines.push(`- ${iconFor(state)} [${c.name}](${c.html_url ?? c.details_url ?? "#"})`);
}

for (const s of combinedStatus.statuses) {
  if (seen.has(s.context)) continue;
  seen.add(s.context);
  lines.push(`- ${iconFor(s.state)} [${s.context}](${s.target_url ?? "#"})`);
}

lines.sort();

const body = [
  MARKER,
  `**ren-automation** — checks for \`${sha.slice(0, 7)}\``,
  "",
  ...(lines.length ? lines : ["- (no checks reported yet)"]),
].join("\n");

const comments = await gh(`/repos/${repo}/issues/${prNumber}/comments?per_page=100`);
const existing = comments.find((c) => c.body?.includes(MARKER));

if (existing) {
  await gh(`/repos/${repo}/issues/comments/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
} else {
  await gh(`/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
