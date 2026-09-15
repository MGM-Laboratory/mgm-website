import { ghRequest } from "./gh-api.mjs";
import { codeowners } from "./codeowners.mjs";

const actionsToken = process.env.GITHUB_TOKEN; // default token — actions:write only
const botToken = process.env.BOT_TOKEN; // ren-automation installation token — comments only
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const author = process.env.COMMENT_AUTHOR;
const association = process.env.COMMENT_ASSOCIATION;
const body = (process.env.COMMENT_BODY ?? "").trim();

const PRIVILEGED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const isPrivileged = (login, assoc) =>
  PRIVILEGED.has(assoc) || codeowners().some((h) => h.toLowerCase() === login.toLowerCase());

const reply = (text) =>
  ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: text }),
  });

const normalized = body.toLowerCase();

// Bare "lgtm" is deliberately harmless — it's the single most common
// throwaway phrase in code review, so it only ever posts a GIF. The actual
// merge-and-ship action lives behind the explicit /merge command below so a
// casual "lgtm" left in conversation can never ship anything to production.
if (normalized === "lgtm") {
  await reply("![lgtm](https://media.giphy.com/media/bXUbgRzNwKSg3iJYrJ/giphy.gif)");
  process.exit(0);
}

if (!["/check", "/preview", "/merge"].includes(normalized)) {
  process.exit(0); // not a command we handle
}

if (!isPrivileged(author, association)) {
  await reply(`@${author} only maintainers or CODEOWNERS can run \`${normalized}\`.`);
  process.exit(0);
}

if (normalized === "/check") {
  const pr = await ghRequest(actionsToken, `/repos/${repo}/pulls/${prNumber}`);
  const sha = pr.head.sha;

  const runs = await ghRequest(
    actionsToken,
    `/repos/${repo}/actions/runs?head_sha=${sha}&per_page=30`,
  );
  const latestByWorkflow = new Map();
  for (const run of runs.workflow_runs) {
    const current = latestByWorkflow.get(run.workflow_id);
    if (!current || run.run_number > current.run_number) latestByWorkflow.set(run.workflow_id, run);
  }

  await Promise.all(
    [...latestByWorkflow.values()].map((run) =>
      ghRequest(actionsToken, `/repos/${repo}/actions/runs/${run.id}/rerun`, {
        method: "POST",
      }).catch(
        () => null, // a run that can't be rerun (e.g. still in progress) isn't fatal
      ),
    ),
  );

  await reply(`Re-running checks for \`${sha.slice(0, 7)}\`.`);
}

if (normalized === "/preview") {
  await ghRequest(actionsToken, `/repos/${repo}/actions/workflows/preview.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { pr_number: String(prNumber) } }),
  });
  await reply(
    "Starting a preview deploy — takes a few minutes, I'll drop the link here when it's up.",
  );
}

if (normalized === "/merge") {
  await ghRequest(actionsToken, `/repos/${repo}/actions/workflows/merge.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { pr_number: String(prNumber) } }),
  });
  await reply("Checking that everything's ready to ship...");
}
