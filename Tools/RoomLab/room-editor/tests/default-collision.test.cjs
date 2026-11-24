'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  R = require('../src/plugins/registry.cjs'),
  Collision = require('../src/project/collision.cjs');
test('new palette blocks follow their definition collision default while explicit settings remain unchanged', () => {
  const p = M.example();
  for (const d of R.list('physics')) {
    const o = R.instantiate(p, d.type, 'new-' + d.type, 5, 6);
    const solid = d.defaultCollision !== false;
    assert.equal(o.collision, solid, d.type);
    assert.equal(Collision.enabled(o, 'objects', d), solid);
  }
  const old = p.courses[0].rooms[0].objects[0];
  old.collision = false;
  assert.equal(M.migrate(p).courses[0].rooms[0].objects[0].collision, false);
});
