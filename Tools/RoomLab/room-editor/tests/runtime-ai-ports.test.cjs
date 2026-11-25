'use strict';
// Runtime behavior for explicit cross-room AI exit/entrance routing.
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  AIPorts = require('../src/project/ai-ports.cjs'),
  MapCompat = require('../src/project/map-compat.cjs'),
  Registry = require('../src/plugins/registry.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
const T = 32,
  resources = () => ({ tokens: 0, charges: 0, recharge: 0, freeDash: true, dashCount: 0 });

function obj(id, type, x, y, typeParams = {}) {
  return {
    id,
    type,
    x,
    y,
    w: 1,
    h: 1,
    params: typeParams,
    aiId: null,
    assetOverrides: {},
    resetPolicy: 'checkpoint',
  };
}
function room(id, objects = [], exits = null, movables = []) {
  return {
    id,
    name: id,
    notes: '',
    cols: 30,
    rows: 17,
    phase: 'inherit',
    aiId: null,
    aiPolicy: 'inherit',
    environment: 'cold',
    graph: { x: 0, y: 0 },
    tiles: [],
    entries: [{ id: id + '-entry', name: '入口', notes: '', x: 1, y: 14, face: 1 }],
    exits: exits || [{ id: id + '-exit', name: '出口', notes: '', x: 27, y: 14, w: 1, h: 2 }],
    objects,
    movables,
    zones: [],
  };
}
function course(id, rooms) {
  return {
    id,
    name: id,
    kind: 'physics',
    notes: '',
    aiId: id + '-ai',
    defaultSize: { cols: 30, rows: 17 },
    artBindings: {},
    rooms,
    connections: [],
  };
}
function project(a, b) {
  return {
    version: 2,
    id: 'runtime-ai-ports',
    name: 'AI ports runtime',
    notes: '',
    settings: { tileSize: 32, maxDashes: 3, paidStockCap: 1, freeDashOnLand: true },
    compatibility: { runtime: require('../src/project/compatibility.cjs').RUNTIME },
    courses: [course('c1', [a]), course('c2', [b])],
    assets: [],
    blockDefaults: {},
    pluginManifest: {},
  };
}
function fixture({ secondExit = false } = {}) {
  const a = room(
      'a1',
      [obj('a-out', 'common.portalOut', 20, 14, { routeId: 'local' })],
      secondExit
        ? [
            { id: 'a1-exit', name: '出口', notes: '', x: 27, y: 14, w: 1, h: 2 },
            { id: 'a1-exit-2', name: '另一出口', notes: '', x: 9, y: 14, w: 1, h: 2 },
          ]
        : null,
    ),
    b = room('b1', [obj('b-in', 'common.portalIn', 6, 14, { routeId: 'local' })]);
  AIPorts.bind(a, 'a1-exit', 'a-out');
  const p = project(a, b);
  MapCompat.connect(
    p,
    { roomId: 'a1', exitId: 'a1-exit' },
    { roomId: 'b1', entryId: 'b1-entry' },
  );
  if (secondExit)
    MapCompat.connect(
      p,
      { roomId: 'a1', exitId: 'a1-exit-2' },
      { roomId: 'b1', entryId: 'b1-entry' },
    );
  AIPorts.connect(p, { roomId: 'a1', aiExitId: 'a-out' }, { roomId: 'b1', aiEntranceId: 'b-in' });
  return { p, a, b };
}
function activate(engine) {
  engine.courseState.aiActive = true;
  engine.ai.active = true;
  engine.ai.processing = 0;
  engine.ai.warning = null;
  engine.ai.teleported = [];
  engine.ai.trail = [{ x: engine.player.x + 12, y: engine.player.y + 14 }];
}
function standOn(engine, exit) {
  const rect = engine.exitRect(exit);
  Object.assign(engine.player, {
    x: rect.x + 4,
    y: rect.y + 4,
    vx: 0,
    vy: 0,
  });
  engine.exitCooldown = 0;
  engine.exitTriggerArmed = true;
}

test('player near a bound exit pulls the active AI towards the matching AI exit', () => {
  const { p, a } = fixture(),
    g = new Engine(p, 'c1', 'a1');
  activate(g);
  g.ai.x = 656;
  g.ai.y = 100;
  g.ai.trail = [{ x: g.player.x + 12, y: g.player.y + 14 }];
  standOn(g, a.exits[0]);
  const target = g.objectRect(a.objects[0]);
  g.updateAI(0.1, g.colliders());
  assert.ok(Math.abs(g.ai.x - (target.x + target.w / 2)) < 1, 'redirect keeps the AI exit column');
  assert.ok(g.ai.y > 100, 'the AI heads for the bound AI exit, not the player trail');

  // Leaving the bound exit range resumes the normal trail chase.
  Object.assign(g.player, { x: T + 4, y: T + 4, vx: 0, vy: 0 });
  g.ai.x = 656;
  g.ai.y = 100;
  g.ai.trail = [{ x: g.player.x + 12, y: g.player.y + 14 }];
  g.ai.processing = 0;
  g.updateAI(0.1, g.colliders());
  assert.ok(g.ai.x < 640, 'chase resumed towards the player');
  assert.ok(g.ai.y < 100, 'the trail target is no longer the AI exit');
});

test('redirect target uses the live attachment geometry of the AI exit', () => {
  const { p, a } = fixture();
  a.movables = [{ id: 'lift', x: 2, y: 2, targetX: 10, targetY: 2, padId: '', collision: true }];
  a.objects[0].attachmentTo = 'lift';
  a.objects[0].x = 2;
  a.objects[0].y = 2;
  const g = new Engine(p, 'c1', 'a1');
  activate(g);
  g.movableStates.get('lift').progress = 1;
  standOn(g, a.exits[0]);
  g.ai.x = 0;
  g.ai.y = 20;
  g.ai.trail = [{ x: g.player.x, y: g.player.y }];
  g.updateAI(0.05, g.colliders());
  const rect = g.objectRect(a.objects[0]);
  assert.equal(rect.x, (2 + 8) * T, 'the AI exit follows its mechanism');
  assert.ok(g.ai.x > 0, 'the AI moves towards the moved AI exit');
});

test('player wire carries active AI through the explicitly linked AI entrance only', () => {
  const { p, a } = fixture(),
    g = new Engine(p, 'c1', 'a1');
  activate(g);
  standOn(g, a.exits[0]);
  g.update(1 / 60, {});
  assert.equal(g.room.id, 'b1');
  const entrance = g.room.objects.find((o) => o.id === 'b-in'),
    rect = g.objectRect(entrance);
  assert.equal(g.ai.x, rect.x + rect.w / 2);
  assert.equal(g.ai.y, rect.y + rect.h / 2);
  assert.ok(g.events.some((e) => e.type === 'ai-carry'));
});

test('the wired AI entrance is the room checkpoint, even through another exit', () => {
  const { p, a } = fixture({ secondExit: true }),
    g = new Engine(p, 'c1', 'a1');
  activate(g);
  standOn(g, a.exits[1]);
  g.update(1 / 60, {});
  assert.equal(g.room.id, 'b1');
  const rect = g.objectRect(g.room.objects.find((o) => o.id === 'b-in'));
  assert.equal(g.ai.x, rect.x + rect.w / 2, 'checkpoint entry');
  assert.equal(g.ai.y, rect.y + rect.h / 2);
  assert.equal(g.events.some((e) => e.type === 'ai-carry'), false, 'not a wire carry');
  assert.ok(g.events.some((e) => e.type === 'ai-entrance-spawn'));
});

test("aiEntranceMode 'onWire' keeps the legacy rule: only the bound exit carries the AI", () => {
  const { p, a } = fixture({ secondExit: true });
  p.settings.aiEntranceMode = 'onWire';
  const g = new Engine(p, 'c1', 'a1');
  activate(g);
  standOn(g, a.exits[1]);
  g.update(1 / 60, {});
  assert.equal(g.room.id, 'b1');
  const rect = g.objectRect(g.room.objects.find((o) => o.id === 'b-in'));
  assert.notEqual(g.ai.x, rect.x + rect.w / 2);
  assert.notEqual(g.ai.y, rect.y + rect.h / 2);
  assert.equal(g.events.some((e) => e.type === 'ai-carry'), false);
});

test('a direct start with an active AI uses the checkpoint; an inactive AI stays beside the player', () => {
  const { p } = fixture();
  p.courses[1].rooms[0].aiPolicy = 'start';
  const direct = new Engine(p, 'c2', 'b1');
  const entrance = direct.room.objects.find((o) => o.id === 'b-in'),
    rect = direct.objectRect(entrance),
    centerX = rect.x + rect.w / 2,
    centerY = rect.y + rect.h / 2;
  assert.equal(direct.ai.active, true, 'aiPolicy start activates the AI');
  assert.equal(direct.ai.x, centerX, 'a direct start uses the wired entrance');
  assert.equal(direct.ai.y, centerY);

  const { p: p2, a } = fixture(),
    inactive = new Engine(p2, 'c1', 'a1');
  inactive.ai.active = false;
  inactive.courseState.aiActive = false;
  standOn(inactive, a.exits[0]);
  inactive.update(1 / 60, {});
  assert.equal(inactive.room.id, 'b1');
  const bIn = inactive.objectRect(inactive.room.objects.find((o) => o.id === 'b-in'));
  assert.notEqual(inactive.ai.x, bIn.x + bIn.w / 2);
  assert.equal(inactive.events.some((e) => e.type === 'ai-carry'), false);
});

test('legacy unbound local portal routeId teleport still works', () => {
  const { p, a } = fixture();
  const inPortal = obj('local-in', 'common.portalIn', 5, 8, { routeId: 'local-2' }),
    outPortal = obj('local-out', 'common.portalOut', 20, 8, { routeId: 'local-2' });
  // The explicit binding stays on a-out; the local pair is deliberately unbound.
  a.objects.push(inPortal, outPortal);
  const g = new Engine(p, 'c1', 'a1');
  activate(g);
  g.ai.x = (5 + 0.5) * T;
  g.ai.y = (8 + 0.5) * T;
  g.ai.processing = 0;
  g.ai.warning = null;
  g.ai.teleported = [];
  g.updateAI(0.7, g.colliders());
  assert.ok(g.events.some((e) => e.type === 'ai-teleport'), 'legacy local portal still fires');
  const outRect = g.objectRect(outPortal);
  assert.equal(g.ai.x, outRect.x + outRect.w / 2);
  assert.equal(g.ai.y, outRect.y + outRect.h / 2);
});

test('a wired AI entrance does not act as a local teleporter on direct start', () => {
  const { p } = fixture();
  const room = p.courses[1].rooms[0];
  const entrance = room.objects.find((o) => o.id === 'b-in');
  entrance.params.routeId = 'reserved-cross-room';
  room.objects.push(obj('same-route-out', 'common.portalOut', 20, 8, {
    routeId: entrance.params.routeId,
  }));
  const game = new Engine(p, 'c2', 'b1');
  activate(game);
  const rect = game.objectRect(game.room.objects.find((o) => o.id === entrance.id));
  game.ai.x = rect.x + rect.w / 2;
  game.ai.y = rect.y + rect.h / 2;
  game.updateAI(0.7, game.colliders());
  assert.equal(game.events.some((event) => event.type === 'ai-teleport'), false);
});

test('respawn and walk-back keep an active AI at the entrance checkpoint', () => {
  const { p, a } = fixture(),
    g = new Engine(p, 'c1', 'a1');
  activate(g);
  standOn(g, a.exits[0]);
  g.update(1 / 60, {});
  assert.equal(g.room.id, 'b1');
  const entrance = () => {
    const rect = g.objectRect(g.room.objects.find((o) => o.id === 'b-in'));
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  };
  assert.deepEqual([g.ai.x, g.ai.y], [entrance().x, entrance().y], 'wire carry');

  // Respawning after a death is the path that used to drop the AI back beside the
  // player, because retry() never passed an aiRoute.
  Object.assign(g.ai, { x: 0, y: 0 });
  g.retry('test');
  assert.deepEqual([g.ai.x, g.ai.y], [entrance().x, entrance().y], 'respawn returns to it');

  // Walking back into the room (loadRoom without aiRoute) behaves the same way.
  Object.assign(g.ai, { x: 0, y: 0 });
  g.loadRoom('b1', 'b1-entry', resources(), null, null);
  assert.deepEqual([g.ai.x, g.ai.y], [entrance().x, entrance().y], 're-entry returns to it');
});

test("aiEntranceMode 'onWire' keeps respawn beside the player", () => {
  const { p, a } = fixture();
  p.settings.aiEntranceMode = 'onWire';
  const g = new Engine(p, 'c1', 'a1');
  activate(g);
  standOn(g, a.exits[0]);
  g.update(1 / 60, {});
  assert.equal(g.room.id, 'b1');
  const rect = g.objectRect(g.room.objects.find((o) => o.id === 'b-in'));
  Object.assign(g.ai, { x: 0, y: 0 });
  g.retry('test');
  assert.notEqual(g.ai.x, rect.x + rect.w / 2, 'legacy mode keeps the old spawn');
});

test('switching the AI on inside the room starts it at the wired entrance', () => {
  const { p } = fixture();
  const b = p.courses[1].rooms[0];
  const pad = obj('b-start', 'common.aiStart', 3, 14, {});
  b.objects.push(pad);
  const g = new Engine(p, 'c2', 'b1');
  const rect = g.objectRect(b.objects.find((o) => o.id === 'b-in'));
  assert.notEqual(g.ai.active, true, 'starts inactive in a direct playtest');
  g.activateAI(pad);
  assert.equal(g.ai.active, true);
  assert.equal(g.ai.x, rect.x + rect.w / 2, 'activation honours the entrance');
  assert.equal(g.ai.y, rect.y + rect.h / 2);
});
