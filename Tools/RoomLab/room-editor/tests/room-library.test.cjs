'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  C = require('../src/cloud/codec.cjs'),
  { Remote } = require('../src/cloud/connection.cjs'),
  { Service } = require('../src/cloud/service.cjs'),
  { Repository } = require('../src/cloud/repository.cjs');
test('flat cloud rooms roundtrip with assets, isolation and no tree mutation', async () => {
  const { storageFixture } = await import('../../room-cloud/tests/storage-fixture.mjs'),
    { handle } = await import('../../room-cloud/lib/sync-handler.mjs');
  const env = storageFixture(),
    config = { endpoint: 'https://rooms.test', workspaceKey: 'a'.repeat(43), accessToken: 'test' };
  const remote = new Remote(config, (url, options) => handle(new Request(url, options), env));
  const repo = new Repository(fs.mkdtempSync(path.join(os.tmpdir(), 'room-flat-'))),
    service = new Service(repo, { load: () => config }, { remote });
  const p = M.themedExample(),
    course = p.courses[0],
    room = course.rooms[0],
    before = JSON.stringify(repo.data),
    projectBefore = JSON.stringify(p);
  try {
    const uploaded = await service.action('roomLibraryUpload', {
      project: p,
      files: [],
      courseId: course.id,
      roomId: room.id,
    });
    const listing = await service.action('roomLibraryList');
    assert.equal(listing.rooms.length, 1);
    assert.equal(listing.rooms[0].id, uploaded.room.id);
    const loaded = await service.action('roomLibraryRead', { id: uploaded.room.id });
    assert.equal(loaded.project.courses[0].rooms.length, 1);
    assert.equal(loaded.project.courses[0].rooms[0].name, room.name);
    assert.deepEqual(loaded.project.courses[0].rooms[0].objects, room.objects);
    assert.equal(JSON.stringify(repo.data), before);
    assert.equal(JSON.stringify(p), projectBefore);
    const state = await remote.state();
    assert.equal(state.revisions.length, 0);
    assert.equal(state.branches.length, 0);
    const foreign = new Remote({ ...config, workspaceKey: 'b'.repeat(43) }, (url, options) =>
      handle(new Request(url, options), env),
    );
    assert.equal((await foreign.request('rooms')).rooms.length, 0);
    await assert.rejects(() => foreign.request('rooms/' + uploaded.room.id), /不存在/);
    const record = await remote.request('rooms/' + uploaded.room.id);
    assert.equal(record.revision.parent, null);
    const same = await remote.request('rooms', { revision: record.revision });
    assert.equal(same.room.id, uploaded.room.id);
    assert.equal((await remote.request('rooms')).rooms.length, 1);
    const multi = C.encode(p, []),
      rev = C.revision(multi, 'test', 'invalid', null);
    await remote.uploadChunks(multi);
    await assert.rejects(() => remote.request('rooms', { revision: rev }), /单个房间/);
    rev.parent = uploaded.room.id;
    await assert.rejects(() => remote.request('rooms', { revision: rev }), /父节点/);
  } finally {
    env.close();
  }
});
