'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs');
test('repair clips only selected zone to original in-room coverage and preserves source', () => {
  const Repair = require('../src/project/repair-zone-bounds.cjs');
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.cols = 60;
  r.rows = 15;
  r.zones = [
    { id: 'outside', x: -1, y: 0, w: 44, h: 15, initial: 'cold' },
    { id: 'unchanged', x: 2, y: 3, w: 4, h: 5 },
  ];
  const original = JSON.stringify(p),
    result = Repair.prepare(p, ['outside']);
  assert.equal(JSON.stringify(p), original);
  assert.deepEqual(result.project.courses[0].rooms[0].zones[0], {
    id: 'outside',
    x: 0,
    y: 0,
    w: 43,
    h: 15,
    initial: 'cold',
  });
  assert.deepEqual(result.project.courses[0].rooms[0].zones[1], r.zones[1]);
  assert.equal(result.repairs.length, 1);
  const again = Repair.prepare(result.project, ['outside']);
  assert.equal(again.repairs.length, 0);
});
test('repair refuses a zone with no remaining room coverage', () => {
  const Repair = require('../src/project/repair-zone-bounds.cjs');
  const p = M.example();
  p.courses[0].rooms[0].zones = [{ id: 'outside', x: -4, y: 0, w: 2, h: 1 }];
  assert.throws(() => Repair.prepare(p, ['outside']), /交集/);
});
