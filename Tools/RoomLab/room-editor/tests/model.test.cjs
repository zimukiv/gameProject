'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs');
test('first-course example validates with independent room dimensions', () => {
  const p = M.example();
  assert.deepEqual(M.validate(p).errors, []);
  assert.equal(p.courses.length, 1);
  assert.equal(p.courses[0].kind, 'physics');
  assert.equal(p.courses[0].rooms[2].cols, 36);
});
test('v1 migration preserves rooms, targets and converts spawn into named entrances', () => {
  const v1 = require('./fixtures/v1-example.json');
  const p = M.migrate(v1);
  assert.equal(p.version, 2);
  assert.equal(p.courses[0].rooms.length, 2);
  assert.deepEqual(M.validate(p).errors, []);
  assert.equal(p.courses[0].connections[0].to.entryId, 'chase-entry');
  assert.equal(p.courses[0].rooms[0].movables[0].targetX, 7);
});

test('v1 room-local object IDs are remapped to globally unique IDs with references intact', () => {
  const old = JSON.parse(JSON.stringify(require('./fixtures/v1-example.json')));
  old.rooms[1].pads = JSON.parse(JSON.stringify(old.rooms[0].pads));
  old.rooms[1].blocks = JSON.parse(JSON.stringify(old.rooms[0].blocks));
  const p = M.migrate(old);
  assert.deepEqual(M.validate(p).errors, []);
  for (const r of p.courses[0].rooms)
    for (const b of r.movables) assert.ok(r.objects.some((o) => o.id === b.padId));
});

test('missing thermal association is visible when editing and rejects play', () => {
  const p = M.example();
  p.courses[0].rooms[1].zones = [];
  assert.ok(M.validate(p).warnings.some((w) => w.includes('温控区域')));
  assert.ok(M.validate(p, { play: true }).errors.some((w) => w.includes('温控区域')));
});
test('resize returns out-of-bounds objects without mutating/deleting the original', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0],
    original = JSON.stringify(r);
  const s = M.resizeRoom(r, 16, 12);
  assert.ok(s.out.some((v) => v.id === 'jet-exit'));
  assert.ok(s.out.some((v) => v.kind === 'tile'));
  assert.equal(JSON.stringify(r), original);
  const expanded = M.resizeRoom(r, 40, 22);
  assert.equal(expanded.out.length, 0);
  assert.equal(expanded.room.tiles.length, r.tiles.length);
});
test('renaming rooms/ports never changes the links', () => {
  const p = M.example(),
    edge = JSON.stringify(p.courses[0].connections);
  p.courses[0].rooms[0].name = '改名';
  p.courses[0].rooms[1].entries[0].name = '新的入口';
  assert.equal(JSON.stringify(p.courses[0].connections), edge);
  assert.deepEqual(M.validate(p).errors, []);
});
test('room copying rebinds zone and movable references', () => {
  const p = M.example(),
    c = p.courses[0],
    copy = M.duplicateRoom(c, 'ice-room');
  c.rooms.push(copy);
  assert.ok(
    copy.objects
      .filter((o) => o.type === 'physics.thermal')
      .every((o) => copy.zones.some((z) => z.id === o.params.zoneId)),
  );
  assert.deepEqual(M.validate(p).errors, []);
});
test('one output has one wire and multiple outputs may share an entrance', () => {
  const p = M.example(),
    c = p.courses[0];
  M.connect(c, 'jet-room', 'jet-exit', 'rail-room', 'rail-room-entry');
  assert.equal(c.connections.length, 2);
  assert.equal(c.connections.find((w) => w.from.exitId === 'jet-exit').to.roomId, 'rail-room');
  assert.deepEqual(M.validate(p).errors, []);
});
test('bad links, image paths and buried entrance reject unsafe play data', () => {
  const p = M.example();
  p.courses[0].connections[0].to.entryId = 'missing';
  assert.ok(M.validate(p).errors.length);
  const q = M.example();
  q.assets.push({ id: 'bad', path: '../outside.png' });
  assert.ok(M.validate(q).errors.length);
  const a = M.example(),
    r = a.courses[0].rooms[0];
  r.tiles.push({ ...r.entries[0] });
  assert.ok(M.validate(a, { play: true }).errors.length);
});
