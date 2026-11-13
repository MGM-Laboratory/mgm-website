// The rules for the commit messages of a pull request, checked by .github/workflows/commits.yaml
export default {
  extends: ["@commitlint/config-conventional"],
  // The default ignores let a message that starts with Merge, Revert, fixup! or squash! skip every rule. Only the merge of the
  // base branch that GitHub writes for "Update branch" is allowed through.
  defaultIgnores: false,
  ignores: [(message) => /^Merge branch 'main' into \S+(\r?\n|$)/.test(message)],
  rules: {
    // Renovate writes long lines in the body and the footer, and the summary is the whole message of the rest
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "footer-leading-blank": [0],
    "header-max-length": [2, "always", 120],
  },
};
