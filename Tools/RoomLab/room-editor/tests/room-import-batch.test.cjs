'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  B = require('../src/project/room-import-batch.cjs');
test('multi-room import preserves links between selected rooms and leaves unselected rooms unchanged', () => {
  const target = M.example(),
    source = M.example(),
    before = JSON.stringify(target);
  const r = B.prepare(target, new Map(), source, new Map(), 'physics', [
    { courseId: 'physics', roomId: 'jet-room', mode: 'independent' },
    { courseId: 'physics', roomId: 'ice-room', mode: 'independent' },
  ]);
  assert.equal(JSON.stringify(target), before);
  assert.equal(r.project.courses[0].rooms.length, 5);
  assert.equal(r.rooms.length, 2);
  const c = r.project.courses[0];
  assert.equal(c.connections.length, 3);
  assert.ok(
    c.connections.some((w) => w.from.roomId === r.rooms[0].id && w.to.roomId === r.rooms[1].id),
  );
  assert.deepEqual(c.rooms.slice(0, 3), target.courses[0].rooms);
});
test('overwrite keeps target room ID and graph, preserves matching ports, and removes incompatible wires', () => {
  const p = M.example(),
    source = M.example();
  source.courses[0].rooms[0].notes = 'new room content';
  const r = B.prepare(p, new Map(), source, new Map(), 'physics', [
    { courseId: 'physics', roomId: 'jet-room', mode: 'overwrite', targetRoomId: 'jet-room' },
  ]);
  assert.equal(r.project.courses[0].rooms.length, 3);
  const room = r.project.courses[0].rooms[0];
  assert.equal(room.id, 'jet-room');
  assert.deepEqual(room.graph, p.courses[0].rooms[0].graph);
  assert.equal(room.notes, 'new room content');
  assert.equal(room.exits[0].id, 'jet-exit');
  assert.equal(r.project.courses[0].connections.length, 2);
  source.courses[0].rooms[0].exits = [];
  source.courses[0].connections = [];
  const removed = B.prepare(p, new Map(), source, new Map(), 'physics', [
    { courseId: 'physics', roomId: 'jet-room', mode: 'overwrite', targetRoomId: 'jet-room' },
  ]);
  assert.equal(removed.droppedConnections, 1);
  assert.equal(removed.project.courses[0].connections.length, 1);
});
test('batch rejects duplicate overwrite targets without partial changes', () => {
  const p = M.example(),
    before = JSON.stringify(p),
    source = M.example();
  source.courses[0].rooms[1].name = source.courses[0].rooms[0].name;
  assert.throws(
    () =>
      B.prepare(p, new Map(), source, new Map(), 'physics', [
        { courseId: 'physics', roomId: 'jet-room', mode: 'overwrite', targetRoomId: 'jet-room' },
        { courseId: 'physics', roomId: 'ice-room', mode: 'overwrite', targetRoomId: 'jet-room' },
      ]),
    /重复/,
  );
  assert.equal(JSON.stringify(p), before);
});
