'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Repository } = require('../src/cloud/repository.cjs'),
  { Service } = require('../src/cloud/service.cjs'),
  Conn = require('../src/cloud/connection.cjs'),
  M = require('../src/project/model.cjs'),
  Seeds = require('../src/assets/seeds.cjs');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-tree-'));
  const repo = new Repository(root),
    p = M.example(),
    seed = Seeds.seeds();
  p.assets = seed.assets;
  repo.draft(p, seed.files);
  return { root, repo, p, files: seed.files };
}
test('fork relation survives restart and moving a node preserves immutable source revisions', () => {
  const { repo, root, p, files } = fixture(),
    a = repo.tree();
  repo.backup(p, files);
  const b = repo.fork('B', 'b'),
    c = repo.fork('C', 'c');
  const before = JSON.stringify(repo.data.revisions),
    source = c.readRevision;
  assert.equal(b.parentId, a.id);
  repo.move(c.id, a.id);
  assert.equal(new Repository(root).tree(c.id).parentId, a.id);
  assert.equal(c.readRevision, source);
  assert.equal(JSON.stringify(repo.data.revisions), before);
  assert.throws(() => repo.move(a.id, c.id), /循环|子节点/);
  assert.throws(() => repo.move(c.id, c.id), /自身|自己/);
});
test('delete is recoverable, keeps snapshots and children, and protects the active tree', () => {
  const { repo, p, files, root } = fixture(),
    a = repo.tree();
  repo.backup(p, files);
  const b = repo.fork('B', 'b'),
    c = repo.fork('C', 'c'),
    head = b.head;
  assert.throws(() => repo.remove(c.id), /当前/);
  repo.remove(b.id);
  assert.equal(
    repo.status().trees.some((t) => t.id === b.id),
    false,
  );
  assert.equal(repo.status().trash[0].id, b.id);
  assert.equal(c.parentId, a.id);
  assert.ok(fs.existsSync(repo.snapshotFile(head)));
  const r = new Repository(root);
  r.recover(b.id);
  assert.equal(r.tree(b.id).parentId, a.id);
});
test('duplicate branch is rejected, duplicate display name needs explicit acknowledgement', () => {
  const { repo } = fixture();
  repo.fork('test', 'test');
  assert.throws(() => repo.fork('other', 'test'), /分支.*重复|分支.*存在/);
  assert.throws(() => repo.fork('test', 'different'), /名称.*重复|名称.*存在/);
  assert.ok(repo.fork('test', 'different', { allowDuplicateName: true }));
});
test('file associations are local metadata, list courses and warn about duplicate paths', () => {
  const { repo, p, root } = fixture(),
    a = repo.tree();
  const file = path.join(root, '物理 大关.json');
  fs.writeFileSync(file, JSON.stringify(p));
  repo.linkFile(a.id, file, p);
  const b = repo.fork('B', 'b');
  const s = repo.status(),
    t = s.trees.find((t) => t.id === b.id);
  assert.equal(t.localFile.path, file);
  assert.equal(t.courses[0].name, p.courses[0].name);
  assert.equal(t.localFile.exists, true);
  assert.ok(t.duplicateFile);
  repo.unlinkFile(b.id);
  assert.equal(repo.status().trees.find((t) => t.id === b.id).localFile, null);
  fs.unlinkSync(file);
  assert.equal(repo.status().trees.find((t) => t.id === a.id).localFile.exists, false);
});
test('legacy repositories infer available parents without changing heads or losing drafts', () => {
  const { repo, root, p, files } = fixture();
  repo.backup(p, files);
  const a = repo.tree(),
    b = repo.fork('B', 'b');
  delete b.parentId;
  b.readRevision = a.head;
  repo.save();
  const migrated = new Repository(root);
  assert.equal(migrated.tree(b.id).parentId, a.id);
  assert.equal(migrated.tree(b.id).head, b.head);
  assert.equal(migrated.working(a).project.id, p.id);
});
test('broken encrypted configuration can be replaced after successful authentication', async () => {
  const { repo } = fixture();
  let c,
    saved = false;
  const vault = {
    load: () => {
      if (!saved) throw Error('decrypt');
      return c;
    },
    save: (v) => {
      c = v;
      saved = true;
    },
  };
  const svc = new Service(repo, vault, { remote: { state: async () => ({ branches: [] }) } });
  const key = Conn.format({
    endpoint: 'https://test.chatgpt.site',
    workspaceKey: Conn.newWorkspaceKey(),
    accessToken: 'test-private-token',
  });
  await svc.action('connect', { key });
  assert.equal(svc.status().configured, true);
  assert.equal(svc.status().networkState, 'verified');
});
test('changing cloud workspace clears old source ancestry without deleting local snapshots', async () => {
  const { repo, p, files } = fixture();
  repo.backup(p, files);
  const t = repo.tree();
  t.base = t.head;
  t.readRevision = t.head;
  let c = {
    endpoint: 'https://test.chatgpt.site',
    workspaceKey: Conn.newWorkspaceKey(),
    accessToken: 'test-private-token',
  };
  const svc = new Service(
    repo,
    {
      load: () => c,
      save: (v) => {
        c = v;
      },
    },
    { remote: { state: async () => ({ branches: [] }) } },
  );
  await svc.action('connect', { key: Conn.format({ ...c, workspaceKey: Conn.newWorkspaceKey() }) });
  assert.equal(t.readRevision, null);
  assert.equal(t.base, null);
  assert.ok(repo.data.revisions[t.head]);
});
