// Optional GitHub Git Data API storage for saved revisions, branches and graph.
//
// Runtime configuration (server-only; never forwarded to the browser):
//   ROOMLAB_GITHUB_TOKEN                 scoped contents:write token for the repo
//   ROOMLAB_GITHUB_WORKSPACE_SHA256      lowercase SHA-256 of the one allowed 43-char workspace key
//   ROOMLAB_GITHUB_REPOSITORY            defaults to zimukiv/gameProject
//   ROOMLAB_GITHUB_BRANCH                defaults to roomlab-saves
//   ROOMLAB_GITHUB_STATE_PATH            defaults to roomlab-saves/state.json
//   ROOMLAB_GITHUB_ZIP_PATH              existing ZIP on the branch, default roomlab-41-rooms.zip
//
// The ZIP and every other file on the branch are preserved through base_tree.
// Immutable chunk bytes are stored as blobs next to the state file, so a
// configured workspace never needs R2/D1 for chunks either. Chunk writes are
// content-addressed and idempotent: the SHA-256 in the path is always recomputed
// from the bytes, and a concurrent branch move is retried against the new HEAD.
import {planEdit} from './graph-management.mjs';
import {HASH, MAX_CHUNK, assertRevisionDigests, sha256} from './revision-manifest.mjs';

const API = 'https://api.github.com';
const GIT_SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CONFIG_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const STATE_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const STATE_BRANCH = /^[\p{L}\p{N}_. /-]{1,100}$/u;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_REVISIONS = 5000;
const MAX_BRANCHES = 1000;
const MAX_METADATA = 10000;

export const DEFAULT_GITHUB_REPOSITORY = 'zimukiv/gameProject';
export const DEFAULT_GITHUB_BRANCH = 'roomlab-saves';
export const DEFAULT_GITHUB_STATE_PATH = 'roomlab-saves/state.json';
export const DEFAULT_GITHUB_ZIP_PATH = 'roomlab-41-rooms.zip';

const upstream = () => Object.assign(new Error('GitHub 存储暂时不可用'), {status: 503});
const conflict = message => Object.assign(new Error(message), {status: 409});
const publicError = error => error && error.status ? error : upstream();

function text(value, max = 500) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : '';
}

function safeConfigBranch(value) {
  return CONFIG_BRANCH.test(value) && !value.includes('..') && !value.endsWith('/') && !value.endsWith('.lock');
}

function safeStatePath(value) {
  return value.length <= 200 && STATE_PATH.test(value)
    && value.split('/').every(part => part !== '.' && part !== '..' && part !== '.git');
}

/**
 * Read configuration without making a network call. Invalid or incomplete
 * configuration disables GitHub mode instead of trying a write with a broad or
 * accidental credential.
 */
export function githubStorageConfig(env = {}) {
  const token = text(env?.ROOMLAB_GITHUB_TOKEN, 1000);
  const workspace = text(env?.ROOMLAB_GITHUB_WORKSPACE_SHA256, 64).toLowerCase();
  if (!token || !HASH.test(workspace)) return null;
  const repo = text(env?.ROOMLAB_GITHUB_REPOSITORY, 200) || DEFAULT_GITHUB_REPOSITORY;
  const branch = text(env?.ROOMLAB_GITHUB_BRANCH, 200) || DEFAULT_GITHUB_BRANCH;
  const statePath = text(env?.ROOMLAB_GITHUB_STATE_PATH, 200) || DEFAULT_GITHUB_STATE_PATH;
  const zipPath = text(env?.ROOMLAB_GITHUB_ZIP_PATH, 200) || DEFAULT_GITHUB_ZIP_PATH;
  if (!REPO.test(repo) || !safeConfigBranch(branch) || !safeStatePath(statePath)
    || !safeStatePath(zipPath) || statePath === zipPath) return null;
  return Object.freeze({token, workspace, repo, branch, statePath, zipPath});
}

function sameWorkspace(left, right) {
  if (!HASH.test(left || '') || !HASH.test(right || '')) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Return a store only when the request's derived workspace hash exactly matches
 * the explicitly configured one. The token is not attached to any request until
 * this check has passed.
 */
export function githubStorageFor(env, workspace, fetchImpl) {
  const config = githubStorageConfig(env);
  if (!config || !sameWorkspace(workspace, config.workspace)) return null;
  return createGitHubStorage({config, fetchImpl});
}

const emptyState = workspace => ({
  schema: 1,
  workspace,
  branches: [],
  revisions: [],
  revisionTimes: {},
  graph: {generation: 0, metadata: []},
});

const bytesToBase64 = bytes => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const base64ToBytes = value => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const invalidState = () => new Error('GitHub 保存状态无效');

async function parseState(raw, workspace) {
  if (!raw || raw.schema !== 1 || raw.workspace !== workspace
    || !Array.isArray(raw.branches) || raw.branches.length > MAX_BRANCHES
    || !Array.isArray(raw.revisions) || raw.revisions.length > MAX_REVISIONS
    || !raw.graph || !Number.isSafeInteger(raw.graph.generation) || raw.graph.generation < 0
    || !Array.isArray(raw.graph.metadata) || raw.graph.metadata.length > MAX_METADATA) {
    throw invalidState();
  }
  const branchNames = new Set();
  for (const branch of raw.branches) {
    if (!branch || typeof branch.name !== 'string' || !STATE_BRANCH.test(branch.name)
      || (branch.head !== null && !HASH.test(branch.head || ''))
      || !Number.isSafeInteger(branch.updatedAt) || branch.updatedAt < 0
      || branchNames.has(branch.name)) throw invalidState();
    branchNames.add(branch.name);
  }
  const revisionIds = new Set();
  for (const revision of raw.revisions) {
    if (!revision || revisionIds.has(revision.id)) throw invalidState();
    try {
      await assertRevisionDigests(revision);
    } catch {
      throw invalidState();
    }
    revisionIds.add(revision.id);
  }
  const metadataIds = new Set();
  for (const entry of raw.graph.metadata) {
    if (!entry || !HASH.test(entry.id || '') || metadataIds.has(entry.id)
      || (entry.parentId !== undefined && entry.parentId !== null && !HASH.test(entry.parentId || ''))
      || (entry.deletedAt !== undefined && entry.deletedAt !== null
        && (!Number.isSafeInteger(entry.deletedAt) || entry.deletedAt < 0))
      || !Number.isSafeInteger(entry.updatedAt) || entry.updatedAt < 0) throw invalidState();
    metadataIds.add(entry.id);
  }
  if (raw.revisionTimes !== undefined) {
    if (!raw.revisionTimes || typeof raw.revisionTimes !== 'object' || Array.isArray(raw.revisionTimes)) {
      throw invalidState();
    }
    for (const [id, at] of Object.entries(raw.revisionTimes)) {
      if (!HASH.test(id) || !Number.isSafeInteger(at) || at < 0) throw invalidState();
    }
  }
  return {
    schema: 1,
    workspace,
    branches: raw.branches.map(branch => ({name: branch.name, head: branch.head, updatedAt: branch.updatedAt})),
    revisions: raw.revisions,
    revisionTimes: raw.revisionTimes ? {...raw.revisionTimes} : {},
    graph: {
      generation: raw.graph.generation,
      metadata: raw.graph.metadata.map(entry => ({
        id: entry.id,
        parentId: entry.parentId ?? null,
        deletedAt: entry.deletedAt ?? null,
        updatedAt: entry.updatedAt,
      })),
    },
  };
}

function graphView(graph) {
  return {generation: graph.generation, metadata: graph.metadata.map(entry => ({...entry}))};
}

function stateView(state) {
  const deleted = new Set(state.graph.metadata.filter(entry => entry.deletedAt).map(entry => entry.id));
  const branches = [...state.branches]
    .filter(branch => !branch.head || !deleted.has(branch.head))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 200)
    .map(branch => ({name: branch.name, head: branch.head, updatedAt: branch.updatedAt}));
  const revisions = [...state.revisions]
    .sort((left, right) => (state.revisionTimes[right.id] ?? right.createdAt ?? 0)
      - (state.revisionTimes[left.id] ?? left.createdAt ?? 0))
    .slice(0, 100);
  return {branches, revisions, graph: graphView(state.graph)};
}

/**
 * Create an isolated Git Data API client. `fetchImpl` and `now` are injectable so
 * tests can exercise concurrency and ref-update semantics without a network.
 */
export function createGitHubStorage({config, fetchImpl = globalThis.fetch, now = Date.now} = {}) {
  if (!config) throw upstream();
  if (typeof fetchImpl !== 'function') throw upstream();
  const {token, workspace, repo, branch, statePath} = config;
  const refPath = `/repos/${repo}/git/ref/heads/${branch}`;
  const refsPath = `/repos/${repo}/git/refs/heads/${branch}`;
  // Chunks live in an immutable sibling directory of the state file. Deriving it
  // from the configured path keeps every workspace file inside one branch prefix.
  const chunkPrefix = statePath.includes('/')
    ? `${statePath.slice(0, statePath.lastIndexOf('/'))}/chunks`
    : 'roomlab-github-chunks';
  const chunkPath = hash => `${chunkPrefix}/${hash}`;

  async function call(method, path, body) {
    const signal = typeof globalThis.AbortSignal?.timeout === 'function'
      ? globalThis.AbortSignal.timeout(15000)
      : undefined;
    let response;
    try {
      response = await fetchImpl(API + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'roomlab-github-storage',
          ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        },
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
        ...(signal ? {signal} : {}),
      });
    } catch {
      throw new Error('github transport');
    }
    if (!response || !response.ok) {
      // Preserve the upstream status internally; callers only expose fixed text.
      throw Object.assign(new Error('github response'), {httpStatus: response?.status || 0});
    }
    try {
      return await response.json();
    } catch {
      throw Object.assign(new Error('github response'), {httpStatus: 502});
    }
  }

  async function readHead() {
    const data = await call('GET', refPath);
    const head = data?.object?.sha;
    if (!GIT_SHA.test(head || '')) throw new Error('github ref');
    return head;
  }

  async function readCommit(sha) {
    const data = await call('GET', `/repos/${repo}/git/commits/${sha}`);
    const tree = data?.tree?.sha;
    if (!GIT_SHA.test(tree || '') || !Array.isArray(data.parents)) throw new Error('github commit');
    return {tree, parents: data.parents.map(parent => parent?.sha).filter(parent => GIT_SHA.test(parent || ''))};
  }

  async function readTree(sha) {
    const data = await call('GET', `/repos/${repo}/git/trees/${sha}?recursive=1`);
    // A truncated tree could hide the state file and make us overwrite history
    // with an empty snapshot, so fail closed instead.
    if (!Array.isArray(data?.tree) || data.truncated) throw new Error('github tree');
    return data.tree;
  }

  async function readBlob(sha) {
    const data = await call('GET', `/repos/${repo}/git/blobs/${sha}`);
    if (typeof data?.content !== 'string' || data.encoding !== 'base64') throw new Error('github blob');
    return base64ToBytes(data.content);
  }

  async function loadBranch() {
    const head = await readHead();
    const commit = await readCommit(head);
    const tree = await readTree(commit.tree);
    return {head, treeSha: commit.tree, tree};
  }

  // Map chunk hash -> git blob SHA for every valid immutable chunk in the tree.
  function chunkBlobs(tree) {
    const prefix = `${chunkPrefix}/`;
    const entries = new Map();
    for (const item of tree) {
      if (item?.type !== 'blob' || typeof item.path !== 'string'
        || !item.path.startsWith(prefix) || !GIT_SHA.test(item.sha || '')) continue;
      const hash = item.path.slice(prefix.length);
      if (HASH.test(hash)) entries.set(hash, item.sha);
    }
    return entries;
  }

  async function load() {
    const {head, treeSha, tree} = await loadBranch();
    const entry = tree.find(item => item.path === statePath && item.type === 'blob' && GIT_SHA.test(item.sha || ''));
    if (!entry) return {head, treeSha, state: emptyState(workspace)};
    const bytes = await readBlob(entry.sha);
    if (bytes.length > MAX_STATE_BYTES) throw invalidState();
    let raw;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw invalidState();
    }
    return {head, treeSha, state: await parseState(raw, workspace)};
  }

  async function writeState(head, treeSha, state) {
    if (state.workspace !== workspace || state.schema !== 1) throw invalidState();
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    if (bytes.length > MAX_STATE_BYTES) throw Object.assign(new Error('GitHub 同步状态超过容量限制'), {status: 413});
    // Defence in depth: the public branch may never contain the workspace key or token.
    const serialized = new TextDecoder().decode(bytes);
    if (serialized.includes(token)) throw upstream();

    const blob = await call('POST', `/repos/${repo}/git/blobs`, {
      content: bytesToBase64(bytes),
      encoding: 'base64',
    });
    if (!GIT_SHA.test(blob?.sha || '')) throw new Error('github blob');
    const tree = await call('POST', `/repos/${repo}/git/trees`, {
      base_tree: treeSha,
      tree: [{path: statePath, mode: '100644', type: 'blob', sha: blob.sha}],
    });
    if (!GIT_SHA.test(tree?.sha || '')) throw new Error('github tree');
    const commit = await call('POST', `/repos/${repo}/git/commits`, {
      message: 'roomlab: sync saved revisions',
      tree: tree.sha,
      parents: [head],
    });
    if (!GIT_SHA.test(commit?.sha || '')) throw new Error('github commit');
    try {
      // force:false plus a parent of the observed HEAD makes this a fast-forward
      // only when the branch has not moved; GitHub rejects lost updates.
      await call('PATCH', refsPath, {sha: commit.sha, force: false});
    } catch (error) {
      if (error?.httpStatus === 409 || error?.httpStatus === 422) {
        throw conflict('云端分支已被另一端更新');
      }
      throw error;
    }
    return commit.sha;
  }

  /** Return the subset of `hashes` whose immutable blob is absent from HEAD. */
  async function missing(hashes) {
    try {
      if (!Array.isArray(hashes) || hashes.some(hash => !HASH.test(hash || ''))) {
        throw Object.assign(new Error('散列列表无效'), {status: 400});
      }
      if (!hashes.length) return [];
      const {tree} = await loadBranch();
      const present = chunkBlobs(tree);
      return hashes.filter(hash => !present.has(hash));
    } catch (error) {
      throw publicError(error);
    }
  }

  /** Read one immutable chunk and re-verify its SHA-256 before returning bytes. */
  async function readChunk(hash) {
    try {
      if (!HASH.test(hash || '')) throw Object.assign(new Error('散列无效'), {status: 400});
      const {tree} = await loadBranch();
      const blob = chunkBlobs(tree).get(hash);
      if (!blob) return null;
      const bytes = await readBlob(blob);
      if (await sha256(bytes) !== hash) throw new Error('github chunk digest');
      return bytes;
    } catch (error) {
      throw publicError(error);
    }
  }

  /**
   * Presence and size for commit validation, with the same SHA-256 check used by
   * reads. Never consults D1/R2; a corrupted branch blob fails closed.
   */
  async function chunkSizes(hashes) {
    try {
      if (!Array.isArray(hashes)) throw Object.assign(new Error('散列列表无效'), {status: 400});
      const sizes = new Map();
      if (!hashes.length) return sizes;
      const {tree} = await loadBranch();
      const present = chunkBlobs(tree);
      for (const hash of hashes) {
        if (!HASH.test(hash || '')) throw Object.assign(new Error('散列列表无效'), {status: 400});
        const blob = present.get(hash);
        if (!blob) continue;
        const bytes = await readBlob(blob);
        if (await sha256(bytes) !== hash) throw new Error('github chunk digest');
        sizes.set(hash, bytes.length);
      }
      return sizes;
    } catch (error) {
      throw publicError(error);
    }
  }

  /**
   * Upload one immutable chunk. The path is content-addressed, so an existing
   * matching blob is a successful idempotent no-op. New bytes are committed with
   * a parent of the observed HEAD and force:false; a lost race is retried against
   * the new HEAD before it is reported as a conflict.
   */
  async function putChunk(hash, bytes) {
    try {
      if (!HASH.test(hash || '') || !(bytes instanceof Uint8Array)
        || bytes.length < 1 || bytes.length > MAX_CHUNK) {
        throw Object.assign(new Error('分块信息无效'), {status: 400});
      }
      if (await sha256(bytes) !== hash) {
        throw Object.assign(new Error('分块校验失败'), {status: 400});
      }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const {head, treeSha, tree} = await loadBranch();
        const existing = chunkBlobs(tree).get(hash);
        if (existing) {
          const current = await readBlob(existing);
          if (await sha256(current) !== hash) throw new Error('github chunk digest');
          return {ok: true, created: false};
        }
        const blob = await call('POST', `/repos/${repo}/git/blobs`, {
          content: bytesToBase64(bytes),
          encoding: 'base64',
        });
        if (!GIT_SHA.test(blob?.sha || '')) throw new Error('github blob');
        const nextTree = await call('POST', `/repos/${repo}/git/trees`, {
          base_tree: treeSha,
          tree: [{path: chunkPath(hash), mode: '100644', type: 'blob', sha: blob.sha}],
        });
        if (!GIT_SHA.test(nextTree?.sha || '')) throw new Error('github tree');
        const nextCommit = await call('POST', `/repos/${repo}/git/commits`, {
          message: `roomlab: store chunk ${hash.slice(0, 12)}`,
          tree: nextTree.sha,
          parents: [head],
        });
        if (!GIT_SHA.test(nextCommit?.sha || '')) throw new Error('github commit');
        try {
          // Compare-and-swap on the branch HEAD: force:false rejects a lost race.
          await call('PATCH', refsPath, {sha: nextCommit.sha, force: false});
          return {ok: true, created: true};
        } catch (error) {
          if (error?.httpStatus === 409 || error?.httpStatus === 422) {
            // Re-read HEAD; a concurrent writer may have stored the same chunk.
            continue;
          }
          throw error;
        }
      }
      throw conflict('云端分支已被另一端更新');
    } catch (error) {
      throw publicError(error);
    }
  }

  async function readState() {
    try {
      const {state} = await load();
      return stateView(state);
    } catch (error) {
      throw publicError(error);
    }
  }

  async function revision(id) {
    try {
      const {state} = await load();
      return state.revisions.find(item => item.id === id) || null;
    } catch (error) {
      throw publicError(error);
    }
  }

  async function parentDeleted(id) {
    try {
      const {state} = await load();
      return state.graph.metadata.some(entry => entry.id === id && entry.deletedAt);
    } catch (error) {
      throw publicError(error);
    }
  }

  async function commit({branch: targetBranch, base, revision: incoming}) {
    try {
      if (typeof targetBranch !== 'string' || !STATE_BRANCH.test(targetBranch)
        || (base !== null && !HASH.test(base || ''))) {
        throw Object.assign(new Error('分支或基准版本无效'), {status: 400});
      }
      await assertRevisionDigests(incoming);
      if (incoming.parent !== null && !HASH.test(incoming.parent || '')) {
        throw Object.assign(new Error('来源版本无效'), {status: 400});
      }
      const {head, treeSha, state} = await load();
      const removed = incoming.parent
        ? state.graph.metadata.find(entry => entry.id === incoming.parent && entry.deletedAt)
        : null;
      if (removed) {
        throw Object.assign(new Error('来源节点已删除，请刷新并选择其他父节点'), {status: 409});
      }
      const existingBranch = state.branches.find(item => item.name === targetBranch);
      const current = existingBranch?.head ?? null;
      if (current !== base) {
        if (current === incoming.id) return {ok: true, head: incoming.id};
        return {conflict: true, head: current};
      }
      if (!state.revisions.some(item => item.id === incoming.id)) {
        // Store only the validated client revision; never add fields that would
        // change its content-addressed id.
        state.revisions.push(incoming);
        state.revisionTimes[incoming.id] = now();
      }
      if (existingBranch) {
        existingBranch.head = incoming.id;
        existingBranch.updatedAt = now();
      } else {
        state.branches.push({name: targetBranch, head: incoming.id, updatedAt: now()});
      }
      // As with the legacy workspace_graph update, every accepted commit
      // advances the generation so concurrent graph edits must re-plan.
      state.graph.generation += 1;
      try {
        await writeState(head, treeSha, state);
        return {ok: true, head: incoming.id};
      } catch (error) {
        if (error?.status === 409) {
          let latest = null;
          try {
            const fresh = await load();
            latest = fresh.state.branches.find(item => item.name === targetBranch)?.head ?? null;
          } catch {
            // A missing head must not turn a conflict into a leaked upstream error.
          }
          return {conflict: true, head: latest};
        }
        throw error;
      }
    } catch (error) {
      throw publicError(error);
    }
  }

  async function editGraph(edit) {
    try {
      if (!edit || !Number.isSafeInteger(edit.expectedVersion) || edit.expectedVersion < 0) {
        throw Object.assign(new Error('请先刷新节点图'), {status: 400});
      }
      const {head, treeSha, state} = await load();
      if (state.graph.generation !== edit.expectedVersion) {
        throw Object.assign(new Error('节点关系已被另一端修改，请刷新后重试'), {status: 409});
      }
      const changes = planEdit(state.revisions, state.graph.metadata, edit, now());
      const byId = new Map(state.graph.metadata.map(entry => [entry.id, entry]));
      for (const change of changes) {
        const next = {
          id: change.id,
          parentId: change.parentId ?? null,
          deletedAt: change.deletedAt ?? null,
          updatedAt: change.updatedAt,
        };
        if (byId.has(change.id)) Object.assign(byId.get(change.id), next);
        else {
          state.graph.metadata.push(next);
          byId.set(next.id, next);
        }
      }
      state.graph.generation = edit.expectedVersion + 1;
      try {
        await writeState(head, treeSha, state);
      } catch (error) {
        if (error?.status === 409) {
          throw Object.assign(new Error('节点关系已被另一端修改，请刷新后重试'), {status: 409});
        }
        throw error;
      }
      return graphView(state.graph);
    } catch (error) {
      throw publicError(error);
    }
  }

  return {readState, revision, parentDeleted, commit, editGraph, missing, readChunk, chunkSizes, putChunk};
}
