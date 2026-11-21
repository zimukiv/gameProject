import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubStorage, githubStorageConfig, githubStorageFor} from '../lib/github-storage.mjs';
import {handle} from '../lib/sync-handler.mjs';
import {canonical, sha256} from '../lib/revision-manifest.mjs';
import {fakeGitHub} from './github-fake.mjs';

const KEY = 'A'.repeat(43);
const WORKSPACE = await sha256(new TextEncoder().encode(KEY));
const OTHER_WORKSPACE = '0'.repeat(64);
const PROJECT = new TextEncoder().encode('{"name":"测试关卡","courses":[]}');
const PROJECT_HASH = await sha256(PROJECT);
const CHUNK_PATH = `roomlab-saves/chunks/${PROJECT_HASH}`;
const TOKEN = 'test-token-value';

function chunkedFake() {
  return fakeGitHub({initialFiles: [
    ['roomlab-41-rooms.zip', new TextEncoder().encode('existing-zip-bytes')],
    [CHUNK_PATH, PROJECT],
  ]});
}

// Any access to these bindings fails the test. The configured workspace must
// serve chunks, missing checks and commits entirely from GitHub.
function legacyTrap() {
  const calls = [];
  const hit = name => () => {
    calls.push(name);
    throw new Error(`legacy storage accessed: ${name}`);
  };
  return {
    calls,
    env: {
      DB: {prepare: hit('DB.prepare'), batch: hit('DB.batch')},
      BUCKET: {
        put: hit('BUCKET.put'),
        get: hit('BUCKET.get'),
        head: hit('BUCKET.head'),
        list: hit('BUCKET.list'),
      },
    },
  };
}

function githubEnv(extra = {}) {
  return {
    ROOMLAB_GITHUB_TOKEN: TOKEN,
    ROOMLAB_GITHUB_WORKSPACE_SHA256: WORKSPACE,
    ...extra,
  };
}

function config(env = githubEnv()) {
  const value = githubStorageConfig(env);
  assert.ok(value, 'expected valid GitHub config');
  return value;
}

async function makeRevision({parent = null, message = '保存', createdAt = Date.now()} = {}) {
  const files = [{
    path: 'project.json',
    hash: PROJECT_HASH,
    size: PROJECT.length,
    chunks: [{hash: PROJECT_HASH, size: PROJECT.length}],
  }];
  const fingerprint = await sha256(new TextEncoder().encode(canonical(files)));
  const unsigned = {parent, message, device: 'test-device', createdAt, files, fingerprint};
  const id = await sha256(new TextEncoder().encode(canonical(unsigned)));
  return {id, ...unsigned};
}

function legacyStateDb() {
  return {
    prepare(sql) {
      const wrapper = {
        bind: () => wrapper,
        first: async () => null,
        all: async () => ({results: []}),
        run: async () => ({meta: {changes: 0}}),
      };
      if (sql.includes('FROM branches') || sql.includes('FROM revisions')
        || sql.includes('FROM workspace_graph') || sql.includes('FROM node_metadata')) return wrapper;
      throw new Error(`unexpected legacy SQL: ${sql}`);
    },
  };
}

function request(route, {method = 'GET', body, key = KEY} = {}) {
  return new Request(`https://roomlab.test/api/room-sync/${route}`, {
    method,
    headers: {'X-Room-Workspace-Key': key, ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
}

function rawRequest(route, {method = 'PUT', body, key = KEY} = {}) {
  return new Request(`https://roomlab.test/api/room-sync/${route}`, {
    method,
    headers: {'X-Room-Workspace-Key': key},
    body,
  });
}

test('GitHub mode requires both an exact configured workspace SHA-256 and a token', () => {
  let fetches = 0;
  const noFetch = () => { fetches += 1; throw new Error('must not fetch'); };
  assert.equal(githubStorageFor({...githubEnv(), ROOMLAB_GITHUB_WORKSPACE_SHA256: OTHER_WORKSPACE}, WORKSPACE, noFetch), null);
  assert.equal(githubStorageFor({ROOMLAB_GITHUB_WORKSPACE_SHA256: WORKSPACE}, WORKSPACE, noFetch), null);
  assert.ok(githubStorageFor(githubEnv(), WORKSPACE, noFetch));
  assert.equal(fetches, 0);
  assert.equal(githubStorageConfig({...githubEnv(), ROOMLAB_GITHUB_BRANCH: '../escape'}), null);
  assert.equal(githubStorageConfig({...githubEnv(), ROOMLAB_GITHUB_WORKSPACE_SHA256: 'not-a-hash'}), null);
});

test('empty GitHub state is read without writing and preserves the existing ZIP', async () => {
  const fake = fakeGitHub();
  const store = createGitHubStorage({config: config(), fetchImpl: fake.fetch});
  const state = await store.readState();
  assert.deepEqual(state, {branches: [], revisions: [], graph: {generation: 0, metadata: []}});
  assert.equal(new TextDecoder().decode(fake.file('roomlab-41-rooms.zip')), 'existing-zip-bytes');
  assert.equal(fake.file('roomlab-saves/state.json'), null);
  assert.equal(fake.refUpdates.length, 0);
  assert.ok(fake.calls.every(call => call.method === 'GET'));
});

test('commit writes metadata through Git Data API, keeps ZIP and uses parent HEAD with force:false', async () => {
  const fake = fakeGitHub();
  const first = fake.head();
  const revision = await makeRevision();
  const store = createGitHubStorage({config: config(), fetchImpl: fake.fetch});
  const result = await store.commit({branch: 'main', base: null, revision});
  assert.deepEqual(result, {ok: true, head: revision.id});

  const update = fake.refUpdates[0];
  assert.equal(update.force, false);
  assert.deepEqual(fake.commit(update.sha).parents, [first]);
  assert.equal(new TextDecoder().decode(fake.file('roomlab-41-rooms.zip')), 'existing-zip-bytes');

  const raw = JSON.parse(new TextDecoder().decode(fake.file('roomlab-saves/state.json')));
  assert.equal(raw.schema, 1);
  assert.equal(raw.workspace, WORKSPACE);
  assert.deepEqual(raw.branches, [{name: 'main', head: revision.id, updatedAt: raw.branches[0].updatedAt}]);
  assert.equal(raw.revisions.length, 1);
  const serialized = JSON.stringify(raw);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes(KEY), false);
  assert.ok(fake.calls.every(call => !call.url.includes(TOKEN) && !call.url.includes(KEY)));

  const state = await store.readState();
  assert.equal(state.branches[0].head, revision.id);
  assert.equal(state.revisions[0].id, revision.id);
  assert.equal(state.graph.generation, 1);
  assert.equal((await store.revision(revision.id)).id, revision.id);
  assert.equal(await store.revision('f'.repeat(64)), null);
});

test('route integration reads, commits, edits graph and hides deleted branch heads', async () => {
  const fake = chunkedFake();
  const legacy = legacyTrap();
  const revision = await makeRevision();
  const env = githubEnv(legacy.env);

  let response = await handle(request('state'), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).branches, []);

  response = await handle(request('commit', {
    method: 'POST',
    body: {branch: 'main', base: null, revision},
  }), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, head: revision.id});

  response = await handle(request(`revisions/${revision.id}`), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, revision.id);

  response = await handle(request(`chunks/${PROJECT_HASH}`), env, {fetch: fake.fetch});
  assert.equal(response.status, 200, 'chunks are served from GitHub blobs');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PROJECT);

  response = await handle(request('graph/edit', {
    method: 'POST',
    body: {action: 'delete', id: revision.id, parentId: null, expectedVersion: 1},
  }), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  const graph = await response.json();
  assert.equal(graph.generation, 2);
  assert.equal(graph.metadata.length, 1);
  assert.ok(graph.metadata[0].deletedAt);

  const child = await makeRevision({parent: revision.id, message: '子版本', createdAt: Date.now() + 1});
  response = await handle(request('commit', {
    method: 'POST',
    body: {branch: 'main', base: revision.id, revision: child},
  }), githubEnv(legacy.env), {fetch: fake.fetch});
  assert.equal(response.status, 409, 'deleted parent is rejected before chunk checks');

  response = await handle(request('state'), env, {fetch: fake.fetch});
  const state = await response.json();
  assert.deepEqual(state.branches, []);
  assert.equal(state.revisions.length, 1);
  assert.deepEqual(legacy.calls, [], 'target workspace never touches D1/R2');
});

test('mocked chunk missing/put/get/commit roundtrip never touches D1/R2', async () => {
  const fake = fakeGitHub();
  const legacy = legacyTrap();
  const env = githubEnv(legacy.env);

  let response = await handle(request('missing', {
    method: 'POST',
    body: {hashes: [PROJECT_HASH]},
  }), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {missing: [PROJECT_HASH]});

  response = await handle(rawRequest(`chunks/${PROJECT_HASH}`, {body: PROJECT}), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true});
  assert.deepEqual(new Uint8Array(fake.file(CHUNK_PATH)), PROJECT);

  response = await handle(request('missing', {
    method: 'POST',
    body: {hashes: [PROJECT_HASH]},
  }), env, {fetch: fake.fetch});
  assert.deepEqual(await response.json(), {missing: []});

  response = await handle(request(`chunks/${PROJECT_HASH}`), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PROJECT);

  response = await handle(request('commit', {
    method: 'POST',
    body: {branch: 'main', base: null, revision: await makeRevision()},
  }), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(legacy.calls, [], 'missing/put/get/commit must not query D1 or R2');

  // The immutable chunk commit keeps the pre-existing ZIP and adds only the blob.
  assert.deepEqual(new TextDecoder().decode(fake.file('roomlab-41-rooms.zip')), 'existing-zip-bytes');
  assert.equal(fake.refUpdates.length, 2, 'one chunk commit and one state commit');
  assert.ok(fake.refUpdates.every(update => update.force === false));
});

test('chunk writes are idempotent, retry a lost HEAD race and validate SHA-256', async () => {
  const fake = fakeGitHub();
  const store = createGitHubStorage({config: config(), fetchImpl: fake.fetch});

  // Simulate another writer moving HEAD between our read and ref update.
  let raced = false;
  fake.setBeforeRefUpdate(() => {
    if (raced) return;
    raced = true;
    fake.concurrentAdvance();
  });
  assert.deepEqual(await store.putChunk(PROJECT_HASH, PROJECT), {ok: true, created: true});
  assert.equal(fake.refUpdates.length, 2, 'first CAS attempt lost, retry against new HEAD succeeded');
  assert.ok(fake.refUpdates.every(update => update.force === false));

  // Re-uploading the same immutable bytes is a no-op with no extra commit.
  assert.deepEqual(await store.putChunk(PROJECT_HASH, PROJECT), {ok: true, created: false});
  assert.equal(fake.refUpdates.length, 2);

  // Bytes whose SHA-256 does not match the path are rejected before any write.
  await assert.rejects(
    store.putChunk(PROJECT_HASH, new TextEncoder().encode('not-the-project')),
    error => error.status === 400,
  );
  assert.equal(fake.refUpdates.length, 2);

  // A branch blob whose bytes no longer match its hash fails closed on read.
  const tampered = fakeGitHub({initialFiles: [[CHUNK_PATH, new TextEncoder().encode('tampered')]]});
  const tamperedStore = createGitHubStorage({config: config(), fetchImpl: tampered.fetch});
  await assert.rejects(tamperedStore.readChunk(PROJECT_HASH), error => error.status === 503);
  await assert.rejects(tamperedStore.chunkSizes([PROJECT_HASH]), error => error.status === 503);
});

test('lost update is reported as a conflict and never uses a forced ref update', async () => {
  const fake = fakeGitHub();
  fake.setBeforeRefUpdate(() => fake.concurrentAdvance());
  const store = createGitHubStorage({config: config(), fetchImpl: fake.fetch});
  const result = await store.commit({branch: 'main', base: null, revision: await makeRevision()});
  assert.equal(result.conflict, true);
  assert.equal(result.head, null);
  assert.equal(fake.refUpdates.length, 1);
  assert.equal(fake.refUpdates[0].force, false);
  assert.equal(fake.file('roomlab-saves/state.json'), null);
});

test('a stale graph generation is rejected before any Git write', async () => {
  const fake = fakeGitHub();
  const store = createGitHubStorage({config: config(), fetchImpl: fake.fetch});
  await assert.rejects(
    store.editGraph({action: 'delete', id: 'a'.repeat(64), expectedVersion: 7}),
    error => error.status === 409,
  );
  assert.equal(fake.refUpdates.length, 0);
  await assert.rejects(
    store.editGraph({action: 'delete', id: 'a'.repeat(64), expectedVersion: 0}),
    error => error.status === 400,
  );
});

test('upstream failures and malformed requests never expose the token or workspace key', async () => {
  const fake = fakeGitHub();
  const legacy = legacyTrap();
  fake.failNext(500, {message: `secret ${TOKEN} ${KEY}`});
  const env = githubEnv(legacy.env);
  const response = await handle(request('state'), env, {fetch: fake.fetch});
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(body.includes(TOKEN), false);
  assert.equal(body.includes(KEY), false);
  assert.equal(body, JSON.stringify({error: 'GitHub 存储暂时不可用'}));

  const invalid = await handle(request('commit', {
    method: 'POST',
    body: {branch: 'main', base: null, revision: (await makeRevision())},
  }), githubEnv(legacy.env), {fetch: fake.fetch});
  assert.equal(invalid.status, 422, 'missing chunk still blocks before GitHub writes');
  assert.equal(fake.refUpdates.length, 0);
  assert.deepEqual(legacy.calls, []);
});

test('manifest paths and digests keep their existing validation in GitHub mode', async () => {
  const fake = fakeGitHub();
  const good = await makeRevision();
  const env = githubEnv();

  let response = await handle(request('commit', {
    method: 'POST',
    body: {branch: 'main', base: null, revision: {...good, files: [{...good.files[0], path: '../project.json'}]}},
  }), env, {fetch: fake.fetch});
  assert.equal(response.status, 400);

  response = await handle(request('commit', {
    method: 'POST',
    body: {branch: 'main', base: null, revision: {...good, message: 'tampered'}},
  }), env, {fetch: fake.fetch});
  assert.equal(response.status, 400);
  assert.equal(fake.calls.length, 0);
  assert.equal(fake.refUpdates.length, 0);
});

test('non-configured workspaces stay on the legacy D1/R2 path and never call GitHub', async () => {
  const fake = fakeGitHub();
  const env = {
    ROOMLAB_GITHUB_TOKEN: TOKEN,
    ROOMLAB_GITHUB_WORKSPACE_SHA256: OTHER_WORKSPACE,
    DB: legacyStateDb(),
  };
  const response = await handle(request('state'), env, {fetch: fake.fetch});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    branches: [],
    revisions: [],
    graph: {generation: 0, metadata: []},
  });
  assert.equal(fake.calls.length, 0);
});

test('non-target workspaces keep the legacy R2 chunk fallback', async () => {
  const objects = new Map();
  const env = {
    ROOMLAB_GITHUB_TOKEN: TOKEN,
    ROOMLAB_GITHUB_WORKSPACE_SHA256: OTHER_WORKSPACE,
    BUCKET: {
      put: async (key, bytes) => { objects.set(key, new Uint8Array(bytes)); },
      head: async key => (objects.has(key) ? {size: objects.get(key).length} : null),
      get: async key => (objects.has(key) ? {body: objects.get(key)} : null),
      list: async () => ({objects: []}),
    },
  };
  const noGitHub = () => { throw new Error('GitHub must not be called for another workspace'); };

  let response = await handle(rawRequest(`chunks/${PROJECT_HASH}`, {body: PROJECT}), env, {fetch: noGitHub});
  assert.equal(response.status, 200);
  assert.deepEqual(objects.get(`${WORKSPACE}/${PROJECT_HASH}`), PROJECT);

  response = await handle(request('missing', {method: 'POST', body: {hashes: [PROJECT_HASH]}}), env, {fetch: noGitHub});
  assert.deepEqual(await response.json(), {missing: []});

  response = await handle(request(`chunks/${PROJECT_HASH}`), env, {fetch: noGitHub});
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PROJECT);
});

test('malformed remote metadata fails closed instead of being served or overwritten', async () => {
  const fake = chunkedFake();
  const env = githubEnv();
  await handle(request('commit', {
    method: 'POST',
    body: {branch: 'main', base: null, revision: await makeRevision()},
  }), env, {fetch: fake.fetch});
  // Corrupt the public state file at the storage primitive boundary.
  const state = JSON.parse(new TextDecoder().decode(fake.file('roomlab-saves/state.json')));
  state.workspace = OTHER_WORKSPACE;
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const blobBody = Buffer.from(bytes).toString('base64');
  const callsBefore = fake.calls.length;
  // Rebuild via the same API the store uses so the fake remains a plain Git server.
  const blobResponse = await fake.fetch('https://api.github.com/repos/zimukiv/gameProject/git/blobs', {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`},
    body: JSON.stringify({content: blobBody, encoding: 'base64'}),
  });
  const blob = await blobResponse.json();
  const head = fake.commit(fake.head());
  const treeResponse = await fake.fetch('https://api.github.com/repos/zimukiv/gameProject/git/trees', {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`},
    body: JSON.stringify({base_tree: head.tree, tree: [{path: 'roomlab-saves/state.json', mode: '100644', type: 'blob', sha: blob.sha}]}),
  });
  const tree = await treeResponse.json();
  const commitResponse = await fake.fetch('https://api.github.com/repos/zimukiv/gameProject/git/commits', {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`},
    body: JSON.stringify({message: 'corrupt test state', tree: tree.sha, parents: [fake.head()]}),
  });
  const commit = await commitResponse.json();
  await fake.fetch('https://api.github.com/repos/zimukiv/gameProject/git/refs/heads/roomlab-saves', {
    method: 'PATCH',
    headers: {Authorization: `Bearer ${TOKEN}`},
    body: JSON.stringify({sha: commit.sha, force: false}),
  });
  assert.ok(fake.calls.length > callsBefore);

  const response = await handle(request('state'), env, {fetch: fake.fetch});
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('invalid'), false);
});
