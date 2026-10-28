'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
for (const type of ['physics.thermal', 'physics.jet', 'physics.rail', 'common.aiStart'])
  test(type + ' trigger remains active with collision disabled', () => {
    const p = M.example(),
      r = p.courses[0].rooms[0];
    r.aiPolicy = 'inherit';
    r.environment = 'cold';
    const o = M.object('ghost-trigger', type, 5, 6, {
      mode: 'hot',
      path: [
        { x: 5.5, y: 6.5 },
        { x: 8.5, y: 6.5 },
      ],
      once: false,
    });
    o.collision = false;
    o.trigger = { ...o.trigger, requiresAI: false };
    r.objects = [o];
    const g = new Engine(p);
    Object.assign(g.player, { x: 5 * 32 + 3, y: 6 * 32 + 2, vy: 0, grounded: false });
    g.update(1 / 120, {});
    assert.equal(g.objectStates.get(o.id).used, true);
    assert.ok(!g.colliders().some((c) => c.id === o.id));
    if (type === 'physics.thermal') assert.equal(g.roomEnvironment, 'hot');
  });
test('solid foot trigger still activates on top contact and ignores unrelated distant players', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0],
    o = M.object('solid-thermal', 'physics.thermal', 5, 6, { mode: 'hot' });
  o.collision = true;
  o.trigger = { ...o.trigger, requiresAI: false };
  r.objects = [o];
  const g = new Engine(p);
  Object.assign(g.player, { x: 5 * 32 + 3, y: 6 * 32 - g.player.h, vy: 0, grounded: false });
  g.update(1 / 120, {});
  assert.equal(g.roomEnvironment, 'hot');
  const other = new Engine(p);
  Object.assign(other.player, { x: 32, y: 32, vy: 0, grounded: false });
  other.update(1 / 120, {});
  assert.equal(other.objectStates.get(o.id).used, false);
});
