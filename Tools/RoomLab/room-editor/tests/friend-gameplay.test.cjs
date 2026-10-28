'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  R = require('../src/plugins/registry.cjs');
const Collision = require('../src/project/collision.cjs');
const { Engine } = require('../src/runtime/engine.cjs');
function game(type, params = {}) {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.objects = [R.instantiate(p, type, 'probe', 8, 10)];
  Object.assign(r.objects[0].params, params);
  if (type === 'common.checkpoint') r.objects[0].collision = false;
  return new Engine(p);
}
test('checkpoint records respawn, resources and room state without changing the project', () => {
  assert.equal(R.get('common.checkpoint').missing, undefined);
  const g = game('common.checkpoint'),
    o = g.room.objects[0],
    before = JSON.stringify(g.project);
  assert.equal(o.collision, false);
  g.tokens = 17;
  g.charges = 2;
  g.score = 125;
  g.roomEnvironment = 'cold';
  g.fire(o);
  assert.equal(g.visualState(o), 'active');
  assert.equal(g.checkpoint.spawn.objectId, o.id);
  g.tokens = 1;
  g.charges = 0;
  g.score = 0;
  g.roomEnvironment = 'hot';
  g.player.x = 0;
  g.retry('test');
  assert.equal(g.player.x, 260);
  assert.equal(g.player.y, 324);
  assert.equal(g.tokens, 17);
  assert.equal(g.charges, 2);
  assert.equal(g.score, 125);
  assert.equal(g.roomEnvironment, 'cold');
  assert.equal(g.player.freeDash, true);
  assert.equal(g.player.dashCount, 0);
  assert.equal(g.checkpoint.spawn.objectId, o.id);
  assert.equal(JSON.stringify(g.project), before);
});
test('rail side contact is opt-in and can be disabled on a migrated device', () => {
  for (const enabled of [false, true]) {
    const g = game('physics.rail', { sideTrigger: enabled }),
      o = g.room.objects[0];
    Object.assign(g.player, { x: 232, y: 329, vy: 0, grounded: false });
    g.triggerObjects(357);
    assert.equal(g.objectStates.get(o.id).used, enabled);
  }
});
test('new solid checkpoint respawns above its collision body', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  const cp = R.instantiate(p, 'common.checkpoint', 'solid-cp', 8, 10);
  assert.equal(cp.collision, true);
  r.objects = [cp];
  const g = new Engine(p);
  g.fire(g.room.objects[0]);
  g.retry();
  assert.equal(g.player.y + g.player.h, cp.y * 32);
});
test('all jet directions respect explicit collision settings independently of triggers', () => {
  for (const direction of ['up', 'down', 'left', 'right', 'custom']) {
    const o = R.instantiate(M.example(), 'physics.jet', 'jet', 8, 10);
    o.params.direction = direction;
    for (const collision of [true, false]) {
      o.collision = collision;
      assert.equal(Collision.enabled(o, 'objects', R.get(o.type)), collision);
    }
  }
});
