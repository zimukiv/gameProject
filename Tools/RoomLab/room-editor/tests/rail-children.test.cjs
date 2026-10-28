'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs');
test('new accelerator starts node zero at its own center, with translated independent defaults', () => {
  const Registry = require('../src/plugins/registry.cjs');
  const a = Registry.instantiate(M.example(), 'physics.rail', 'a', 10, 7);
  assert.deepEqual({ x: a.params.path[0]?.x, y: a.params.path[0]?.y }, { x: 10.5, y: 7.5 });
  assert.ok(a.params.path.length >= 2);
});
test('invalid child ownership or duplicate IDs are rejected by project validation', () => {
  const p = M.example(),
    o = p.courses[0].rooms[2].objects[0];
  o.params.path[0].parentId = 'missing';
  o.params.path[1].id = o.params.path[0].id;
  assert.ok(M.validate(p).errors.some((e) => e.includes('子节点')));
});
test('legacy path points gain stable child identities without moving or changing the input', () => {
  const p = M.example(),
    o = p.courses[0].rooms[2].objects[0];
  for (const n of o.params.path) {
    delete n.id;
    delete n.parentId;
  }
  const before = JSON.stringify(p),
    next = M.migrate(p),
    nodes = next.courses[0].rooms[2].objects[0].params.path;
  assert.ok(nodes.every((n) => n.id && n.parentId === o.id));
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(M.migrate(next), next);
  assert.deepEqual(
    nodes.map(({ x, y }) => ({ x, y })),
    o.params.path,
  );
});
test('copying a room creates new child IDs bound to the copied accelerator', () => {
  const p = M.example(),
    c = p.courses[0],
    original = c.rooms[2].objects[0],
    copy = M.duplicateRoom(c, 'rail-room'),
    o = copy.objects[0];
  assert.ok(
    o.params.path.every(
      (n) => n.id && n.parentId === o.id && !original.params.path.some((a) => a.id === n.id),
    ),
  );
  c.rooms.push(copy);
  assert.deepEqual(M.validate(p).errors, []);
});
test('moving the accelerator carries its children and keeps their offsets', () => {
  const N = require('../src/project/rail-nodes.cjs'),
    o = M.example().courses[0].rooms[2].objects[0],
    before = o.params.path.map((n) => ({ ...n }));
  N.moveOwner(o, 8, 12);
  assert.deepEqual(
    o.params.path.map((n) => [n.x, n.y, n.id]),
    before.map((n) => [n.x + 2, n.y - 3, n.id]),
  );
});
test('node operations preserve ownership and support precise positions and stable reorder', () => {
  const N = require('../src/project/rail-nodes.cjs'),
    o = M.example().courses[0].rooms[2].objects[0],
    room = { cols: 36, rows: 18 },
    n = N.add(o, { x: 21.25, y: 11.75 });
  N.move(o, n.id, { x: 12.25, y: 9.75 }, room);
  assert.equal(n.x, 12.25);
  assert.equal(n.y, 9.75);
  N.reorder(o, n.id, -1);
  assert.equal(o.params.path[1].id, n.id);
  assert.equal(n.parentId, o.id);
  N.remove(o, n.id);
  assert.ok(!o.params.path.some((p) => p.id === n.id));
  assert.equal(N.roman(4), 'IV');
  assert.equal(N.roman(9), 'IX');
});
test('all region corners resize against the opposite corner and clamp to a valid room rectangle', () => {
  const R = require('../src/editor/region-handles.cjs'),
    z = { x: 4, y: 8, w: 10, h: 9 },
    room = { cols: 30, rows: 17 };
  assert.deepEqual(R.resize(z, 'nw', { x: 2, y: 6 }, room), { x: 2, y: 6, w: 12, h: 11 });
  assert.deepEqual(R.resize(z, 'ne', { x: 20, y: 5 }, room), { x: 4, y: 5, w: 16, h: 12 });
  assert.deepEqual(R.resize(z, 'sw', { x: 1, y: 15 }, room), { x: 1, y: 8, w: 13, h: 7 });
  assert.deepEqual(R.resize(z, 'se', { x: 18, y: 16 }, room), { x: 4, y: 8, w: 14, h: 8 });
  assert.deepEqual(R.resize(z, 'nw', { x: 29, y: 30 }, room), { x: 13, y: 16, w: 1, h: 1 });
});
