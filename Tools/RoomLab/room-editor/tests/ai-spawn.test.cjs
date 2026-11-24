'use strict';
// AI spawn points: a non-solid marker block that a launch pad (solid or hollow)
// can bind to, so activation materializes the AI there. Unbound/stale references
// keep the legacy "appear beside the player" behavior, and every ID-rewriting
// workflow (copy/paste, delete, duplicate, mirror, import) keeps the reference
// coherent by reusing the existing remap mechanisms.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  Registry = require('../src/plugins/registry.cjs'),
  AISpawns = require('../src/project/ai-spawns.cjs'),
  Clipboard = require('../src/project/clipboard-selection.cjs'),
  Selection = require('../src/project/selection.cjs'),
  Mirror = require('../src/project/room-mirror.cjs'),
  RoomImport = require('../src/project/room-import.cjs'),
  Draw = require('../src/editor/draw.cjs'),
  Room = require('../src/editor/pages/room.cjs'),
  { Engine } = require('../src/runtime/engine.cjs');
const T = 32;

function fixture(type = 'common.aiStart') {
  const p = M.example(),
    r = p.courses[0].rooms[0];
  r.aiPolicy = 'inherit';
  r.objects = [
    M.object('start', type, 2, 13),
    M.object('spawn', 'common.aiSpawn', 10, 6),
  ];
  return { p, r, start: r.objects[0], spawn: r.objects[1] };
}
function standOn(g, o) {
  Object.assign(g.player, {
    x: o.x * T + 4,
    y: o.y * T - 28,
    vx: 0,
    vy: 0,
    grounded: false,
  });
}

test('AI spawn point is a non-solid, trigger-free marker block in the palette', () => {
  const def = Registry.get('common.aiSpawn');
  assert.equal(def.name, 'AI 出现点');
  assert.equal(def.hidden, undefined, 'the toolbar exposes it');
  assert.equal(def.collider, false);
  assert.equal(def.nonSolid, true);
  assert.equal(def.defaultCollision, false);
  assert.equal(def.trigger, 'none');
  const p = M.example(),
    course = p.courses[0],
    o = Registry.instantiate(p, 'common.aiSpawn', 'spawn-1', 4, 5, course);
  assert.equal(o.collision, false, 'a fresh marker is never solid');
  const g = new Engine(p);
  assert.equal(
    g.colliders().some((c) => c.id === 'spawn-1'),
    false,
    'the marker never becomes a runtime collider',
  );
  // Even a hand-edited collision:true save cannot turn the marker solid.
  o.collision = true;
  p.courses[0].rooms[0].objects.push(o);
  assert.equal(new Engine(p).colliders().some((c) => c.id === 'spawn-1'), false);
});

test('launch pads expose the room-local spawn point select, including a clear option', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0],
    spawn = M.object('spawn', 'common.aiSpawn', 10, 6);
  r.objects.push(spawn);
  const html = Room.schemaField(
    { key: 'aiSpawnId', label: 'AI 出现点', kind: 'aiSpawn' },
    'spawn',
    r,
  );
  assert.match(html, /id="param-aiSpawnId"/);
  assert.match(html, /value=""/, 'unbinding stays possible');
  assert.match(html, /value="spawn"/);
  assert.match(html, /AI 出现点/);
  assert.equal(
    Registry.get('common.aiStart').schema.some((f) => f.key === 'aiSpawnId'),
    true,
  );
  assert.equal(
    Registry.get('common.aiStartHollow').schema.some((f) => f.key === 'aiSpawnId'),
    true,
  );
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'editor', 'pages', 'definitions.cjs'),
    'utf8',
  );
  assert.match(source, /aiSpawn/, 'project-wide defaults never show a room-local reference');
});

test('binding is room-local, one-to-one clearable and ignores wrong types', () => {
  const { r, start, spawn } = fixture();
  assert.equal(AISpawns.bind(r, start, spawn.id), true);
  assert.equal(AISpawns.target(r, start).id, 'spawn');
  assert.deepEqual(AISpawns.bindings(r), [{ launchpadId: 'start', spawnId: 'spawn' }]);
  assert.equal(AISpawns.bind(r, start, 'missing'), false);
  assert.equal(AISpawns.bind(r, start, start.id), false, 'a launch pad is not a marker');
  assert.equal(AISpawns.bind(r, start, null), true);
  assert.equal(AISpawns.target(r, start), null);
  assert.deepEqual(AISpawns.bindings(r), []);
  assert.equal(start.params.aiSpawnId, undefined, 'clearing removes the authored key');
  // A marker in another room never resolves.
  const other = M.example().courses[0].rooms[1];
  other.objects.push(M.object('foreign', 'common.aiSpawn', 1, 1));
  AISpawns.bind(r, start, spawn.id);
  assert.equal(AISpawns.target(other, start), null);
});

test('activation materializes the AI at the bound marker instead of beside the player', () => {
  const { p, r, start, spawn } = fixture();
  assert.equal(AISpawns.bind(r, start, spawn.id), true);
  const g = new Engine(p);
  standOn(g, start);
  g.update(1 / 120);
  assert.equal(g.ai.active, true);
  assert.equal(g.ai.x, spawn.x * T + T / 2);
  assert.equal(g.ai.y, spawn.y * T + T / 2);
  assert.equal(g.events.filter((e) => e.type === 'ai-start').at(-1).spawnId, 'spawn');
});

test('hollow launch pad also uses the bound spawn point', () => {
  const { p, r, start, spawn } = fixture('common.aiStartHollow');
  assert.equal(AISpawns.bind(r, start, spawn.id), true);
  const g = new Engine(p);
  Object.assign(g.player, {
    x: start.x * T + 4,
    y: start.y * T + 4,
    vx: 0,
    vy: 0,
    grounded: false,
  });
  g.update(1 / 120, { right: true });
  assert.equal(g.ai.active, true);
  assert.equal(g.ai.x, spawn.x * T + T / 2);
  assert.equal(g.ai.y, spawn.y * T + T / 2);
});

test('unbound or stale references keep the legacy spawn beside the player', () => {
  for (const setup of [
    (r) => r.objects[0].params, // unbound
    (r) => ({ ...r.objects[0].params, aiSpawnId: 'ghost' }), // deleted marker
    (r) => ({ ...r.objects[0].params, aiSpawnId: 'start' }), // wrong type
  ]) {
    const { p, r, start } = fixture();
    start.params = setup(r);
    const g = new Engine(p);
    standOn(g, start);
    g.update(1 / 120);
    assert.equal(g.ai.active, true);
    assert.equal(g.ai.x, g.player.x + g.player.w / 2 - 165, 'legacy offset is untouched');
    assert.equal(g.ai.y, g.player.y + g.player.h / 2);
    assert.equal(g.events.filter((e) => e.type === 'ai-start').at(-1).spawnId, null);
  }
});

test('delete cleans the reference and duplicate/import remap both ids', () => {
  const { p, r } = fixture();
  AISpawns.bind(r, r.objects[0], r.objects[1].id);
  const copy = M.duplicateRoom(p.courses[0], r.id),
    copiedPad = copy.objects.find((o) => o.type === 'common.aiStart'),
    copiedSpawn = copy.objects.find((o) => o.type === 'common.aiSpawn');
  assert.notEqual(copiedPad.params.aiSpawnId, 'spawn');
  assert.equal(copiedPad.params.aiSpawnId, copiedSpawn.id);
  assert.equal(AISpawns.target(copy, copiedPad).id, copiedSpawn.id);
  assert.equal(AISpawns.target(r, r.objects[0]).id, 'spawn', 'source untouched');

  // Deleting the marker through the marquee/inspector path clears the reference.
  const live = fixture();
  AISpawns.bind(live.r, live.r.objects[0], live.r.objects[1].id);
  Selection.remove(live.p.courses[0], live.r, [{ kind: 'objects', id: 'spawn' }]);
  assert.equal(live.r.objects[0].params.aiSpawnId, undefined);

  // Room import rewrites both sides through the existing generic id map.
  const target = M.example(),
    source = M.example(),
    sourceRoom = source.courses[0].rooms[0];
  sourceRoom.objects = [
    M.object('start', 'common.aiStart', 2, 13),
    M.object('spawn', 'common.aiSpawn', 10, 6),
  ];
  AISpawns.bind(sourceRoom, sourceRoom.objects[0], 'spawn');
  const result = RoomImport.prepare(
    target,
    new Map(),
    source,
    new Map(),
    'physics',
    'physics',
    sourceRoom.id,
    false,
  );
  const imported = result.project.courses[0].rooms.find((room) => room.id === result.roomId),
    importedPad = imported.objects.find((o) => o.type === 'common.aiStart'),
    importedSpawn = imported.objects.find((o) => o.type === 'common.aiSpawn');
  assert.notEqual(importedPad.params.aiSpawnId, 'spawn');
  assert.equal(importedPad.params.aiSpawnId, importedSpawn.id);
  assert.equal(AISpawns.target(imported, importedPad).id, importedSpawn.id);
});

test('copy/paste keeps an internal reference and drops an external one', () => {
  const { r, start, spawn } = fixture();
  AISpawns.bind(r, start, spawn.id);
  const clip = Clipboard.capture(r, [
      { kind: 'objects', id: start.id },
      { kind: 'objects', id: spawn.id },
    ]),
    pasted = Clipboard.paste(r, clip, { offsetX: 2, offsetY: 1 }),
    pad = r.objects.find((o) => o.params?.aiSpawnId && o.id !== start.id);
  assert.ok(pad, 'pasted launch pad exists');
  assert.ok(AISpawns.target(r, pad), 'the reference follows the pasted marker');
  assert.notEqual(pad.params.aiSpawnId, spawn.id);

  const lonely = Clipboard.capture(r, [{ kind: 'objects', id: start.id }]),
    result = Clipboard.paste(r, lonely, { offsetX: 0, offsetY: 0 });
  assert.equal(result.count, 1);
  const solo = r.objects.find((o) => o.id === result.refs[0].id);
  assert.equal(
    solo.params.aiSpawnId,
    undefined,
    'a reference outside the selection is dropped, never rebound',
  );
});

test('mirroring keeps the binding and flips both marker and pad together', () => {
  const { r } = fixture();
  AISpawns.bind(r, r.objects[0], r.objects[1].id);
  const next = Mirror.mirrorRoom(r, 'horizontal'),
    pad = next.objects.find((o) => o.type === 'common.aiStart'),
    spawn = AISpawns.target(next, pad);
  assert.ok(spawn, 'ids survive mirroring');
  assert.equal(spawn.x, next.cols - 1 - 10);
  assert.equal(pad.x, next.cols - 1 - 2);
});

test('room canvas draws the reusable dashed association link between pad and marker', () => {
  const p = M.example(),
    r = p.courses[0].rooms[0],
    start = M.object('start', 'common.aiStart', 2, 13),
    spawn = M.object('spawn', 'common.aiSpawn', 10, 6);
  r.objects = [start, spawn];
  AISpawns.bind(r, start, spawn.id);
  const calls = [],
    target = {
      canvas: { width: 1200, height: 800 },
      measureText: (v) => ({ width: String(v).length * 7 }),
    },
    ctx = new Proxy(target, {
      get(object, key) {
        if (key in object) return object[key];
        const fn = (...args) => calls.push([key, ...args]);
        object[key] = fn;
        return fn;
      },
      set(object, key, value) {
        object[key] = value;
        return true;
      },
    });
  Draw.drawRoom(ctx, p, p.courses[0], r, { targets: true });
  const from = [(2 + 0.5) * T, (13 + 0.5) * T],
    to = [(10 + 0.5) * T, (6 + 0.5) * T];
  assert.ok(
    calls.some(
      (call, i) =>
        call[0] === 'moveTo' &&
        call[1] === from[0] &&
        call[2] === from[1] &&
        calls[i + 1]?.[0] === 'lineTo' &&
        calls[i + 1][1] === to[0] &&
        calls[i + 1][2] === to[1],
    ),
    'pad -> marker association line is painted',
  );
  assert.ok(
    calls.some((call) => call[0] === 'setLineDash' && call[1]?.join() === '5,4'),
    'the link reuses the dashed association style',
  );
});

test('save/load sanitizes stale references without touching valid ones', () => {
  const { p, r, start, spawn } = fixture();
  AISpawns.bind(r, start, spawn.id);
  const stale = M.clone(p);
  stale.courses[0].rooms[0].objects[0].params.aiSpawnId = 'ghost';
  const restored = M.migrate(stale);
  assert.equal(restored.courses[0].rooms[0].objects[0].params.aiSpawnId, undefined);
  const valid = M.migrate(M.clone(p));
  assert.equal(
    valid.courses[0].rooms[0].objects[0].params.aiSpawnId,
    'spawn',
    'a real marker reference survives save/load',
  );
  assert.ok(
    M.validate(stale).warnings.some((warning) => warning.includes('AI 启动板绑定的出现点缺失')),
  );
});
