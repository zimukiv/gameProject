'use strict';
// Regression coverage for the awake board's eight-way entry boost:
// 45° sectors with an exact right-hand boundary, zero-speed protection
// (no facing fallback), locked-by-coffee solidity, and one boost per pass
// that re-arms after leaving. All trigger paths below the direct `fire`
// cases run through real engine frames.
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');

const T = 32,
  S = Math.SQRT1_2;

function scene({ coffee = true } = {}) {
  const project = M.themedExample(),
    course = project.courses.find((c) => c.kind === 'slacker'),
    room = course.rooms[0],
    awake = room.objects.find((o) => o.type === 'slacker.awake');
  assert.ok(awake, 'starter room has an awake board');
  const engine = new Engine(project, course.id, room.id);
  if (coffee) engine.items['item.coffee'] = 1;
  return { project, course, room, awake, engine };
}
function reset(engine, awake) {
  Object.assign(engine.objectStates.get(awake.id), {
    cooldown: 0,
    used: false,
    firedDuringContact: false,
  });
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
    launchHold: 0,
    dash: 0,
    face: 1,
  });
}
function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
}
function fireAt(engine, awake, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  reset(engine, awake);
  Object.assign(engine.player, {
    vx: Math.cos(rad) * 300,
    vy: Math.sin(rad) * 300,
    launched: false,
    launchX: 0,
    face: 1,
  });
  return engine.fire(awake);
}

test('awake quantises entry velocity into eight 45° directions', () => {
  const { engine, awake } = scene(),
    speed = awake.params.speed;
  const cases = [
    { angle: 0, x: 1, y: 0 },
    { angle: 45, x: S, y: S },
    { angle: 90, x: 0, y: 1 },
    { angle: 135, x: -S, y: S },
    { angle: 180, x: -1, y: 0 },
    { angle: -135, x: -S, y: -S },
    { angle: -90, x: 0, y: -1 },
    { angle: -45, x: S, y: -S },
  ];
  for (const item of cases) {
    assert.equal(fireAt(engine, awake, item.angle), true, `angle ${item.angle} fires`);
    near(engine.player.vx, item.x * speed, `angle ${item.angle} vx`);
    near(engine.player.vy, item.y * speed, `angle ${item.angle} vy`);
    near(Math.hypot(engine.player.vx, engine.player.vy), speed, 'magnitude stays speed');
  }
  assert.equal(engine.objectStates.get(awake.id).boosts, cases.length);
});

test('right sector is -22.5° to +22.5°; +22.5° begins down-right', () => {
  const { engine, awake } = scene(),
    speed = awake.params.speed;
  // Half-open sectors: the lower boundary stays right, the upper boundary is
  // the first angle of the next (down-right) sector.
  const boundaries = [
    { angle: -22.5, x: 1, y: 0 },
    { angle: -22.4, x: 1, y: 0 },
    { angle: 22.4, x: 1, y: 0 },
    { angle: 22.5, x: S, y: S },
    { angle: 337.5, x: 1, y: 0 },
    { angle: 157.5, x: -1, y: 0 },
    { angle: -157.5, x: -S, y: -S },
  ];
  for (const item of boundaries) {
    assert.equal(fireAt(engine, awake, item.angle), true, `angle ${item.angle} fires`);
    near(engine.player.vx, item.x * speed, `angle ${item.angle} vx`);
    near(engine.player.vy, item.y * speed, `angle ${item.angle} vy`);
  }
});

test('zero speed does not invent a direction from the facing flag', () => {
  const { engine, awake } = scene(),
    state = engine.objectStates.get(awake.id);
  reset(engine, awake);
  Object.assign(engine.player, { vx: 0, vy: 0, launched: false, face: -1 });
  assert.equal(engine.fire(awake), false);
  assert.equal(state.boosts || 0, 0);
  assert.equal(
    engine.events.some((e) => e.type === 'awake'),
    false,
  );
  assert.equal(engine.player.vx, 0);
});

test('standing still inside an unlocked board waits for real entry velocity', () => {
  const { engine, awake } = scene();
  stand(engine, awake.x, awake.y, 0);
  for (let i = 0; i < 120; i++) engine.update(1 / 120, {});
  assert.equal(
    engine.events.some((e) => e.type === 'awake'),
    false,
    'stationary overlap stays idle',
  );
  assert.equal(engine.objectStates.get(awake.id).boosts || 0, 0);
  engine.update(1 / 120, { right: true });
  assert.ok(engine.events.some((e) => e.type === 'awake' && e.direction?.x === 1));
  assert.equal(engine.objectStates.get(awake.id).boosts, 1);
});

test('without coffee the board is solid, blocks movement and never fires', () => {
  const { awake, engine } = scene({ coffee: false });
  assert.ok(
    engine.colliders().some((c) => c.id === awake.id),
    'locked board is solid',
  );
  stand(engine, awake.x - 1.8, awake.y);
  for (let i = 0; i < 120; i++) engine.update(1 / 120, { right: true });
  assert.equal(
    engine.events.some((e) => e.type === 'awake'),
    false,
  );
  assert.ok(engine.player.x < (awake.x + 0.9) * T, 'player is stopped at the board edge');
  assert.equal(engine.fire(awake), false);
});

test('with coffee the board is pass-through for every entry side', () => {
  const left = scene(),
    right = scene(),
    top = scene();
  for (const s of [left, right, top])
    assert.ok(!s.engine.colliders().some((c) => c.id === s.awake.id), 'unlocked is non-solid');

  stand(left.engine, left.awake.x - 1.8, left.awake.y);
  for (let i = 0; i < 90; i++) left.engine.update(1 / 120, { right: true });
  assert.ok(left.engine.events.some((e) => e.type === 'awake' && e.direction?.x === 1));
  assert.ok(left.engine.player.x > (left.awake.x + 1.5) * T, 'boost carries the player through');

  stand(right.engine, right.awake.x + 1.8, right.awake.y);
  for (let i = 0; i < 90; i++) right.engine.update(1 / 120, { left: true });
  assert.ok(right.engine.events.some((e) => e.type === 'awake' && e.direction?.x === -1));

  Object.assign(top.engine.player, {
    x: top.awake.x * T + 6,
    y: (top.awake.y - 2) * T,
    vx: 0,
    vy: 120,
    grounded: false,
    launched: false,
  });
  for (let i = 0; i < 60; i++) top.engine.update(1 / 120, {});
  assert.ok(top.engine.events.some((e) => e.type === 'awake' && e.direction?.y === 1));
});

test('one boost per pass, and leaving the board re-arms the next crossing', () => {
  const { awake, engine } = scene(),
    state = engine.objectStates.get(awake.id);
  // A wall just past the board keeps the player overlapping after the boost,
  // so the test can hold contact past the 3 s cooldown. The engine clones the
  // project, so edit the live room.
  engine.room.tiles.push({ x: awake.x + 1, y: awake.y });
  stand(engine, awake.x - 1.8, awake.y);
  for (let i = 0; i < 540; i++) engine.update(1 / 120, { right: true });
  assert.equal(state.boosts, 1, 'holding contact for 4.5 s still gives one boost');
  assert.ok(engine.player.x < (awake.x + 1) * T, 'wall keeps the player on the board');

  // Moving back out while still overlapping must not fire left: contact stays
  // latched until the player actually leaves the region.
  for (let i = 0; i < 60; i++) engine.update(1 / 120, { left: true });
  assert.equal(state.boosts, 1, 'reversing inside the region does not re-trigger');

  for (let i = 0; i < 240; i++) engine.update(1 / 120, { right: true });
  assert.equal(state.boosts, 2, 'a fresh crossing after leaving fires again');
});

test('awake boost does not consume manual dash inventory or counts', () => {
  const { engine, awake, project, course } = scene();
  engine.charges = 2;
  const player = engine.player;
  Object.assign(player, { freeDash: true, dashCount: 1, vx: 200, vy: 0, launched: false });
  reset(engine, awake);
  assert.equal(engine.fire(awake), true);
  assert.equal(engine.charges, 2, 'paid dash charges are untouched');
  assert.equal(player.freeDash, true, 'free dash is untouched');
  assert.equal(player.dashCount, 1, 'manual dash count is untouched');
  assert.equal(
    engine.events.some((e) => e.type === 'dash'),
    false,
  );
  assert.equal(project.courses.find((c) => c.id === course.id).kind, 'slacker');
});
