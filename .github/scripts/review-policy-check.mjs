// The "Review policy" required check (review-policy.yml): fails a pull
// request whose author isn't a code owner until a code owner approves its
// latest commit. It makes the policy hold on every merge path, not just
// /merge (which checks the same rule before merging, see pr-merge.mjs).
// Runs from the base branch's copy, so a pull request can't edit its own gate.
import { ghRequest } from "./gh-api.mjs";
import { codeowners } from "./codeowners.mjs";
import { reviewGate } from "./review-policy.mjs";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;

const pr = await ghRequest(token, `/repos/${repo}/pulls/${prNumber}`);
const reviews = await ghRequest(token, `/repos/${repo}/pulls/${prNumber}/reviews?per_page=100`);
const result = reviewGate({
  author: pr.user.login,
  owners: codeowners(),
  reviews,
  headSha: pr.head.sha,
});

if (result.ok) {
  console.log(`Review policy satisfied for #${prNumber} (author @${pr.user.login}).`);
} else {
  console.log(`::error::${result.reason}`);
  process.exit(1);
}
