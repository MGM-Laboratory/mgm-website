import { readFileSync } from "node:fs";
import { ghPaginate } from "./gh-api.mjs";
import { isBotComment, isLgtm, LGTM_GIF, upsertComment } from "./pr-comments.mjs";

const { GITHUB_TOKEN: token, BOT_TOKEN: botToken, REPO: repo } = process.env;
const run = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")).workflow_run;
// No artifacts, caches, scripts, or refs from the triggering run are used.
// The run is only a signal to query genuine reviews through GitHub's API.
const prs = await ghPaginate(token, `/repos/${repo}/commits/${run.head_sha}/pulls`);
for (const pr of prs.filter((pr) => pr.state === "open" && pr.base.ref === "main")) {
  const reviews = await ghPaginate(token, `/repos/${repo}/pulls/${pr.number}/reviews`);
  const comments = await ghPaginate(token, `/repos/${repo}/issues/${pr.number}/comments`);
  for (const review of reviews) {
    if (
      review.user.type === "Bot" ||
      !["APPROVED", "COMMENTED"].includes(review.state) ||
      !isLgtm(review.body)
    )
      continue;
    const marker = `<!-- ren-automation:lgtm:review-${review.id} -->`;
    if (comments.some((c) => isBotComment(c) && c.body?.includes(marker))) continue;
    await upsertComment(
      botToken,
      repo,
      pr.number,
      marker,
      `[LGTM review](${review.html_url})\n\n${LGTM_GIF}`,
    );
  }
}
