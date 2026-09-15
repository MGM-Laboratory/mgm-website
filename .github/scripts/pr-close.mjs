// The /close command's full flow, run from close.yml. Closes the PR without
// merging and without touching the branch, then sweeps whatever preview
// environment was created for it — the same safe, production-asserted
// teardown /merge and the pull_request_target teardown workflow use.
import { ghRequest } from "./gh-api.mjs";
import { footer, heading } from "./format.mjs";
import { tearDownPreviewEnvironment } from "./railway-api.mjs";

const token = process.env.GITHUB_TOKEN; // pull-requests:write
const botToken = process.env.BOT_TOKEN; // ren-automation identity, comments only
const railwayToken = process.env.RAILWAY_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;

const gh = (path, opts) => ghRequest(token, path, opts);
const reply = (body) =>
  ghRequest(botToken, `/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

const pr = await gh(`/repos/${repo}/pulls/${prNumber}`);

if (pr.state !== "open") {
  console.log(`PR #${prNumber} is not open (state: ${pr.state}) — nothing to do.`);
  process.exit(0);
}

console.log(`Closing PR #${prNumber} without merging...`);
await gh(`/repos/${repo}/pulls/${prNumber}`, {
  method: "PATCH",
  body: JSON.stringify({ state: "closed" }),
});

let previewNote;
try {
  previewNote = (await tearDownPreviewEnvironment(railwayToken, prNumber)).note;
} catch (err) {
  previewNote = `Could not clean up the preview environment: ${err.message}`;
}

await reply(
  [
    heading("🚪 Closed without merging", 3),
    "",
    `\`${pr.head.ref}\` was **not** merged into \`${pr.base.ref}\` and the branch is left in place — reopen this PR any time to pick it back up.`,
    "",
    `- ${previewNote}`,
    "",
    footer(),
  ].join("\n"),
);

console.log("Done.");
