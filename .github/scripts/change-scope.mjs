// One conservative file-to-workload policy shared by all CI callers.
export const SCOPES = [
  "api",
  "web",
  "e2e",
  "lighthouse",
  "prose",
  "dependencies",
  "codeql",
  "trivy",
  "docker_api",
  "docker_web",
  "automation",
];

export function classifyChanges(files, { force = false } = {}) {
  const scope = Object.fromEntries(SCOPES.map((name) => [name, force]));
  const enable = (...names) =>
    names.forEach((name) => {
      scope[name] = true;
    });
  const app = (name) => enable(name, "codeql", "trivy", `docker_${name}`);
  for (const file of files) {
    if (file.endsWith(".md") || file.startsWith("docs/") || file === "LICENSE") {
      enable("prose");
      continue;
    }
    if (
      file === ".vale.ini" ||
      file.startsWith(".github/vale/") ||
      file === ".github/workflows/vale.yaml"
    ) {
      enable("prose");
      continue;
    }
    if (
      /^(pnpm-lock.yaml|pnpm-workspace.yaml|package.json|\.npmrc|\.nvmrc|turbo.json|tsconfig.*\.json)$/.test(
        file,
      ) ||
      file.startsWith("packages/")
    ) {
      enable(
        "api",
        "web",
        "e2e",
        "lighthouse",
        "dependencies",
        "codeql",
        "trivy",
        "docker_api",
        "docker_web",
      );
      continue;
    }
    if (file.startsWith("apps/api/")) {
      app("api");
      if (/package.json$/.test(file)) enable("dependencies");
      continue;
    }
    if (file.startsWith("apps/web/")) {
      if (file.startsWith("apps/web/e2e/") || file.includes("playwright.config")) {
        enable("e2e");
        continue;
      }
      app("web");
      enable("e2e", "lighthouse");
      if (/package.json$/.test(file)) enable("dependencies");
      continue;
    }
    if (file === ".lighthouserc.json") {
      enable("lighthouse");
      continue;
    }
    if (file === ".dockerignore" || /^docker-compose|^compose\./.test(file)) {
      enable("docker_api", "docker_web", "trivy");
      continue;
    }
    if (/^\.github\/scripts\//.test(file)) {
      enable("automation", "codeql", "trivy");
      continue;
    }
    if (/^\.github\/workflows\//.test(file)) {
      enable("automation", "trivy", "dependencies");
      const name = file.split("/").at(-1);
      if (["ci.yaml", "detect-changes.yml"].includes(name)) enable(...SCOPES);
      if (name === "e2e.yaml") enable("e2e");
      if (name === "lighthouse.yaml") enable("lighthouse");
      if (name === "security.yaml") enable("codeql");
      if (name.startsWith("publish-docker-image")) enable("docker_api", "docker_web");
      continue;
    }
    if (/^\.(prettier|editorconfig|pre-commit)/.test(file) || file.startsWith(".husky/")) {
      enable("automation");
      continue;
    }
    if (
      file === "CODEOWNERS" ||
      file === "renovate.json" ||
      /^\.(github|gitleaks|deepsource|coderabbit|sonar)/.test(file)
    ) {
      enable("automation", "trivy");
      continue;
    }
    // Unknown paths are never silently treated as documentation.
    enable(...SCOPES);
  }
  return scope;
}
