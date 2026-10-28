'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  A = require('../src/project/archive.cjs'),
  { standalone } = require('../src/project/room-export.cjs'),
  Seeds = require('../src/assets/seeds.cjs');
test('single room ZIP keeps internal IDs, custom settings and assets, drops cross-room runtime links', () => {
  const p = M.example(),
    s = Seeds.seeds();
  p.assets = s.assets;
  p.courses[0].artBindings = s.bindings;
  p.assets.push({ id: 'unused', path: 'assets/unused.png' });
  const before = JSON.stringify(p),
    r = standalone(p, 'physics', 'ice-room');
  assert.equal(JSON.stringify(p), before);
  assert.notEqual(r.id, p.id);
  assert.equal(r.courses.length, 1);
  assert.equal(r.courses[0].rooms.length, 1);
  assert.deepEqual(r.courses[0].rooms[0], p.courses[0].rooms[1]);
  assert.equal(r.courses[0].connections.length, 0);
  assert.equal(r.roomExport.externalConnections.length, 2);
  assert.equal(r.assets.length, s.assets.length - 1);
  const loaded = A.unpack(A.pack(r, s.files));
  assert.equal(loaded.project.courses[0].rooms[0].id, 'ice-room');
  assert.equal(loaded.files.size, 9);
});
