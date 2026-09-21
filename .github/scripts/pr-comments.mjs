import { ghPaginate, ghRequest } from "./gh-api.mjs";

export const LGTM_GIF = "![LGTM](https://media.giphy.com/media/bXUbgRzNwKSg3iJYrJ/giphy.gif)";
// A bare "lgtm" — with the light formatting reviewers actually use (bold,
// underscores, a quote prefix, trailing punctuation or a common emoji), but
// nothing else: no surrounding prose, no fenced code, no command on the side.
export const isLgtm = (body) =>
  /^\s*(?:>\s*)?(?:\*\*|__)?lgtm[!.]?(?:\*\*|__)?(?:\s*(?:👍|👌|🚀|👏|✅|🙌|❤️|💯|🙏))*\s*$/iu.test(
    body ?? "",
  );
export const isBotComment = (comment) =>
  ["ren-automation[bot]", "github-actions[bot]"].includes(comment.user?.login);

// Match both the marker and the author so a contributor cannot spoof the
// marker and make us overwrite their comment or suppress a bot reply.
export async function upsertComment(token, repo, prNumber, marker, body) {
  const comments = await ghPaginate(token, `/repos/${repo}/issues/${prNumber}/comments`);
  const existing = comments.find((c) => isBotComment(c) && c.body?.includes(marker));
  return ghRequest(
    token,
    existing
      ? `/repos/${repo}/issues/comments/${existing.id}`
      : `/repos/${repo}/issues/${prNumber}/comments`,
    {
      method: existing ? "PATCH" : "POST",
      body: JSON.stringify({ body: `${marker}\n${body}` }),
    },
  );
}

export async function replyReliably(token, fallbackToken, repo, prNumber, marker, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await upsertComment(token, repo, prNumber, marker, body);
    } catch (error) {
      console.warn(`PR comment attempt ${attempt + 1} failed: ${error.message}`);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  if (!fallbackToken || fallbackToken === token)
    throw new Error("Could not publish the PR comment");
  console.warn(
    "Using github-actions identity because ren-automation could not publish the comment",
  );
  return upsertComment(fallbackToken, repo, prNumber, marker, body);
}
