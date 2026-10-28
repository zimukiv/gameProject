'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { prepare } = require('../src/project/room-import.cjs'),
  Seeds = require('../src/assets/seeds.cjs');
function sample() {
  const p = M.example(),
    s = Seeds.seeds();
  p.assets = s.assets;
  p.courses[0].artBindings = s.bindings;
  return { p, files: s.files };
}
test('room import appends without changing existing rooms or rules; remaps thermal and rail child references', () => {
  const a = sample(),
    b = sample(),
    before = JSON.stringify(a.p),
    sourceBefore = JSON.stringify(b.p);
  const r = prepare(a.p, a.files, b.p, b.files, 'physics', 'physics', 'ice-room');
  assert.equal(JSON.stringify(a.p), before);
  assert.equal(JSON.stringify(b.p), sourceBefore);
  assert.equal(r.project.id, a.p.id);
  assert.equal(r.project.courses[0].rooms.length, 4);
  assert.deepEqual(r.project.courses[0].rooms.slice(0, 3), a.p.courses[0].rooms);
  assert.deepEqual(r.project.settings, a.p.settings);
  assert.equal(r.addedAssets, 0);
  const room = r.project.courses[0].rooms[3];
  assert.notEqual(room.id, 'ice-room');
  assert.equal(room.name, '02 温控与累计融冰（导入 2）');
  assert.equal(
    room.objects.find((o) => o.type === 'physics.thermal').params.zoneId,
    room.zones[0].id,
  );
  const rail = prepare(
    a.p,
    a.files,
    b.p,
    b.files,
    'physics',
    'physics',
    'rail-room',
  ).project.courses[0].rooms[3].objects.find((o) => o.type === 'physics.rail');
  assert.ok(rail.params.path.every((n) => n.parentId === rail.id));
});
test('conflicting asset IDs and paths are copied and remapped without overwriting target bytes', () => {
  const a = sample(),
    b = sample(),
    id = 'seed-metal',
    path = b.p.assets.find((x) => x.id === id).path;
  b.files.set(path, new Uint8Array([1, 2, 3]));
  const old = a.files.get(path).slice(),
    r = prepare(a.p, a.files, b.p, b.files, 'physics', 'physics', 'ice-room'),
    room = r.project.courses[0].rooms[3],
    newId = room.artBindings['common.solid'].idle;
  assert.notEqual(newId, id);
  assert.equal(r.addedAssets, 1);
  assert.deepEqual(a.files.get(path), old);
  const meta = r.project.assets.find((x) => x.id === newId);
  assert.notEqual(meta.path, path);
  assert.deepEqual([...r.files.get(meta.path)], [1, 2, 3]);
  assert.equal(
    require('../src/project/archive.cjs').unpack(
      require('../src/project/archive.cjs').pack(r.project, r.files),
    ).project.courses[0].rooms.length,
    4,
  );
});
