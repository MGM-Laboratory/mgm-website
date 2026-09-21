import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { collectContributors, thankYouBody } from "./pr-contributors.mjs";
import { isLgtm, upsertComment } from "./pr-comments.mjs";

test("LGTM accepts comments and formatted reviews without interpreting conversation as a command", () => {
  for (const body of ["LGTM", "lgtm!", "  **LGTM**\n", "__lgtm.__"])
    assert.equal(isLgtm(body), true);
  for (const body of [null, "LGTM /merge", "not LGTM", "```LGTM```", "LGTM\n/merge"])
    assert.equal(isLgtm(body), false);
});

test("contributors beyond 250 commits and co-authors are all credited without tagging the web committer", async (t) => {
  const commits = Array.from({ length: 301 }, (_, i) => ({
    node_id: `commit-${i}`,
    author: { login: i === 300 ? "last-author" : "first-author" },
    committer: { login: "web-flow" },
    commit: {
      message: i === 300 ? "Change\nCo-authored-by: Co Author <private@example.com>" : "Change",
    },
  }));
  const pages = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/graphql") {
      const { variables } = JSON.parse(options.body);
      assert.equal(variables.id, "commit-300");
      return Response.json({
        data: {
          node: {
            authors: {
              nodes: variables.after
                ? [{ name: "Unlinked Person", user: null }]
                : [{ name: "Co Author", user: { login: "coauthor" } }],
              pageInfo: variables.after
                ? { hasNextPage: false }
                : { hasNextPage: true, endCursor: "next" },
            },
          },
        },
      });
    }
    assert.match(parsed.pathname, /compare\/base\.\.\.head$/);
    const page = Number(parsed.searchParams.get("page"));
    pages.push(page);
    return Response.json({ commits: commits.slice((page - 1) * 100, page * 100) });
  });
  const result = await collectContributors("token", "org/repo", {
    commits: 301,
    base: { sha: "base" },
    head: { sha: "head" },
    user: { login: "opener" },
  });
  assert.deepEqual(pages, [1, 2, 3, 4]);
  assert.deepEqual(result.logins, ["first-author", "last-author", "coauthor", "opener"]);
  assert.deepEqual(result.unlinked, ["Unlinked Person"]);
  const body = thankYouBody(
    { number: 1, title: "Change", base: { ref: "main" }, commits: 301 },
    result,
  );
  for (const login of result.logins) assert.ok(body.includes(`@${login}`));
  assert.ok(!body.includes("private@example.com"));
});

test("comment upsert ignores spoofed markers and finds a bot comment after the first page", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (options.method === "PATCH") return Response.json({ id: 101 });
    const page = new URL(url).searchParams.get("page");
    return Response.json(
      page === "1"
        ? Array.from({ length: 100 }, () => ({
            id: 1,
            user: { login: "contributor" },
            body: "<!-- marker -->",
          }))
        : [{ id: 101, user: { login: "ren-automation[bot]" }, body: "<!-- marker -->" }],
    );
  });
  await upsertComment("token", "org/repo", 1, "<!-- marker -->", "Current message");
  assert.equal(requests.at(-1).options.method, "PATCH");
  assert.ok(requests.at(-1).url.endsWith("/issues/comments/101"));
});

test("merge sends the checked SHA and thanks only after a confirmed merge", () => {
  for (const merged of [false, true]) {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      const calls = [];
      const pr = { number: 1, state: 'open', mergeable: true, mergeable_state: 'clean', commits: 1,
        title: 'Change', user: {login:'author'}, head: {sha:'head',ref:'feature',repo:{full_name:'fork/repo'}},
        base: {sha:'base',ref:'main',repo:{full_name:'org/repo',default_branch:'main'}} };
      globalThis.fetch = async (url, opts = {}) => {
        const path = new URL(url).pathname;
        const body = opts.body ? JSON.parse(opts.body) : {};
        calls.push({path,method:opts.method,body});
        if (path.endsWith('/pulls/1')) return Response.json(pr);
        if (path.endsWith('/check-runs')) return Response.json({check_runs:[{id:1,name:'CI',app:{id:15368},status:'completed',conclusion:'success'}]});
        if (path.endsWith('/statuses')) return Response.json([]);
        if (path.endsWith('/rules/branches/main')) return Response.json([{type:'required_status_checks',parameters:{required_status_checks:[{context:'CI',integration_id:15368}]}}]);
        if (path.includes('/compare/')) return Response.json({commits:[{author:{login:'author'},commit:{message:'Change'}}]});
        if (path.endsWith('/comments')) return Response.json(opts.method === 'POST' ? {id:10} : []);
        if (path.endsWith('/merge')) return Response.json({merged:${merged},sha:'merge-sha',message:'blocked'});
        if (url.includes('railway.com')) {
          if (body.query.includes('environments')) return Response.json({data:{project:{environments:{edges:[]}}}});
          return Response.json({data:{environment:{serviceInstances:{edges:[
            {node:{serviceId:'b401b859-90cb-44cf-9787-054cc14290fd',latestDeployment:{id: calls.length,status:'SUCCESS'}}},
            {node:{serviceId:'4969778e-0bff-4200-9472-6b5a13f037da',latestDeployment:{id: calls.length,status:'SUCCESS'}}}
          ]}}}});
        }
        if (path.endsWith('/dispatches')) return new Response(null,{status:204});
        throw new Error('Unexpected request: '+url);
      };
      try { await import('./.github/scripts/pr-merge.mjs'); } catch (error) { console.log(error.message); }
      const merge = calls.findIndex(c=>c.path.endsWith('/merge'));
      if(calls[merge].body.sha !== 'head') throw Error('merge not pinned');
      const thanks = calls.findIndex(c=>c.body.body?.includes('Thank you, contributors!'));
      if (${merged} ? thanks <= merge : thanks !== -1) throw Error('incorrect thank-you ordering');
      console.log('validated');
    `,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GITHUB_TOKEN: "test",
          BOT_TOKEN: "bot",
          REPO: "org/repo",
          PR_NUMBER: "1",
        },
        encoding: "utf8",
      },
    );
    assert.match(output, /validated/);
  }
});
