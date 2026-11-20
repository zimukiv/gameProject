'use strict';
// Stage 3 root-cause test for the awake/coffee mechanism using real engine
// frames (no direct plugin calls for the trigger path): with coffee vs without,
// walking in from the side and dropping from above, at rest and moving, with
// collision toggle on/off. This reproduces the reported "no visible boost"
// before fixing it.
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');

const T = 32;
function scene() {
  const project = M.themedExample(),
    course = project.courses.find((c) => c.kind === 'slacker'),
    room = course.rooms[0],
    awake = room.objects.find((o) => o.type === 'slacker.awake');
  assert.ok(awake, 'starter room has an awake board');
  const engine = new Engine(project, course.id, room.id),
    state = engine.objectStates.get(awake.id);
  return { project, course, room, awake, engine, state };
}
function stand(engine, x, y) {
  Object.assign(engine.player, {
    x: x * T + 6,
    y: y * T + T - engine.player.h,
    vx: 0,
    vy: 0,
    grounded: true,
    launched: false,
    launchX: 0,
    face: 1,
  });
}
test('without coffee the awake board is solid and never fires', () => {
  const s = scene();
  stand(s.engine, 11, 11);
  let fired = false;
  for (let i = 0; i < 90; i++) {
    s.engine.update(1 / 120, { right: true });
    if (s.engine.events.some((e) => e.type === 'awake')) fired = true;
  }
  assert.equal(fired, false, 'no coffee means no boost');
  assert.ok(
    s.engine.player.x < (s.awake.x + 0.9) * T,
    'solid board blocks the walking player at its left edge',
  );
  assert.equal(s.engine.objectStates.get(s.awake.id).boosts || 0, 0);
});
test('with coffee walking in from the left really accelerates for multiple frames', () => {
  const s = scene();
  s.engine.items['item.coffee'] = 1;
  stand(s.engine, 10.2, 11);
  let firedAt = -1,
    boostedFrames = 0,
    maxVx = 0;
  const speed = Number(s.awake.params.speed) || 0;
  for (let i = 0; i < 90; i++) {
    s.engine.update(1 / 120, { right: true });
    if (firedAt < 0 && s.engine.events.some((e) => e.type === 'awake')) firedAt = i;
    if (firedAt >= 0) {
      maxVx = Math.max(maxVx, Math.abs(s.engine.player.vx));
      if (Math.abs(s.engine.player.vx) > speed * 0.5) boostedFrames++;
    }
  }
  assert.ok(firedAt >= 0, 'walking into the board with coffee triggers the awake event');
  assert.ok(maxVx > speed * 0.8, `burst velocity ${maxVx} should approach ${speed}`);
  assert.ok(
    boostedFrames >= 6,
    `horizontal launch must last several frames, not be cleared on the first landing (${boostedFrames})`,
  );
  assert.ok(
    s.engine.player.x > (s.awake.x + 1.5) * T,
    'the burst carries the player well past the board',
  );
  assert.equal(s.engine.objectStates.get(s.awake.id).boosts, 1, 'one boost per contact');
});
test('dropping from above with coffee triggers and carries the jump direction', () => {
  const s = scene();
  s.engine.items['item.coffee'] = 1;
  Object.assign(s.engine.player, {
    x: s.awake.x * T + 6,
    y: (s.awake.y - 2) * T,
    vx: 0,
    vy: 120,
    grounded: false,
    launched: false,
  });
  let fired = false,
    firedVy = 0;
  for (let i = 0; i < 60; i++) {
    s.engine.update(1 / 120, {});
    if (!fired && s.engine.events.some((e) => e.type === 'awake')) {
      fired = true;
      firedVy = s.engine.player.vy;
    }
  }
  assert.ok(fired, 'region trigger works from above');
  assert.ok(firedVy > 0, `vertical entry direction is preserved (vy ${firedVy})`);
});
test('without coffee dropping from above lands on the board and does not fire', () => {
  const s = scene();
  Object.assign(s.engine.player, {
    x: s.awake.x * T + 6,
    y: (s.awake.y - 2) * T,
    vx: 0,
    vy: 120,
    grounded: false,
    launched: false,
  });
  for (let i = 0; i < 90; i++) s.engine.update(1 / 120, {});
  assert.equal(
    s.engine.events.some((e) => e.type === 'awake'),
    false,
  );
  assert.ok(s.engine.player.y < s.awake.y * T, 'player stands on top of the solid board');
});
test('cooldown prevents repeated bursts while contact continues', () => {
  const s = scene();
  s.engine.items['item.coffee'] = 1;
  stand(s.engine, 11.4, 11);
  for (let i = 0; i < 30; i++) s.engine.update(1 / 120, { right: true });
  const boosts = s.engine.objectStates.get(s.awake.id).boosts;
  assert.equal(boosts, 1, 'holding right through the board is one contact, not one per frame');
});
test('collision toggle off without coffee still requires the item', () => {
  const s = scene();
  s.awake.collision = false;
  stand(s.engine, 11, 11);
  for (let i = 0; i < 60; i++) s.engine.update(1 / 120, { right: true });
  assert.equal(
    s.engine.events.some((e) => e.type === 'awake'),
    false,
  );
});
test('without coffee standing on the solid board gives one controlled hint, not spam', () => {
  const s = scene();
  Object.assign(s.engine.player, {
    x: s.awake.x * T + 6,
    y: s.awake.y * T - s.engine.player.h,
    vx: 0,
    vy: 0,
    grounded: true,
    launched: false,
  });
  for (let i = 0; i < 180; i++) s.engine.update(1 / 120, {});
  const needed = s.engine.events.filter((e) => e.type === 'item-needed');
  assert.equal(needed.length, 1, 'the missing-coffee hint is throttled, not emitted each frame');
  assert.equal(needed[0].item, 'item.coffee');
  assert.match(s.engine.message || '', /需要咖啡/);
  assert.equal(s.engine.events.some((e) => e.type === 'awake'), false);
});
test('the hint repeats only after the cooldown, and coffee suppresses it', () => {
  const s = scene();
  Object.assign(s.engine.player, {
    x: s.awake.x * T + 6,
    y: s.awake.y * T - s.engine.player.h,
    vx: 0,
    vy: 0,
    grounded: true,
    launched: false,
  });
  for (let i = 0; i < 240; i++) s.engine.update(1 / 120, {});
  assert.ok(
    s.engine.events.filter((e) => e.type === 'item-needed').length >= 1 &&
      s.engine.events.filter((e) => e.type === 'item-needed').length <= 2,
    'standing contact does not flood the hint every frame',
  );
  s.engine.events.length = 0;
  s.engine.items['item.coffee'] = 1;
  for (let i = 0; i < 60; i++) s.engine.update(1 / 120, {});
  assert.equal(
    s.engine.events.some((e) => e.type === 'item-needed'),
    false,
    'with coffee the board fires normally and never asks for the item',
  );
});
