'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  D = require('../src/editor/draw.cjs'),
  Layout = require('../src/editor/graph-layout.cjs'),
  C = require('../src/assets/catalog.cjs'),
  { seeds } = require('../src/assets/seeds.cjs');
function project() {
  const p = M.example(),
    s = seeds();
  p.assets = s.assets;
  p.courses[0].artBindings = s.bindings;
  return p;
}
test('eligible art is scoped to course, matching subtype, or explicitly shared in that major category', () => {
  const p = project();
  p.assets.push(
    { id: 'shared', courseId: 'common', category: 'mechanism', subcategory: 'shared' },
    { id: 'wrong-course', courseId: 'other', category: 'mechanism', subcategory: 'physics.ice' },
    { id: 'unclassified', courseId: 'physics' },
  );
  assert.deepEqual(
    C.available(p, 'physics', 'physics.ice').map((a) => a.id),
    ['seed-ice-solid', 'seed-ice-cracked', 'shared'],
  );
  assert.deepEqual(
    C.available(p, 'physics', 'common.solid').map((a) => a.id),
    ['seed-metal'],
  );
});
test('older artwork without taxonomy retains category inference from existing references', () => {
  const p = project();
  for (const a of p.assets) {
    delete a.category;
    delete a.subcategory;
  }
  assert.deepEqual(C.classification(p, p.assets[1]), {
    category: 'mechanism',
    subcategory: 'physics.ice',
  });
  assert.equal(C.available(p, 'physics', 'physics.jet').length, 2);
});
test('graph ports project the actual room cells through the same thumbnail fit', () => {
  const r = M.example().courses[0].rooms[0],
    ports = D.graphPorts(r),
    thumb = Layout.card(r).thumb,
    view = D.fit(r, thumb.width, thumb.height, 0),
    e = r.exits[0];
  assert.equal(ports.exits[0].x, r.graph.x + thumb.x + view.x + (e.x + 0.5) * 32 * view.scale);
  assert.equal(ports.exits[0].y, r.graph.y + thumb.y + view.y + (e.y + e.h / 2) * 32 * view.scale);
  assert.ok(ports.entries[0].x < ports.exits[0].x);
  assert.ok(ports.entries[0].y > ports.exits[0].y);
  const old = ports.exits[0];
  e.y += 2;
  assert.ok(D.graphPorts(r).exits[0].y > old.y);
  r.cols += 10;
  assert.equal(
    D.graphPorts(r).exits[0].x,
    old.x,
    'fixed cells retain their thumbnail offset while the card grows',
  );
});
test('graph thumbnails keep the room aspect ratio and a common cell scale across differently sized rooms', () => {
  const rooms = M.example().courses[0].rooms,
    a = Layout.card(rooms[0]),
    b = Layout.card(rooms[2]);
  assert.equal(a.thumb.width / a.thumb.height, rooms[0].cols / rooms[0].rows);
  assert.equal(b.thumb.width / b.thumb.height, rooms[2].cols / rooms[2].rows);
  assert.equal(a.thumb.width / rooms[0].cols, b.thumb.width / rooms[2].cols);
  assert.ok(b.width > a.width && b.height > a.height);
});
