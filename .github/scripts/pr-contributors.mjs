import { ghPaginate, ghRequest, collectPullRequestContributorLogins } from "./gh-api.mjs";
import { factTable, footer } from "./format.mjs";
import { LGTM_GIF } from "./pr-comments.mjs";

export async function collectContributors(token, repo, pr) {
  // The PR commits endpoint stops at 250. Paginated compare has no such cap.
  const commits = await ghPaginate(
    token,
    `/repos/${repo}/compare/${pr.base.sha}...${pr.head.sha}`,
    "commits",
  );
  if (commits.length !== pr.commits)
    throw new Error("PR commit range changed or is incomplete; retry against the current PR");
  for (const commit of commits) {
    if (!/^co-authored-by:/im.test(commit.commit.message)) continue;
    commit.coauthors = [];
    let after = null;
    do {
      const response = await ghRequest(token, "/graphql", {
        method: "POST",
        body: JSON.stringify({
          query: `query($id: ID!, $after: String) {
            node(id: $id) { ... on Commit {
              authors(first: 100, after: $after) {
                nodes { name user { login } }
                pageInfo { hasNextPage endCursor }
              }
            } }
          }`,
          variables: { id: commit.node_id, after },
        }),
      });
      if (response.errors?.length || !response.data?.node?.authors)
        throw new Error("Could not resolve commit co-authors");
      const authors = response.data.node.authors;
      commit.coauthors.push(...authors.nodes);
      after = authors.pageInfo.hasNextPage ? authors.pageInfo.endCursor : null;
    } while (after);
  }
  const logins = collectPullRequestContributorLogins(commits, pr.user?.login);
  const unlinked = [
    ...new Set(
      commits
        .flatMap((commit) => [
          ...(!commit.author?.login ? [commit.commit.author?.name] : []),
          ...(commit.coauthors ?? []).filter((a) => !a.user?.login).map((a) => a.name),
        ])
        .filter(Boolean),
    ),
  ];
  return { logins, unlinked };
}

const escapeText = (value) =>
  String(value)
    .replace(/[\\`*_{}\[\]<>()@!|#]/g, "\\$&")
    .replace(/[\r\n]/g, " ");

export function thankYouBody(pr, contributors, { preview = false } = {}) {
  return [
    preview ? "## Merge thank-you preview (no merge performed)" : "## 🎉 Thank you, contributors!",
    "",
    `Thank you ${contributors.logins.map((login) => `@${login}`).join(" ")} for contributing to MGM Website! 🙌`,
    contributors.unlinked.length
      ? `Also credited in the commits: ${contributors.unlinked.map(escapeText).join(", ")}. These authors have no linked GitHub account to tag.`
      : "",
    "",
    preview
      ? `This is a test of the thank-you for PR #${pr.number}.`
      : `Merged **${escapeText(pr.title)}** into \`${pr.base.ref}\`.`,
    "",
    factTable([
      ["Commits", pr.commits],
      ["Files changed", pr.changed_files],
      ["Lines", `+${pr.additions} / -${pr.deletions}`],
    ]),
    "",
    LGTM_GIF,
    "",
    footer(),
  ].join("\n");
}
