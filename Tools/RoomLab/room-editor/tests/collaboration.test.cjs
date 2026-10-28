'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { merge } = require('../src/project/merge.cjs'),
  M = require('../src/project/model.cjs'),
  { add } = require('../src/project/courses.cjs');
test('new course preserves the complete existing course, stable IDs and project identity', () => {
  const p = M.example(),
    before = M.clone(p),
    course = add(p);
  assert.equal(p.id, before.id);
  assert.deepEqual(p.courses[0], before.courses[0]);
  assert.equal(p.courses.length, 2);
  assert.ok(course.rooms[0].tiles.length);
  assert.deepEqual(M.validate(p).errors, []);
});
test('live merge combines edits to separate objects, rooms and tile coordinates', () => {
  const base = M.example(),
    a = M.clone(base),
    b = M.clone(base);
  a.courses[0].rooms[0].notes = 'A';
  b.courses[0].rooms[1].notes = 'B';
  a.courses[0].rooms[0].tiles.push({ x: 20, y: 2 });
  b.courses[0].rooms[0].tiles.push({ x: 21, y: 2 });
  const result = merge(base, a, b);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.value.courses[0].rooms[0].notes, 'A');
  assert.equal(result.value.courses[0].rooms[1].notes, 'B');
  assert.ok(result.value.courses[0].rooms[0].tiles.some((t) => t.x === 20 && t.y === 2));
  assert.ok(result.value.courses[0].rooms[0].tiles.some((t) => t.x === 21 && t.y === 2));
});
test('same-field live conflicts keep local value and identify the exact field; deletion versus edit also conflicts', () => {
  const base = { items: [{ id: 'a', value: 1 }] },
    a = { items: [{ id: 'a', value: 2 }] },
    b = { items: [{ id: 'a', value: 3 }] };
  let r = merge(base, a, b);
  assert.equal(r.value.items[0].value, 2);
  assert.equal(r.conflicts.length, 1);
  r = merge(base, { items: [] }, b);
  assert.equal(r.value.items.length, 0);
  assert.equal(r.conflicts.length, 1);
});
