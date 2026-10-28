'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs');
let S;
try {
  S = require('../src/project/selection.cjs');
} catch {}
test('marquee includes intersecting blocks and Shift selection adds or inverts only its range', () => {
  assert.ok(S, 'selection module is available');
  const r = M.room('r', 'R');
  r.tiles = [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
  ];
  const a = S.box(r, { x: 1, y: 1 }, { x: 2, y: 2 });
  assert.equal(a.filter((x) => x.kind === 'tiles').length, 1);
  const b = S.box(r, { x: 3, y: 2 }, { x: 3, y: 2 });
  const both = S.combine(a, b, 'add');
  assert.equal(both.length, a.length + 1);
  assert.deepEqual(S.combine(both, a, 'invert'), b);
  assert.deepEqual(S.combine(a, a, 'add'), a);
});
test('moving a mixed group carries rail children once and rejects overlapping terrain atomically', () => {
  assert.ok(S);
  const r = M.room('r', 'R');
  r.tiles = [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 5, y: 2 },
  ];
  r.objects = [
    {
      id: 'rail',
      type: 'physics.rail',
      x: 2,
      y: 3,
      params: { path: [{ id: 'n', parentId: 'rail', x: 2.5, y: 4 }] },
    },
  ];
  const refs = [
    { kind: 'tiles', x: 2, y: 2 },
    { kind: 'tiles', x: 3, y: 2 },
    { kind: 'objects', id: 'rail' },
  ];
  const before = JSON.stringify(r);
  assert.equal(S.move(r, refs, 2, 0), false);
  assert.equal(JSON.stringify(r), before);
  assert.equal(S.move(r, refs, 0, 1), true);
  assert.equal(r.objects[0].params.path[0].y, 5);
  assert.equal(refs[0].y, 3);
});
test('batch deletion cleans bindings and connections and protects the final entrance', () => {
  assert.ok(S);
  const p = M.example(),
    c = p.courses[0],
    r = c.rooms[0];
  assert.throws(() => S.remove(c, r, [{ kind: 'entries', id: r.entries[0].id }]), /入口/);
  const exit = r.exits[0];
  S.remove(c, r, [{ kind: 'exits', id: exit.id }]);
  assert.ok(!c.connections.some((w) => w.from.exitId === exit.id));
});
