// Minimal in-memory GitHub Git Data API used by the optional storage tests.
// It enforces non-force fast-forward ref updates and records every request so
// tests can prove that secrets never enter URLs, state files or ref calls.
const decode = value => Uint8Array.from(Buffer.from(value, 'base64'));
const encode = bytes => Buffer.from(bytes).toString('base64');
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {'Content-Type': 'application/json'},
});

export function fakeGitHub({
  repo = 'zimukiv/gameProject',
  branch = 'roomlab-saves',
  statePath = 'roomlab-saves/state.json',
  initialFiles = [['roomlab-41-rooms.zip', new TextEncoder().encode('existing-zip-bytes')]],
} = {}) {
  let sequence = 0;
  const nextSha = () => (++sequence).toString(16).padStart(40, '0');
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  const refs = new Map([[branch, null]]);
  const calls = [];
  const refUpdates = [];
  let beforeRefUpdate = null;
  let failNext = null;

  const addBlob = bytes => {
    const sha = nextSha();
    blobs.set(sha, new Uint8Array(bytes));
    return sha;
  };
  const addTree = entries => {
    const sha = nextSha();
    trees.set(sha, new Map(entries));
    return sha;
  };
  const addCommit = (tree, parents) => {
    const sha = nextSha();
    commits.set(sha, {tree, parents});
    return sha;
  };
  const initialEntries = initialFiles.map(([path, bytes]) => [path, addBlob(bytes)]);
  const initialTree = addTree(initialEntries);
  const initialCommit = addCommit(initialTree, []);
  refs.set(branch, initialCommit);

  const isAncestor = (ancestor, descendant) => {
    if (!ancestor) return true;
    const stack = [descendant];
    const seen = new Set();
    while (stack.length) {
      const sha = stack.pop();
      if (!sha || seen.has(sha)) continue;
      seen.add(sha);
      if (sha === ancestor) return true;
      const commit = commits.get(sha);
      if (commit) stack.push(...commit.parents);
    }
    return false;
  };

  const currentTree = () => {
    const commit = commits.get(refs.get(branch));
    return trees.get(commit.tree);
  };

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    const headers = init.headers || {};
    calls.push({method, path: url.pathname, search: url.search, body, headers, url: url.href});

    if (url.origin !== 'https://api.github.com') return json({message: 'wrong origin'}, 400);
    const prefix = `/repos/${repo}/git/`;
    if (!String(headers.Authorization || '').startsWith('Bearer ')) {
      return json({message: 'missing token'}, 401);
    }
    if (failNext) {
      const failure = failNext;
      failNext = null;
      return json(failure.body || {message: 'upstream'}, failure.status || 500);
    }

    if (method === 'GET' && url.pathname === `${prefix}ref/heads/${branch}`) {
      const sha = refs.get(branch);
      return sha ? json({ref: `refs/heads/${branch}`, object: {sha}}) : json({message: 'not found'}, 404);
    }
    if (method === 'GET' && url.pathname.startsWith(`${prefix}commits/`)) {
      const sha = url.pathname.slice(`${prefix}commits/`.length);
      const commit = commits.get(sha);
      return commit
        ? json({sha, tree: {sha: commit.tree}, parents: commit.parents.map(parent => ({sha: parent}))})
        : json({message: 'not found'}, 404);
    }
    if (method === 'GET' && url.pathname.startsWith(`${prefix}trees/`)) {
      const sha = url.pathname.slice(`${prefix}trees/`.length);
      const tree = trees.get(sha);
      if (!tree) return json({message: 'not found'}, 404);
      return json({
        sha,
        tree: [...tree].map(([path, blob]) => ({path, mode: '100644', type: 'blob', sha: blob})),
      });
    }
    if (method === 'GET' && url.pathname.startsWith(`${prefix}blobs/`)) {
      const sha = url.pathname.slice(`${prefix}blobs/`.length);
      const bytes = blobs.get(sha);
      return bytes ? json({sha, content: encode(bytes), encoding: 'base64'}) : json({message: 'not found'}, 404);
    }
    if (method === 'POST' && url.pathname === `${prefix}blobs`) {
      if (body?.encoding !== 'base64' || typeof body.content !== 'string') return json({message: 'bad blob'}, 422);
      return json({sha: addBlob(decode(body.content))}, 201);
    }
    if (method === 'POST' && url.pathname === `${prefix}trees`) {
      if (!trees.has(body?.base_tree) || !Array.isArray(body.tree)) return json({message: 'bad tree'}, 422);
      const merged = new Map(trees.get(body.base_tree));
      for (const entry of body.tree) {
        if (entry.type !== 'blob' || !blobs.has(entry.sha) || typeof entry.path !== 'string') {
          return json({message: 'bad entry'}, 422);
        }
        merged.set(entry.path, entry.sha);
      }
      return json({sha: addTree(merged)}, 201);
    }
    if (method === 'POST' && url.pathname === `${prefix}commits`) {
      if (!trees.has(body?.tree) || !Array.isArray(body.parents)
        || body.parents.some(parent => !commits.has(parent))) return json({message: 'bad commit'}, 422);
      return json({sha: addCommit(body.tree, body.parents), tree: {sha: body.tree}}, 201);
    }
    if (method === 'PATCH' && url.pathname === `${prefix}refs/heads/${branch}`) {
      if (beforeRefUpdate) await beforeRefUpdate({sha: body?.sha, force: body?.force, refs});
      const current = refs.get(branch);
      refUpdates.push({sha: body?.sha, force: body?.force, current});
      if (body?.force !== false) return json({message: 'force updates are not allowed'}, 403);
      if (!commits.has(body?.sha)) return json({message: 'bad sha'}, 422);
      if (!isAncestor(current, body.sha)) return json({message: 'Update is not a fast forward'}, 422);
      refs.set(branch, body.sha);
      return json({ref: `refs/heads/${branch}`, object: {sha: body.sha}});
    }
    return json({message: `unhandled ${method} ${url.pathname}`}, 404);
  }

  return {
    fetch: fetchImpl,
    calls,
    refUpdates,
    repo,
    branch,
    statePath,
    head: () => refs.get(branch),
    commit: sha => commits.get(sha),
    file(path) {
      const tree = currentTree();
      const blob = tree?.get(path);
      return blob ? blobs.get(blob) : null;
    },
    files() {
      const tree = currentTree() || new Map();
      return new Map([...tree].map(([path, sha]) => [path, blobs.get(sha)]));
    },
    setBeforeRefUpdate(hook) { beforeRefUpdate = hook; },
    failNext(status, body) { failNext = {status, body}; },
    concurrentAdvance() {
      const current = refs.get(branch);
      const commit = commits.get(current);
      const tree = addTree(trees.get(commit.tree));
      const next = addCommit(tree, [current]);
      refs.set(branch, next);
      return next;
    },
  };
}
