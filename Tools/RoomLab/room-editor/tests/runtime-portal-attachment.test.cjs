'use strict';
// Build-8 runtime geometry: grouped portals and room ports follow the mechanism
// they are attached to during play. Drawing (objectRect/entryRect/exitRect),
// AI portal trigger/teleport, re-entry overlap and spawn-exit suppression all
// share the same live attachment offset, while the saved route ID and authored
// origins in the project stay untouched.
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  Registry = require('../src/plugins/registry.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
const T = 32;

function fixture() {
  const p = M.example(),
    c = p.courses[0],
    r = c.rooms[0],
    second = c.rooms[1];
  r.objects = [];
  r.movables = [{ id: 'lift', x: 2, y: 2, targetX: 9, targetY: 2, padId: '', collision: true }];
  const portalIn = Registry.instantiate(p, 'common.portalIn', 'portal-in', 2, 2, c),
    portalOut = Registry.instantiate(p, 'common.portalOut', 'portal-out', 5, 2, c);
  portalIn.params.routeId = 'route-follow';
  portalOut.params.routeId = 'route-follow';
  // Portals are grouped onto the moving mechanism exactly like the editor's
  // assembly grouping does.
  portalIn.attachmentTo = 'lift';
  portalOut.attachmentTo = 'lift';
  r.objects.push(portalIn, portalOut);
  r.entries[0].x = 2;
  r.entries[0].y = 5;
  r.entries[0].attachmentTo = 'lift';
  r.exits = [{ id: 'follow-exit', name: '机关出口', x: 5, y: 5, w: 1, h: 2, attachmentTo: 'lift' }];
  c.connections = [
    {
      id: 'wire-follow',
      from: { roomId: r.id, exitId: 'follow-exit' },
      to: { roomId: second.id, entryId: second.entries[0].id },
      velocity: 'reset',
    },
  ];
  return { p, c, r, second, portalIn, portalOut };
}
function resources() {
  return { tokens: 0, charges: 0, recharge: 0, freeDash: true, dashCount: 0 };
}
// Move the lift one full progress step: authored cell (2,2) -> (9,2).
function moveLift(g) {
  g.movableStates.get('lift').progress = 1;
}

test('grouped portal visual rect and AI trigger both follow the mechanism', () => {
  const { p, c, r, portalIn, portalOut } = fixture(),
    g = new Engine(p, c.id, r.id),
    authoredIn = { x: portalIn.x, y: portalIn.y, routeId: portalIn.params.routeId },
    authoredOut = { x: portalOut.x, y: portalOut.y, routeId: portalOut.params.routeId };
  moveLift(g);
  const offset = (9 - 2) * T,
    inputRect = g.objectRect(portalIn),
    outputRect = g.objectRect(portalOut);
  assert.equal(inputRect.x, portalIn.x * T + offset, 'visual input portal follows the lift');
  assert.equal(outputRect.x, portalOut.x * T + offset, 'visual output portal follows the lift');

  // AI standing on the authored origin must no longer teleport.
  g.ai.active = true;
  g.ai.processing = 0;
  g.ai.warning = null;
  g.ai.teleported = [];
  g.ai.trail = [];
  g.ai.x = (portalIn.x + 0.5) * T;
  g.ai.y = (portalIn.y + 0.5) * T;
  g.updateAI(0.7, g.colliders());
  assert.equal(
    g.events.some((event) => event.type === 'ai-teleport'),
    false,
    'the authored origin is not the trigger after the mechanism moved',
  );

  // Standing on the live (moved) input triggers and lands on the live output.
  g.ai.x = inputRect.x + inputRect.w / 2;
  g.ai.y = inputRect.y + inputRect.h / 2;
  g.ai.processing = 0;
  g.ai.warning = null;
  g.ai.teleported = [];
  g.updateAI(0.7, g.colliders());
  assert.ok(
    g.events.some((event) => event.type === 'ai-teleport'),
    'the live trigger position fires the portal',
  );
  assert.equal(g.ai.x, outputRect.x + outputRect.w / 2);
  assert.equal(g.ai.y, outputRect.y + outputRect.h / 2);

  assert.deepEqual(
    { x: portalIn.x, y: portalIn.y, routeId: portalIn.params.routeId },
    authoredIn,
    'the saved portal ID and origin are never rewritten',
  );
  assert.deepEqual(
    { x: portalOut.x, y: portalOut.y, routeId: portalOut.params.routeId },
    authoredOut,
  );
});

test('grouped room ports use the live offset for spawn, overlap and exit suppression', () => {
  const { p, c, r, second } = fixture(),
    authored = JSON.stringify({ entry: r.entries[0], exit: r.exits[0] }),
    g = new Engine(p, c.id, r.id);
  moveLift(g);

  const entryRect = g.entryRect(r.entries[0]),
    exitRect = g.exitRect(r.exits[0]),
    offset = (9 - 2) * T;
  assert.equal(entryRect.x, r.entries[0].x * T + offset);
  assert.equal(exitRect.x, r.exits[0].x * T + offset);

  // Reloading the same room uses the cached lift position for the entry spawn
  // instead of the authored origin.
  g.loadRoom(r.id, r.entries[0].id, resources());
  assert.equal(g.player.x, entryRect.x + 4);
  assert.equal(g.player.y, entryRect.y + 4);

  // Suppression is measured against the moved exit region: standing away from
  // the live exit re-arms the suppressed port.
  g.exitTriggerArmed = false;
  g.suppressedExitId = 'follow-exit';
  g.player.x = exitRect.x + exitRect.w + 40;
  g.player.y = exitRect.y;
  assert.equal(g.reentryPort(g.player), false);
  assert.equal(g.suppressedExitId, null);
  assert.equal(g.exitTriggerArmed, true);

  // Walking into the moved exit actually changes rooms.
  g.player.x = exitRect.x + 4;
  g.player.y = exitRect.y + 4;
  g.player.vx = 0;
  g.player.vy = 0;
  g.exitCooldown = 0;
  g.update(1 / 60, {});
  assert.equal(g.room.id, second.id);
  assert.equal(JSON.stringify({ entry: r.entries[0], exit: r.exits[0] }), authored);
  assert.equal(JSON.stringify(p.courses[0].rooms[0].entries[0]), JSON.stringify(r.entries[0]));
});

test('legacy v1 saves keep portal route IDs and authored origins after migration', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    migrated = M.migrate(
      JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v1-example.json'), 'utf8')),
    ),
    portals = migrated.courses
      .flatMap((course) => course.rooms)
      .flatMap((room) => room.objects)
      .filter((object) => ['common.portalIn', 'common.portalOut'].includes(object.type));
  assert.equal(portals.length, 2);
  assert.deepEqual(
    portals.map((object) => ({ x: object.x, y: object.y, routeId: object.params.routeId })),
    [
      { x: 9, y: 13, routeId: 'shortcut' },
      { x: 13, y: 12, routeId: 'shortcut' },
    ],
  );
  assert.equal(
    portals.every((object) => object.attachmentTo === undefined),
    true,
    'migration never invents an attachment',
  );
});

test('a legacy project without attachments keeps its authored port geometry', () => {
  const p = M.example(),
    c = p.courses[0],
    r = c.rooms[0],
    before = JSON.stringify({ entries: r.entries, exits: r.exits });
  delete r.entries[0].attachmentTo;
  delete r.exits[0].attachmentTo;
  const g = new Engine(p, c.id, r.id);
  assert.equal(g.entryRect(r.entries[0]).x, r.entries[0].x * T);
  assert.equal(g.exitRect(r.exits[0]).x, r.exits[0].x * T);
  assert.deepEqual(
    JSON.parse(JSON.stringify({ entries: r.entries, exits: r.exits })),
    JSON.parse(before),
    'legacy saves gain no attachment metadata and keep their origins',
  );
});
