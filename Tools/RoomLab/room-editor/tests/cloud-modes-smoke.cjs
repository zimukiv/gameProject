'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const C = require('../src/cloud/codec.cjs'),
  { Remote, newWorkspaceKey } = require('../src/cloud/connection.cjs'),
  { Repository } = require('../src/cloud/repository.cjs'),
  { Service } = require('../src/cloud/service.cjs'),
  M = require('../src/project/model.cjs'),
  { seeds } = require('../src/assets/seeds.cjs');
async function run(c) {
  c = { ...c, workspaceKey: newWorkspaceKey() };
  const remote = new Remote(c),
    make = () => {
      const repo = new Repository(fs.mkdtempSync(path.join(os.tmpdir(), 'room-mode-test-')));
      return { repo, svc: new Service(repo, { load: () => c }, { remote: new Remote(c) }) };
    };
  const a = make(),
    b = make(),
    seed = seeds(),
    p = M.example();
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  await a.svc.action('draft', { project: p, files: [...seed.files] });
  assert.equal(a.repo.status().history.length, 0);
  await a.svc.action('manualSave', { message: '根版本' });
  const root = a.repo.tree().head,
    branch = a.repo.tree().branch;
  console.log('root_saved');
  await b.svc.action('fetchBranch', { branch });
  await b.svc.action('checkout', { id: b.repo.data.trees[0].id });
  for (const x of [a, b]) await x.svc.action('mode', { mode: 'live' });
  let pa = M.clone(p),
    pb = M.clone(p);
  pa.courses[0].rooms[0].notes = 'A端即时修改';
  pb.courses[0].rooms[1].notes = 'B端即时修改';
  const tick = async (x, project) => {
    const r = await x.svc.action('live', {
      project,
      files: [...seed.files],
      treeId: x.repo.tree().id,
    });
    return { r, p: r.project || project };
  };
  let r = await tick(a, pa);
  assert.equal(r.r.online, false);
  r = await tick(b, pb);
  pb = r.p;
  for (let i = 0; i < 4; i++) {
    r = await tick(a, pa);
    pa = r.p;
    r = await tick(b, pb);
    pb = r.p;
  }
  assert.equal(pa.courses[0].rooms[1].notes, 'B端即时修改');
  assert.equal(pb.courses[0].rooms[0].notes, 'A端即时修改');
  assert.deepEqual(pa, pb);
  let state = await remote.state();
  assert.equal(state.branches.length, 1);
  assert.equal(state.revisions.length, 1);
  assert.equal(a.repo.status().history.length, 1);
  console.log('live_converged_without_versions');
  pa.courses[0].rooms[0].notes = 'A端冲突';
  pb.courses[0].rooms[0].notes = 'B端冲突';
  await tick(a, pa);
  r = await tick(b, pb);
  assert.ok(r.r.conflicts.length);
  assert.equal(r.p.courses[0].rooms[0].notes, 'B端冲突');
  assert.ok(fs.existsSync(path.join(b.repo.root, 'drafts', 'live-conflict-local.zip')));
  const resolved = await b.svc.action('resolveLive', { choice: 'remote' });
  assert.equal(resolved.project.courses[0].rooms[0].notes, 'A端冲突');
  pb = resolved.project;
  r = await tick(b, pb);
  assert.equal(r.r.conflicts.length, 0);
  console.log('live_conflict_preserved_and_resolved');
  await a.svc.action('draft', { project: pa, files: [...seed.files], treeId: a.repo.tree().id });
  await a.svc.action('manualSave', { message: 'A 子分支' });
  assert.equal(a.repo.data.revisions[a.repo.tree().head].parent, root);
  await b.svc.action('draft', { project: pb, files: [...seed.files], treeId: b.repo.tree().id });
  await b.svc.action('manualSave', { message: 'B 子分支' });
  assert.equal(b.repo.data.revisions[b.repo.tree().head].parent, root);
  state = await remote.state();
  assert.equal(state.branches.length, 3);
  assert.equal(state.revisions.length, 3);
  assert.equal(state.revisions.filter((v) => v.parent === root).length, 2);
  for (const x of [a, b]) await x.svc.action('mode', { mode: 'manual' });
  assert.equal((await a.svc.action('live', { project: pa, files: [...seed.files] })).online, false);
  console.log(
    JSON.stringify({
      ok: true,
      transport: c.endpoint,
      liveTwoWay: true,
      noAutomaticVersions: true,
      manualChildrenFromLastRead: 2,
      liveConflictResolution: true,
      modeSwitch: true,
    }),
  );
}
if (process.argv.includes('--stdin')) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  console.log('Ready for mode test JSON on stdin (input is hidden).');
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
    if (!/[\r\n]/.test(input)) return;
    const c = JSON.parse(input.trim());
    input = '';
    process.stdin.pause();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    run(c)
      .then(() => process.exit(0))
      .catch((e) => {
        console.error(e.stack);
        process.exit(1);
      });
  });
} else
  run({ endpoint: 'http://127.0.0.1:18859', accessToken: 'local-mode-test' }).catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
