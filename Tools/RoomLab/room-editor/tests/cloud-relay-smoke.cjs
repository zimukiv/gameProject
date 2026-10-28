'use strict';
// Same test runs against local Worker and live private Sites. Live credentials arrive on stdin only.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { Remote, newWorkspaceKey } = require('../src/cloud/connection.cjs'),
  { Repository } = require('../src/cloud/repository.cjs'),
  { Service } = require('../src/cloud/service.cjs'),
  C = require('../src/cloud/codec.cjs'),
  M = require('../src/project/model.cjs'),
  { seeds } = require('../src/assets/seeds.cjs');
async function run(c) {
  // Always isolate acceptance data from the user's production workspace.
  c = { ...c, workspaceKey: newWorkspaceKey() };
  const remote = new Remote(c),
    make = () => {
      const repo = new Repository(fs.mkdtempSync(path.join(os.tmpdir(), 'room-cloud-live-')));
      return { repo, svc: new Service(repo, { load: () => c }, { remote }) };
    };
  const a = make(),
    b = make(),
    p = M.example(),
    seed = seeds();
  p.assets = seed.assets;
  p.courses[0].artBindings = seed.bindings;
  const binary = Buffer.alloc(C.CHUNK + 179, 0);
  for (let i = 0; i < binary.length; i++) binary[i] = i % 251;
  p.assets.push({
    id: 'cloud-binary',
    name: '分块素材',
    path: 'assets/cloud-binary.png',
    mime: 'image/png',
    category: 'other',
  });
  seed.files.set('assets/cloud-binary.png', binary);
  await a.svc.action('backup', { project: p, files: [...seed.files] });
  await a.svc.action('sync');
  const branch = a.repo.tree().branch,
    first = a.repo.tree().head;
  await b.svc.action('fetchBranch', { branch });
  await b.svc.action('checkout', { id: b.repo.data.trees[0].id });
  assert.equal(b.repo.tree().head, first);
  assert.deepEqual(
    Buffer.from(new Map(b.repo.read(b.repo.tree()).files).get('assets/cloud-binary.png')),
    binary,
  );
  const pa = M.clone(p),
    pb = M.clone(p);
  pa.courses[0].rooms[0].notes = '端 A';
  pb.courses[0].rooms[0].notes = '端 B';
  await a.svc.action('backup', { project: pa, files: [...seed.files] });
  await b.svc.action('backup', { project: pb, files: [...seed.files] });
  const results = await Promise.all([a.svc.action('sync'), b.svc.action('sync')]);
  assert.equal(results.filter((r) => r.conflict).length, 1);
  const state = await remote.state();
  assert.equal(state.branches.length, 2);
  assert.equal(state.revisions.length, 3);
  const names = [];
  for (const branch of state.branches) {
    const d = await remote.download(branch.head);
    names.push(C.decode(d.snapshot.bytes).project.courses[0].rooms[0].notes);
  }
  assert.ok(names.includes('端 A'));
  assert.ok(names.includes('端 B'));
  const isolated = await new Remote({ ...c, workspaceKey: newWorkspaceKey() }).state();
  assert.equal(isolated.branches.length, 0);
  await assert.rejects(
    remote.request(
      'chunks/' + C.hash(Buffer.from('expected')),
      Buffer.from('corrupt'),
      'PUT',
      true,
    ),
    /校验/,
  );
  const snap = C.encode(p, seed.files);
  const missing = await remote.request('missing', { hashes: [...snap.chunks.keys()] });
  assert.equal(missing.missing.length, 0);
  console.log(
    JSON.stringify({
      ok: true,
      transport: c.endpoint,
      devices: 2,
      conflictBranches: 2,
      immutableVersions: 3,
      assetsRoundTrip: true,
      multiChunk: true,
      workspaceIsolation: true,
      checksumRejection: true,
      deduplication: true,
    }),
  );
}
if (process.argv.includes('--stdin')) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  console.log('Ready for relay test JSON on stdin (input is hidden).');
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
    if (!/[\r\n]/.test(input)) return;
    const c = JSON.parse(input.trim());
    input = '';
    process.stdin.pause();
    run(c)
      .then(() => process.exit(0))
      .catch((e) => {
        console.error(e.message);
        process.exit(1);
      });
  });
} else
  run({ endpoint: 'http://127.0.0.1:18859', accessToken: 'local-test-token' }).catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
