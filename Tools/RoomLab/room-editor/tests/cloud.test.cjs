'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Repository } = require('../src/cloud/repository.cjs'),
  { Service } = require('../src/cloud/service.cjs'),
  C = require('../src/cloud/codec.cjs'),
  Conn = require('../src/cloud/connection.cjs'),
  M = require('../src/project/model.cjs'),
  Seeds = require('../src/assets/seeds.cjs');
function sample() {
  const p = M.example(),
    s = Seeds.seeds();
  p.assets = s.assets;
  p.courses[0].artBindings = s.bindings;
  return { p, files: s.files };
}
function fixture(remote) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-sync-'));
  const repo = new Repository(root);
  let c = {
    endpoint: 'https://test.chatgpt.site',
    workspaceKey: Conn.newWorkspaceKey(),
    accessToken: 'test-token-long-enough',
  };
  const vault = {
    load: () => c,
    save: (v) => {
      c = v;
    },
  };
  return { repo, svc: new Service(repo, vault, { remote }), root };
}
class FakeRemote {
  constructor() {
    this.heads = new Map();
    this.revisions = new Map();
    this.snapshots = new Map();
    this.offline = false;
  }
  async state() {
    if (this.offline) throw new Error('离线');
    return {
      branches: [...this.heads].map(([name, head]) => ({ name, head })),
      revisions: [...this.revisions.values()],
    };
  }
  async upload(s, r, b, base) {
    if (this.offline) throw new Error('离线');
    const h = this.heads.get(b) || null;
    if (h !== base && h !== r.id)
      throw Object.assign(new Error('conflict'), { status: 409, head: h });
    this.revisions.set(r.id, r);
    this.snapshots.set(r.id, s);
    this.heads.set(b, r.id);
  }
  async download(id) {
    return { revision: this.revisions.get(id), snapshot: this.snapshots.get(id) };
  }
}

test('explicit cloud parent uploads below selection; no selection uses last read; switching history deduplicates', async () => {
  const remote = new FakeRemote(),
    a = fixture(remote),
    { p, files } = sample();
  await a.svc.action('draft', { project: p, files: [...files] });
  await a.svc.action('manualSave', { message: 'root' });
  const root = a.repo.tree().head;
  await a.svc.action('manualSave', { message: 'selected child', parentRevision: root });
  const child = a.repo.tree().head;
  assert.equal(remote.revisions.get(child).parent, root);
  assert.equal(a.repo.tree().readRevision, root);
  const before = a.repo.data.trees.length;
  await assert.rejects(a.svc.action('manualSave', { parentRevision: 'f'.repeat(64) }), /不存在/);
  assert.equal(a.repo.data.trees.length, before);
  const data = await a.svc.action('checkoutRevision', { id: root });
  assert.equal(data.project.id, p.id);
  assert.equal(a.repo.tree().readRevision, root);
  const original = a.repo.tree().id,
    modified = M.clone(p);
  modified.notes = 'unsaved preserved';
  await a.svc.action('draft', { project: modified, files: [...files] });
  const clean = await a.svc.action('checkoutRevision', { id: root });
  assert.notEqual(a.repo.tree().id, original);
  assert.equal(clean.project.notes, p.notes);
  assert.equal(a.repo.working(a.repo.tree(original)).project.notes, 'unsaved preserved');
  const count = a.repo.data.trees.length;
  await a.svc.action('checkoutRevision', { id: root });
  assert.equal(a.repo.data.trees.length, count);
  await a.svc.action('manualSave', { message: 'default child' });
  assert.equal(remote.revisions.get(a.repo.tree().head).parent, root);
  remote.state = async () => ({
    branches: [],
    revisions: [...remote.revisions.values()],
    graph: { metadata: [{ id: root, deletedAt: 1 }] },
  });
  await assert.rejects(a.svc.action('manualSave', { parentRevision: root }), /删除/);
});
test('snapshot canonical identity ignores ZIP timestamp; assets round-trip and deduplicate', () => {
  const { p, files } = sample(),
    a = C.encode(p, files),
    b = C.encode(JSON.parse(JSON.stringify(p)), files);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.deepEqual(C.decode(a.bytes).project, p);
  assert.equal(C.decode(a.bytes).files.length, 9);
  p.name += ' changed';
  const changed = C.encode(p, files);
  assert.notEqual(changed.fingerprint, a.fingerprint);
  for (const f of a.files.filter((f) => f.path !== 'project.json'))
    assert.deepEqual(
      changed.files.find((x) => x.path === f.path),
      f,
    );
});
test('local backups survive restart; named checkpoints and restore append history', async () => {
  const { repo, svc, root } = fixture(new FakeRemote()),
    { p, files } = sample();
  await svc.action('backup', { project: p, files: [...files] });
  const first = repo.tree().head;
  await svc.action('backup', { project: p, files: [...files], message: '命名版本' });
  assert.notEqual(repo.tree().head, first);
  p.name = 'changed';
  await svc.action('backup', { project: p, files: [...files] });
  const changed = repo.tree().head;
  const restored = await svc.action('restore', { id: first });
  assert.notEqual(repo.tree().head, changed);
  assert.equal(restored.project.name, M.example().name);
  assert.ok(repo.data.revisions[changed]);
  const reloaded = new Repository(root);
  assert.equal(reloaded.tree().head, repo.tree().head);
  assert.equal(reloaded.read(reloaded.tree()).files.length, 9);
});
test('two devices: clean download, concurrent edits preserved on a conflict branch', async () => {
  const remote = new FakeRemote(),
    a = fixture(remote),
    b = fixture(remote),
    { p, files } = sample();
  await a.svc.action('backup', { project: p, files: [...files] });
  await a.svc.action('sync');
  const branch = a.repo.tree().branch,
    base = a.repo.tree().head;
  await b.svc.action('fetchBranch', { branch });
  await b.svc.action('checkout', { id: b.repo.data.trees[0].id });
  assert.equal(b.repo.tree().head, base);
  const pa = M.clone(p),
    pb = M.clone(p);
  pa.name = 'A 的修改';
  pb.name = 'B 的修改';
  await a.svc.action('backup', { project: pa, files: [...files] });
  await b.svc.action('backup', { project: pb, files: [...files] });
  await a.svc.action('sync');
  const headA = remote.heads.get(branch);
  const result = await b.svc.action('sync');
  assert.equal(result.conflict, true);
  assert.equal(remote.heads.get(branch), headA);
  assert.equal(b.repo.read(b.repo.tree()).project.name, 'B 的修改');
  assert.ok(b.repo.tree().branch.includes('冲突'));
  const cloudA = await remote.download(headA);
  assert.equal(C.decode(cloudA.snapshot.bytes).project.name, 'A 的修改');
  assert.ok(b.repo.data.revisions[base]);
});
test('offline sync failure leaves pending snapshot; fork starts a new cloud branch without conflict', async () => {
  const remote = new FakeRemote(),
    a = fixture(remote),
    { p, files } = sample();
  await a.svc.action('backup', { project: p, files: [...files] });
  remote.offline = true;
  await assert.rejects(a.svc.action('sync'));
  assert.equal(a.repo.status().trees[0].pending, true);
  assert.ok(fs.existsSync(a.repo.snapshotFile(a.repo.tree().head)));
  remote.offline = false;
  await a.svc.action('sync');
  await a.svc.action('fork', { name: '冰块实验', branch: 'ice/test' });
  const result = await a.svc.action('sync');
  assert.ok(!result.conflict);
  assert.equal(remote.heads.get('ice/test'), a.repo.tree().head);
});
test('cloud pull creates recoverable incoming tree without mutating current edits', async () => {
  const remote = new FakeRemote(),
    a = fixture(remote),
    b = fixture(remote),
    { p, files } = sample();
  await a.svc.action('backup', { project: p, files: [...files] });
  await a.svc.action('sync');
  const branch = a.repo.tree().branch;
  await b.svc.action('fetchBranch', { branch });
  await b.svc.action('checkout', { id: b.repo.data.trees[0].id });
  const previous = b.repo.tree().id;
  p.name = '远端更新';
  await a.svc.action('backup', { project: p, files: [...files] });
  await a.svc.action('sync');
  const incoming = await b.svc.action('sync');
  assert.ok(incoming.incoming);
  assert.equal(b.repo.tree().id, previous);
  assert.notEqual(b.repo.read(b.repo.tree()).project.name, '远端更新');
  await b.svc.action('checkout', { id: incoming.incoming });
  assert.equal(b.repo.read(b.repo.tree()).project.name, '远端更新');
});
test('switching project IDs starts isolated tree and cloud branch', async () => {
  const a = fixture(new FakeRemote()),
    { p, files } = sample();
  await a.svc.action('backup', { project: p, files: [...files] });
  const tree = a.repo.tree().id,
    branch = a.repo.tree().branch;
  p.id = 'new-project';
  await a.svc.action('backup', { project: p, files: [...files], treeId: tree });
  assert.notEqual(a.repo.tree().id, tree);
  assert.notEqual(a.repo.tree().branch, branch);
  assert.equal(a.repo.data.trees.length, 2);
});
test('vault is encrypted; connection rejects non-Sites hosts and credentials never enter snapshots', () => {
  const { root } = fixture(new FakeRemote());
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s).map((x) => x ^ 73),
    decryptString: (b) => Buffer.from(b.map((x) => x ^ 73)).toString(),
  };
  const vault = new Conn.Vault(root, storage),
    data = {
      endpoint: 'https://test.chatgpt.site',
      accessToken: 'test-private-access',
      workspaceKey: Conn.newWorkspaceKey(),
    };
  vault.save(data);
  assert.deepEqual(vault.load(), data);
  assert.ok(!fs.readFileSync(vault.file, 'utf8').includes(data.accessToken));
  assert.equal(Conn.parse(Conn.format(data)).workspaceKey, data.workspaceKey);
  assert.throws(() => Conn.parse(Conn.format({ ...data, endpoint: 'https://example.com' })));
  const { p, files } = sample();
  assert.ok(!Buffer.from(C.encode(p, files).bytes).includes(Buffer.from(data.workspaceKey)));
});
test('transport sends secrets only to exact origin and rejects redirects', async () => {
  let got;
  const r = new Conn.Remote(
    { endpoint: 'https://test.chatgpt.site', accessToken: 'secret', workspaceKey: 'workspace' },
    async (url, init) => {
      got = { url, init };
      return Response.json({ branches: [] });
    },
  );
  await r.state();
  assert.equal(got.url, 'https://test.chatgpt.site/api/room-sync/state');
  assert.equal(got.init.redirect, 'error');
  assert.equal(got.init.headers['OAI-Sites-Authorization'], 'Bearer secret');
});

test('slow cloud upload never blocks local backups or marks newer edits as uploaded', async () => {
  const remote = new FakeRemote(),
    a = fixture(remote),
    { p, files } = sample();
  await a.svc.action('backup', { project: p, files: [...files] });
  let release, entered;
  const waiting = new Promise((r) => {
    entered = r;
  });
  const upload = remote.upload.bind(remote);
  remote.upload = async (...args) => {
    entered();
    await new Promise((r) => {
      release = r;
    });
    return upload(...args);
  };
  const syncing = a.svc.action('sync');
  await waiting;
  const sent = a.repo.tree().head;
  p.name = '上传途中继续编辑';
  await a.svc.action('backup', { project: p, files: [...files] });
  const latest = a.repo.tree().head;
  assert.notEqual(latest, sent);
  assert.equal(a.repo.read(a.repo.tree()).project.name, p.name);
  release();
  await syncing;
  assert.equal(a.repo.tree().base, sent);
  assert.equal(a.repo.tree().head, latest);
  assert.equal(a.repo.status().trees[0].pending, true);
});
