'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
function setup(collision = true, policy = 'checkpoint') {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.aiPolicy = 'inherit';
  r.objects = [M.object('start', 'common.aiStart', 2, 13)];
  r.objects[0].collision = collision;
  r.objects[0].resetPolicy = policy;
  return new Engine(p);
}
function touch(g, solid = true) {
  Object.assign(g.player, {
    x: 68,
    y: solid ? 13 * 32 - 28 : 13 * 32 + 4,
    vy: 0,
    vx: 0,
    grounded: false,
  });
  g.update(1 / 120);
}
for (const solid of [true, false])
  test(
    (solid ? 'solid' : 'hollow') + ' AI start can summon again after each checkpoint death',
    () => {
      const g = setup(solid);
      for (let life = 0; life < 3; life++) {
        touch(g, solid);
        assert.equal(g.ai.active, true, 'life ' + life + ' should activate AI');
        g.retry();
        assert.equal(g.ai.active, false);
        assert.equal(
          g.objectStates.get('start').used,
          false,
          'checkpoint must not retain a used flag',
        );
      }
    },
  );
test('checkpoint state is an independent snapshot, including nested movable animation', () => {
  const g = setup(),
    cp = g.checkpoint.state;
  touch(g);
  assert.equal(cp.objects.start.used, false);
  g.objectStates.get('start').cooldown = 3;
  assert.equal(cp.objects.start.cooldown, 0);
});

test('AI start rearms on death even when its independent reset policy preserves state', () => {
  const g = setup(true, 'preserve');
  touch(g);
  assert.equal(g.ai.active, true);
  g.retry();
  assert.equal(g.ai.active, false);
  assert.equal(g.objectStates.get('start').used, false);
  touch(g);
  assert.equal(g.ai.active, true);
});
test('inherited AI disabled on room entry can be summoned again without charging tokens twice', () => {
  const g = setup(true, 'preserve');
  g.tokens = 20;
  g.fire(g.room.objects[0]);
  assert.equal(g.ai.tier, 2);
  g.room.aiPolicy = 'off';
  g.loadRoom(g.room.id, g.entry.id, {
    tokens: 12,
    charges: 3,
    recharge: 0,
    freeDash: true,
    dashCount: 0,
  });
  assert.equal(g.ai.active, false);
  g.retry();
  touch(g);
  assert.equal(g.ai.active, true);
  assert.equal(g.ai.tier, 2);
  assert.equal(g.tokens, 12);
  assert.equal(g.events.filter((e) => e.type === 'ai-start').at(-1).resumed, true);
});
test('serialized movable animations do not mutate their saved snapshot', () => {
  const g = setup();
  g.movableStates.set('block', { anim: { t: 0, from: 0, to: 1 } });
  const saved = g.serializeRoom();
  g.movableStates.get('block').anim.t = 0.5;
  assert.equal(saved.movables.block.anim.t, 0);
});
