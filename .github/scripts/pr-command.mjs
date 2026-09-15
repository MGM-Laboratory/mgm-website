import { ghRequest } from "./gh-api.mjs";

const actionsToken = process.env.GITHUB_TOKEN; // default token — actions:write only
const botToken = process.env.BOT_TOKEN; // Ren's Automation installation token — comments only
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const author = process.env.COMMENT_AUTHOR;
const association = process.env.COMMENT_ASSOCIATION;
const body = (process.env.COMMENT_BODY ?? "").trim();

const PRIVILEGED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

const reply = (text) =>
  ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: text }),
  });

const normalized = body.toLowerCase();

if (normalized === "lgtm") {
  await reply("![lgtm](https://media.giphy.com/media/bXUbgRzNwKSg3iJYrJ/giphy.gif)");
  process.exit(0);
}

if (normalized === "ptal") {
  await reply("![ptal](https://media.giphy.com/media/wszFBsXrP2pFk6zVG4/giphy.gif)");
  process.exit(0);
}

if (normalized !== "/check" && normalized !== "/preview") {
  process.exit(0); // not a command we handle
}

if (!PRIVILEGED.has(association)) {
  await reply(`@${author} only maintainers can run \`${normalized}\`.`);
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
      ghRequest(actionsToken, `/repos/${repo}/actions/runs/${run.id}/rerun`, { method: "POST" }).catch(
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
  await reply("Starting a preview deploy — takes a few minutes, I'll drop the link here when it's up.");
}
