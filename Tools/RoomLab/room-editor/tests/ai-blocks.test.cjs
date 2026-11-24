'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
const Registry = require('../src/plugins/registry.cjs');
function game(type) {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.aiPolicy = 'inherit';
  r.objects = [M.object('start', type, 2, 13)];
  return new Engine(p);
}
test('solid AI start is a full-cell collider activated by stepping on its top', () => {
  const g = game('common.aiStart'),
    block = g.colliders().find((c) => c.id === 'start');
  assert.equal(block.h, 32);
  Object.assign(g.player, { x: 68, y: 13 * 32 - 28, vy: 0, grounded: false });
  g.update(1 / 120);
  assert.equal(g.player.support, 'start');
  assert.equal(g.ai.active, true);
  assert.equal(g.events.filter((e) => e.type === 'ai-start').length, 1);
});
test('hollow AI start has no collision and activates on passing through its cell', () => {
  const g = game('common.aiStartHollow');
  assert.ok(!g.colliders().some((c) => c.id === 'start'));
  Object.assign(g.player, { x: 68, y: 13 * 32 + 4, vy: 0, grounded: false });
  g.update(1 / 120, { right: true });
  assert.equal(g.ai.active, true);
  assert.equal(g.player.support, 'tile-2-14');
  assert.ok(g.player.x > 68);
});
test('new rail blocks have independent editable paths', () => {
  const p = M.example(),
    a = Registry.instantiate(p, 'physics.rail', 'a', 4, 8),
    b = Registry.instantiate(p, 'physics.rail', 'b', 5, 8),
    length = b.params.path.length;
  a.params.path.push({ x: 1, y: 1 });
  assert.equal(b.params.path.length, length);
  assert.equal(Registry.get('physics.rail').defaults.path.length, length);
});
test('assignment submission waits for an active chase, removes AI and awards 50000 once', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0],
    submit = M.object('submit-assignment', 'common.assignmentSubmit', 2, 12);
  submit.collision = false;
  r.aiPolicy = 'inherit';
  r.objects = [submit];
  const g = new Engine(p),
    stand = () =>
      Object.assign(g.player, {
        x: submit.x * 32 + 3,
        y: submit.y * 32 + 2,
        vx: 0,
        vy: 0,
        grounded: false,
      }),
    leave = () => Object.assign(g.player, { x: 32, y: 32, vx: 0, vy: 0 });
  stand();
  g.update(1 / 120);
  assert.equal(g.score, 0);
  assert.equal(
    g.objectStates.get(submit.id).used,
    false,
    'inactive AI does not consume the device',
  );

  Object.assign(g.ai, { active: true, id: 'chase-ai', trail: [{ x: 1, y: 2 }] });
  g.courseState.aiActive = true;
  g.aiTrail = [{ x: 1, y: 2 }];
  g.update(1 / 120);
  assert.equal(g.score, 50000);
  assert.equal(g.ai.active, false);
  assert.equal(g.courseState.aiActive, false);
  assert.equal(g.ai.trail.length, 0);
  assert.equal(g.aiTrail.length, 0);
  assert.equal(g.objectStates.get(submit.id).used, true);
  assert.equal(g.events.filter((event) => event.type === 'ai-stop').length, 1);
  assert.ok(g.events.some((event) => event.type === 'assignment-submit' && event.score === 50000));

  leave();
  g.update(1 / 120);
  stand();
  g.objectStates.get(submit.id).cooldown = 0;
  g.update(1 / 120);
  assert.equal(g.score, 50000, 'once-only device cannot farm score');
});
