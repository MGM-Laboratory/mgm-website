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
import { collectContributors, thankYouBody } from "./pr-contributors.mjs";
import { replyReliably } from "./pr-comments.mjs";
import { codeowners } from "./codeowners.mjs";
import { footer, heading, mentionAll, statusTable } from "./format.mjs";
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
const gh = (path, opts) => ghRequest(token, path, opts);
const reply = (body, phase = "readiness") =>
  replyReliably(botToken, token, repo, prNumber, `<!-- ren-automation:merge:${phase} -->`, body);

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
let rules = [];
try {
  // Ruleset inspection needs repository administration:read, which the
  // ren-automation installation does not grant, so this usually fails and
  // warns. That's fine: GitHub's merge endpoint remains the final authority
  // and will return the protected-branch reason if a required check is
  // missing, so the pre-check below only ever gets the richer detail when
  // the token happens to have the permission.
  rules = await ghRequest(
    botToken,
    `/repos/${repo}/rules/branches/${encodeURIComponent(pr.base.ref)}`,
  );
} catch (error) {
  console.warn(`Could not read branch ruleset; GitHub will enforce it on merge: ${error.message}`);
}
const required = rules
  .filter((rule) => rule.type === "required_status_checks")
  .flatMap((rule) => rule.parameters.required_status_checks);
const unsatisfied = required.filter(
  (rule) =>
    !checks.some(
      (check) =>
        check.name === rule.context &&
        (!rule.integration_id || check.appId === rule.integration_id) &&
        PASS_STATES.has(check.state),
    ),
);

const blockers = [];
if (!checks.length) blockers.push("No checks have reported against this commit yet.");
if (unsatisfied.length)
  blockers.push(
    `Required checks missing, running, or failing: ${unsatisfied.map((r) => r.context).join(", ")}.`,
  );
if (pr.mergeable === false) blockers.push("This PR has merge conflicts with `main`.");
if (pr.mergeable === null) blockers.push("GitHub has not finished computing merge readiness.");
if (pr.draft) blockers.push("This PR is still a draft.");
if (pr.base.ref !== "main")
  blockers.push("Only pull requests targeting main can be merged by this command.");
if (["blocked", "behind", "unknown"].includes(pr.mergeable_state))
  blockers.push(
    `GitHub reports ${pr.mergeable_state}: check approvals, unresolved reviews, signatures, and whether the branch is up to date.`,
  );

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

const contributors = await collectContributors(token, repo, pr);

// Captured before merging so the post-merge watcher can tell a genuinely new
// production deployment apart from the previous one still showing "SUCCESS".
const baseline = await listServiceInstances(railwayToken, PRODUCTION_ENVIRONMENT_ID);
const baselineDeploymentId = {
  [API_SERVICE_ID]: baseline.find((i) => i.serviceId === API_SERVICE_ID)?.latestDeployment?.id,
  [WEB_SERVICE_ID]: baseline.find((i) => i.serviceId === WEB_SERVICE_ID)?.latestDeployment?.id,
};

await reply(
  `Required checks passed for \`${pr.head.sha.slice(0, 7)}\`. Asking GitHub to merge PR #${prNumber}.`,
);
let mergeResult;
try {
  mergeResult = await gh(`/repos/${repo}/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({
      merge_method: "merge",
      sha: pr.head.sha,
      commit_title: `${pr.title} (#${prNumber})`,
    }),
  });
  if (!mergeResult.merged) throw new Error(mergeResult.message ?? "GitHub did not merge the PR");
} catch (error) {
  await reply(
    `GitHub refused the merge: ${error.message}\n\nResolve the blocker and run \`/merge\` again.`,
  );
  throw error;
}
const mergeSha = mergeResult.sha;
console.log(`Merged as ${mergeSha}.`);
await reply(thankYouBody(pr, contributors), "thanks");

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
  "cleanup",
);

// Post-merge production verification. Railway's own deploy is triggered by
// its GitHub webhook independently of this workflow, so the signal to watch
// is the production service instances' latestDeployment, not an Actions run.
//
// CI and Docker publish are NOT re-watched by searching for a push-triggered
// run on mergeSha — confirmed live that one never appears. A push made by
// the Actions-provided GITHUB_TOKEN (which is what merges this PR) does not
// cascade-trigger other workflows — a deliberate GitHub Actions anti-loop
// rule, undocumented consequence: the "watch CI on the merge commit" this
// used to attempt silently found zero runs, and the report below used to
// paper over that by finding nothing to mark as failed. Dispatching them
// explicitly (workflow_dispatch via the API is not the suppressed path)
// gets them running against the merge commit for the record, without
// pretending this step waited on and verified their result — Railway's own
// deployment status is the one thing here that's actually watched to
// completion, and it's what "deployed with no error" really depends on.
console.log("Dispatching CI and Docker publish against the merge commit...");
const DISPATCHED_WORKFLOWS = [
  { file: "ci.yaml", label: "CI" },
  { file: "security.yaml", label: "Security" },
  { file: "e2e.yaml", label: "E2E" },
  { file: "vale.yaml", label: "Vale" },
  { file: "publish-docker-image-latest.yml", label: "Publish Docker Images (latest)" },
];
const dispatched = await Promise.all(
  DISPATCHED_WORKFLOWS.map(async (wf) => {
    try {
      await gh(`/repos/${repo}/actions/workflows/${wf.file}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: "main" }),
      });
      return { ...wf, ok: true };
    } catch (err) {
      return { ...wf, ok: false, error: err.message };
    }
  }),
);

console.log("Watching post-merge production deployment...");
const VERIFY_TIMEOUT_MS = 10 * 60 * 1000;
const verifyDeadline = Date.now() + VERIFY_TIMEOUT_MS;

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

const deploys = await waitForProductionDeploys();

const dispatchItems = dispatched.map((d) => ({
  label: `${d.label} (dispatched against main, not waited on here)`,
  state: d.ok ? "queued" : "error",
  detail: d.ok ? "" : d.error,
  link: `https://github.com/${repo}/actions/workflows/${d.file}`,
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

const allItems = [...dispatchItems, ...deployItems];
// Only the Railway deploys are actually watched to completion here, so
// they're the only thing that can fail this check.
const anyFailed = deployItems.some((i) => i.state !== "SUCCESS");

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
  "production",
);

if (anyFailed) {
  throw new Error("Post-merge verification found a failing or unresolved check/deployment.");
}
