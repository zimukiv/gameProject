'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  O = require('../src/project/room-order.cjs');
test('moving room tabs changes array order only and keeps IDs, ports, wires and content', () => {
  const p = M.example(),
    c = p.courses[0],
    byId = new Map(c.rooms.map((r) => [r.id, JSON.stringify(r)])),
    wires = JSON.stringify(c.connections);
  assert.equal(O.move(c, 'rail-room', 'jet-room'), true);
  assert.deepEqual(
    c.rooms.map((r) => r.id),
    ['rail-room', 'jet-room', 'ice-room'],
  );
  assert.equal(JSON.stringify(c.connections), wires);
  assert.ok(c.rooms.every((r) => JSON.stringify(r) === byId.get(r.id)));
  assert.deepEqual(M.validate(p).errors, []);
  assert.equal(O.move(c, 'rail-room', 'ice-room', true), true);
  assert.deepEqual(
    c.rooms.map((r) => r.id),
    ['jet-room', 'ice-room', 'rail-room'],
  );
});
test('live sync keeps one-sided room ordering and reports different concurrent orders', () => {
  const { merge } = require('../src/project/merge.cjs'),
    base = M.example(),
    local = M.clone(base),
    remote = M.clone(base);
  O.move(local.courses[0], 'rail-room', 'jet-room');
  remote.courses[0].rooms[1].notes = 'remote note';
  let r = merge(base, local, remote);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.value.courses[0].rooms[0].id, 'rail-room');
  O.move(remote.courses[0], 'ice-room', 'jet-room');
  r = merge(base, local, remote);
  assert.ok(r.conflicts.some((p) => p.endsWith('.rooms.@order')));
  assert.equal(r.value.courses[0].rooms[0].id, 'rail-room');
});
