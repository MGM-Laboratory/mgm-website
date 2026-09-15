// The /merge command's full flow, run from merge.yml. Everything here is
// API-driven — no PR code is ever checked out or executed, so this is safe
// to run with write access even against a fork PR.
//
// Order matters and is deliberately conservative: verify readiness first and
// bail out with nothing changed if it isn't; only after a successful merge
// do we touch the branch, the preview environment, or start watching
// production, so a failure partway through never leaves the PR merged with
// no record of what happened next.
import { collectChecks, ghRequest } from "./gh-api.mjs";
import { codeowners } from "./codeowners.mjs";
import { factTable, footer, heading, mentionAll, statusTable } from "./format.mjs";
import {
  API_SERVICE_ID,
  PRODUCTION_ENVIRONMENT_ID,
  WEB_SERVICE_ID,
  listServiceInstances,
  tearDownPreviewEnvironment,
} from "./railway-api.mjs";

const token = process.env.GITHUB_TOKEN; // contents:write + pull-requests:write
const botToken = process.env.BOT_TOKEN; // ren-automation identity, comments only
const railwayToken = process.env.RAILWAY_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const runUrl = process.env.RUN_URL;

const PASS_STATES = new Set(["success", "skipped", "neutral"]);
const PENDING_STATES = new Set(["pending", "in_progress", "queued"]);

const gh = (path, opts) => ghRequest(token, path, opts);
const reply = (body) =>
  ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

let pr = await gh(`/repos/${repo}/pulls/${prNumber}`);

if (pr.state !== "open") {
  console.log(`PR #${prNumber} is not open (state: ${pr.state}) — nothing to do.`);
  process.exit(0);
}

// mergeable is computed asynchronously by GitHub; give it one retry if it
// hasn't landed yet rather than treating "unknown" as "blocked".
if (pr.mergeable === null) {
  await new Promise((r) => setTimeout(r, 3000));
  pr = await gh(`/repos/${repo}/pulls/${prNumber}`);
}

const checks = await collectChecks(token, repo, pr.head.sha);
const failing = checks.filter((c) => !PASS_STATES.has(c.state) && !PENDING_STATES.has(c.state));
const pending = checks.filter((c) => PENDING_STATES.has(c.state));

const blockers = [];
if (!checks.length) blockers.push("No checks have reported against this commit yet.");
if (failing.length) blockers.push(`${failing.length} check(s) are failing.`);
if (pending.length) blockers.push(`${pending.length} check(s) are still running.`);
if (pr.mergeable === false) blockers.push("This PR has merge conflicts with `main`.");

if (blockers.length) {
  await reply(
    [
      heading("🚫 Not ready to merge yet", 3),
      "",
      blockers.map((b) => `- ${b}`).join("\n"),
      "",
      checks.length
        ? statusTable(checks.map((c) => ({ label: c.name, state: c.state, link: c.url })))
        : "",
      "",
      "Run `/merge` again once everything above is green.",
      "",
      footer(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
  process.exit(0);
}

// Captured before merging so the post-merge watcher can tell a genuinely new
// production deployment apart from the previous one still showing "SUCCESS".
const baseline = await listServiceInstances(railwayToken, PRODUCTION_ENVIRONMENT_ID);
const baselineDeploymentId = {
  [API_SERVICE_ID]: baseline.find((i) => i.serviceId === API_SERVICE_ID)?.latestDeployment?.id,
  [WEB_SERVICE_ID]: baseline.find((i) => i.serviceId === WEB_SERVICE_ID)?.latestDeployment?.id,
};

console.log("Ready to merge — posting the thank-you comment.");

const stats = factTable([
  ["Commits", pr.commits],
  ["Files changed", pr.changed_files],
  ["Lines", `+${pr.additions} / -${pr.deletions}`],
]);

await reply(
  [
    heading(`🎉 Thanks for the contribution, @${pr.user.login}!`, 2),
    "",
    `Everything checks out and this is good to go — merging **${pr.title}** into \`main\` now. Really appreciate you putting time into MGM Website, this kind of contribution is exactly what keeps the lab's site moving. 🙌`,
    "",
    stats,
    "",
    statusTable(checks.map((c) => ({ label: c.name, state: c.state, link: c.url }))),
    "",
    "![lgtm](https://media.giphy.com/media/bXUbgRzNwKSg3iJYrJ/giphy.gif)",
    "",
    footer(),
  ].join("\n"),
);

const mergeResult = await gh(`/repos/${repo}/pulls/${prNumber}/merge`, {
  method: "PUT",
  body: JSON.stringify({
    merge_method: "merge",
    commit_title: `${pr.title} (#${prNumber})`,
  }),
});
const mergeSha = mergeResult.sha;
console.log(`Merged as ${mergeSha}.`);

// Branch deletion: only when it's genuinely ours to delete and nothing else
// still needs it.
const sameRepo = pr.head.repo?.full_name === pr.base.repo.full_name;
const isDefaultBranch = pr.head.ref === pr.base.repo.default_branch;
let branchNote;
if (!sameRepo) {
  branchNote = "Left the branch alone — it lives in a fork, not this repo.";
} else if (isDefaultBranch) {
  branchNote = `Left \`${pr.head.ref}\` alone — it's the default branch.`;
} else {
  const otherOpenPrs = await gh(
    `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${pr.head.repo.owner.login}:${pr.head.ref}`)}`,
  );
  if (otherOpenPrs.length) {
    branchNote = `Left \`${pr.head.ref}\` alone — another open PR still points at it.`;
  } else {
    try {
      await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(pr.head.ref)}`, {
        method: "DELETE",
      });
      branchNote = `Deleted branch \`${pr.head.ref}\`.`;
    } catch (err) {
      branchNote = `Could not delete \`${pr.head.ref}\`: ${err.message}`;
    }
  }
}

// Preview teardown — scoped strictly to this PR's own environment via the
// shared helper (also used by /close and the pull_request_target teardown
// workflow), which asserts the resolved id against production defensively
// so a naming coincidence can never take down the real deployment.
let previewNote;
try {
  previewNote = (await tearDownPreviewEnvironment(railwayToken, prNumber)).note;
} catch (err) {
  previewNote = `Could not clean up the preview environment: ${err.message}`;
}

await reply(
  [heading("🧹 Cleanup", 3), "", `- ${branchNote}`, `- ${previewNote}`, "", footer()].join("\n"),
);

// Post-merge production verification. Railway's own deploy is triggered by
// its GitHub webhook independently of this workflow, so the signal to watch
// is the production service instances' latestDeployment, not an Actions run.
console.log("Watching post-merge CI and production deployment...");
const VERIFY_TIMEOUT_MS = 10 * 60 * 1000;
const verifyDeadline = Date.now() + VERIFY_TIMEOUT_MS;

// Only these two actually gate whether the push is "live" — E2E is a 7-job
// cross-browser matrix that routinely runs past this window, and Security
// scanning doesn't block a deploy either. Waiting on those here would make
// this step time out on essentially every real merge; they're still
// reported in the final table, just not waited on.
const GATING_WORKFLOWS = new Set(["CI", "Build and Push Docker Images"]);

async function waitForRuns() {
  let latest = [];
  while (Date.now() < verifyDeadline) {
    const { workflow_runs } = await gh(
      `/repos/${repo}/actions/runs?head_sha=${mergeSha}&per_page=20`,
    );
    latest = workflow_runs;
    const gating = workflow_runs.filter((r) => GATING_WORKFLOWS.has(r.name));
    if (gating.length && gating.every((r) => r.status === "completed")) {
      return { runs: workflow_runs, timedOut: false };
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  return { runs: latest, timedOut: true };
}

async function waitForProductionDeploys() {
  const terminal = new Set(["SUCCESS", "FAILED", "CRASHED", "REMOVED", "SKIPPED"]);
  while (Date.now() < verifyDeadline) {
    const instances = await listServiceInstances(railwayToken, PRODUCTION_ENVIRONMENT_ID);
    const api = instances.find((i) => i.serviceId === API_SERVICE_ID);
    const web = instances.find((i) => i.serviceId === WEB_SERVICE_ID);
    // A push to main re-deploys both services from source independently of
    // this workflow (Railway's own GitHub integration) — wait for a
    // deployment id different from the pre-merge baseline, not just "some
    // terminal status", or a still-running previous deploy reads as done.
    const apiIsNew = api?.latestDeployment?.id !== baselineDeploymentId[API_SERVICE_ID];
    const webIsNew = web?.latestDeployment?.id !== baselineDeploymentId[WEB_SERVICE_ID];
    const apiStatus = apiIsNew ? api?.latestDeployment?.status : "pending";
    const webStatus = webIsNew ? web?.latestDeployment?.status : "pending";
    if (terminal.has(apiStatus) && terminal.has(webStatus)) {
      return { apiStatus, webStatus };
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  return null;
}

const [{ runs, timedOut }, deploys] = await Promise.all([
  waitForRuns(),
  waitForProductionDeploys(),
]);

const runItems = runs.map((r) => ({
  label: GATING_WORKFLOWS.has(r.name) ? r.name : `${r.name} (non-blocking)`,
  state: r.status === "completed" ? (r.conclusion ?? "neutral") : "in_progress",
  link: r.html_url,
}));
const deployItems = deploys
  ? [
      { label: "Railway — api", state: deploys.apiStatus },
      { label: "Railway — web", state: deploys.webStatus },
    ]
  : [
      { label: "Railway — api", state: "unknown (timed out watching)" },
      { label: "Railway — web", state: "unknown (timed out watching)" },
    ];

const allItems = [...runItems, ...deployItems];
// Only the gating workflows and the Railway deploys themselves can fail this
// check — E2E/Security rows are informational and reported either way.
const blockingItems = allItems.filter(
  (i) => GATING_WORKFLOWS.has(i.label) || i.label.startsWith("Railway — "),
);
const anyFailed =
  (timedOut && runItems.some((i) => GATING_WORKFLOWS.has(i.label) && i.state === "in_progress")) ||
  blockingItems.some(
    (i) => !PASS_STATES.has(i.state) && i.state !== "SUCCESS" && i.state !== "in_progress",
  );

const owners = codeowners();
await reply(
  [
    heading(anyFailed ? "⚠️ Production deploy needs attention" : "✅ Live on production", 3),
    "",
    `Merge commit: [\`${mergeSha.slice(0, 7)}\`](${runUrl ?? `https://github.com/${repo}/commit/${mergeSha}`})`,
    "",
    statusTable(allItems),
    "",
    anyFailed
      ? `${owners.length ? mentionAll(owners) : "A maintainer"} — something above didn't come back clean, please take a look.`
      : "Everything shipped with no errors. 🎉",
    "",
    footer(),
  ].join("\n"),
);

if (anyFailed) {
  throw new Error("Post-merge verification found a failing or unresolved check/deployment.");
}
