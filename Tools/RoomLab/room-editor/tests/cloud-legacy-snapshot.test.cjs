'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const C = require('../src/cloud/codec.cjs'),
  M = require('../src/project/model.cjs');
const { Remote } = require('../src/cloud/connection.cjs'),
  { unzipSync } = require('fflate');
function legacy(friend) {
  const p = M.example();
  delete p.compatibility;
  if (friend)
    p.courses[0].rooms[0].objects.push({
      id: 'old-cp',
      type: 'common.checkpoint',
      x: 5,
      y: 13,
      params: {},
      collision: false,
    });
  const bytes = Buffer.from(JSON.stringify(p, null, 2)),
    hash = C.hash(bytes);
  const files = [
    { path: 'project.json', hash, size: bytes.length, chunks: [{ hash, size: bytes.length }] },
  ];
  const revision = C.revision(
    { files, fingerprint: C.hash(C.canonical(files)) },
    'old-device',
    'old-save',
  );
  let chunkCalls = 0;
  const remote = new Remote(
    {
      endpoint: 'https://test.chatgpt.site',
      workspaceKey: 'a'.repeat(43),
      accessToken: 'isolated',
    },
    async (url) => {
      if (url.includes('/revisions/')) return Response.json(revision);
      chunkCalls++;
      return new Response(bytes);
    },
  );
  return { revision, remote, bytes, calls: () => chunkCalls };
}
test('old cloud snapshots retain original fingerprint and bytes before runtime migration', async () => {
  for (const friend of [false, true]) {
    const f = legacy(friend),
      incoming = await f.remote.download(f.revision.id);
    assert.equal(incoming.snapshot.fingerprint, f.revision.fingerprint);
    assert.deepEqual(Buffer.from(unzipSync(incoming.snapshot.bytes)['project.json']), f.bytes);
    const migrated = C.decode(incoming.snapshot.bytes).project;
    assert.equal(migrated.compatibility.runtime, '2.5.5');
    assert.equal(migrated.compatibility.importedProfile, friend ? 'friend-2.5.2' : undefined);
  }
});
test('tampered revision metadata is rejected before reading chunks', async () => {
  const f = legacy(false);
  f.revision.message = 'tampered';
  await assert.rejects(f.remote.download(f.revision.id), /校验失败/);
  assert.equal(f.calls(), 0);
});
