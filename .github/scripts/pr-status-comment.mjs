import { collectChecks, ghRequest } from "./gh-api.mjs";
import { footer, heading, statusTable } from "./format.mjs";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.REPO;
const prNumber = process.env.PR_NUMBER;
const sha = process.env.HEAD_SHA;

const MARKER = "<!-- ren-automation:status -->";

const items = await collectChecks(token, repo, sha);
items.sort((a, b) => a.name.localeCompare(b.name));

const body = [
  MARKER,
  heading(`Checks for \`${sha.slice(0, 7)}\``, 3),
  "",
  items.length
    ? statusTable(items.map((i) => ({ label: i.name, state: i.state, link: i.url })))
    : "_(no checks reported yet)_",
  "",
  footer(),
].join("\n");

const comments = await ghRequest(token, `/repos/${repo}/issues/${prNumber}/comments?per_page=100`);
const existing = comments.find((c) => c.body?.includes(MARKER));

if (existing) {
  await ghRequest(token, `/repos/${repo}/issues/comments/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
} else {
  await ghRequest(token, `/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
