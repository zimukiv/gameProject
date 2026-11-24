'use strict';
// AI ports on the main route map: independent edges, visible handles/labels,
// routeId preservation, and the editor hooks that make the workflow testable.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const M = require('../src/project/model.cjs'),
  AIPorts = require('../src/project/ai-ports.cjs'),
  MapCompat = require('../src/project/map-compat.cjs'),
  G = require('../src/editor/graph-layout.cjs'),
  D = require('../src/editor/draw.cjs'),
  Board = require('../src/editor/graph-board.cjs'),
  { History } = require('../src/editor/history.cjs');
const root = path.resolve(__dirname, '..'),
  read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function object(id, type, x, y, params = {}) {
  return {
    id,
    type,
    x,
    y,
    w: 1,
    h: 1,
    params,
    aiId: null,
    assetOverrides: {},
    resetPolicy: 'checkpoint',
  };
}
function room(id, objects = []) {
  return {
    id,
    name: id,
    notes: '',
    cols: 20,
    rows: 12,
    phase: 'inherit',
    aiId: null,
    aiPolicy: 'inherit',
    environment: 'cold',
    graph: { x: 0, y: 0 },
    tiles: [],
    entries: [{ id: id + '-entry', name: '入口', notes: '', x: 1, y: 8, face: 1 }],
    exits: [{ id: id + '-exit', name: '出口', notes: '', x: 18, y: 8, w: 1, h: 2 }],
    objects,
    movables: [],
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
    defaultSize: { cols: 20, rows: 12 },
    artBindings: {},
    rooms,
    connections: [],
  };
}
function project() {
  return {
    version: 2,
    id: 'ai-port-map',
    name: 'AI ports on the map',
    notes: '',
    settings: { tileSize: 32, maxDashes: 3, paidStockCap: 1, freeDashOnLand: true },
    compatibility: { runtime: require('../src/project/compatibility.cjs').RUNTIME },
    courses: [
      course('c1', [
        room('a1', [object('a-out', 'common.portalOut', 16, 8, { routeId: 'legacy-route' })]),
        room('a2', [object('a-in', 'common.portalIn', 4, 8, { routeId: 'legacy-route' })]),
      ]),
      course('c2', [
        room('b1', [object('b-in', 'common.portalIn', 6, 8, { routeId: 'legacy-route' })]),
      ]),
    ],
    assets: [],
    blockDefaults: {},
    pluginManifest: {},
  };
}

test('route-map edges keep AI wires separate from player wires', () => {
  const p = project();
  // One player wire and one cross-course AI wire, both leaving room a1.
  MapCompat.connect(
    p,
    { roomId: 'a1', exitId: 'a1-exit' },
    { roomId: 'a2', entryId: 'a2-entry' },
  );
  AIPorts.connect(
    p,
    { roomId: 'a1', aiExitId: 'a-out' },
    { roomId: 'b1', aiEntranceId: 'b-in' },
  );
  const { offsets } = G.ensureOffsets(p),
    places = G.placements(p, offsets),
    links = Board.wires(p, places, 'c1'),
    player = links.filter((edge) => !edge.ai),
    ai = links.filter((edge) => edge.ai);

  assert.equal(player.length, 1, 'the player wire is still projected');
  assert.equal(player[0].kind, 'player');
  assert.equal(player[0].from.id, 'a1-exit');
  assert.equal(player[0].to.id, 'a2-entry');
  assert.equal(ai.length, 1, 'the AI wire is projected on the same board');
  assert.equal(ai[0].kind, 'ai');
  assert.equal(ai[0].source, 'ai');
  assert.equal(ai[0].from.id, 'a-out');
  assert.equal(ai[0].to.id, 'b-in');
  assert.equal(ai[0].crossCourse, true, 'AI wiring may cross the legacy containers');
  // The player store never receives the AI edge, and vice versa.
  assert.equal(MapCompat.connections(p).length, 1);
  assert.equal(
    MapCompat.connections(p).some((edge) => edge.from.exitId === 'a-out'),
    false,
  );
  assert.equal(AIPorts.connections(p).length, 1);
  assert.equal(AIPorts.connections(p)[0].id, ai[0].id);

  // Deleting only the AI wire leaves the player wire and the portal routeId.
  assert.equal(AIPorts.disconnect(p, ai[0].id), true);
  assert.deepEqual(AIPorts.connections(p), []);
  assert.equal(MapCompat.connections(p).length, 1);
  assert.equal(p.courses[0].rooms[0].objects[0].params.routeId, 'legacy-route');
});

test('AI binding save records ids without rewriting the portal routeId', () => {
  const p = project(),
    r = p.courses[0].rooms[0],
    aiExit = r.objects[0],
    before = M.clone(p),
    history = new History();
  assert.equal(AIPorts.bind(r, 'a1-exit', aiExit.id), true);
  assert.equal(AIPorts.bindingFor(r, 'a1-exit'), 'a-out');
  assert.equal(AIPorts.bindings(r).length, 1);
  assert.deepEqual(aiExit.params, { routeId: 'legacy-route' }, 'routeId stays authored');
  assert.deepEqual(aiExit, object('a-out', 'common.portalOut', 16, 8, { routeId: 'legacy-route' }));
  // This is the mutation store.change() records: one undo removes the binding
  // and still leaves the portal object's routeId untouched.
  assert.equal(history.commit(before, p), true);
  const undone = history.undo(p);
  assert.deepEqual(AIPorts.bindings(undone.courses[0].rooms[0]), []);
  assert.equal(undone.courses[0].rooms[0].objects[0].params.routeId, 'legacy-route');

  // Re-binding a different player exit keeps the AI object untouched and is
  // exactly the mutation the inspector wraps in store.change().
  const second = { id: 'a1-exit-2', name: '二号', notes: '', x: 10, y: 8, w: 1, h: 2 };
  r.exits.push(second);
  assert.equal(AIPorts.bind(r, second.id, aiExit.id), true);
  assert.equal(AIPorts.bindingFor(r, 'a1-exit'), null);
  assert.equal(AIPorts.bindingFor(r, second.id), 'a-out');
  assert.deepEqual(aiExit.params, { routeId: 'legacy-route' });
});

function fakeContext() {
  const calls = [],
    target = {
      canvas: { width: 1200, height: 800 },
      calls,
      measureText: (value) => ({ width: String(value).length * 7 }),
    };
  return new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      const fn = (...args) => {
        calls.push([key, ...args]);
      };
      object[key] = fn;
      return fn;
    },
    set(object, key, value) {
      object[key] = value;
      return true;
    },
  });
}

test('drawGraph paints AI handles and a dashed AI line without touching player ports', () => {
  const p = project();
  AIPorts.connect(
    p,
    { roomId: 'a1', aiExitId: 'a-out' },
    { roomId: 'b1', aiEntranceId: 'b-in' },
  );
  const { offsets } = G.ensureOffsets(p),
    places = G.placements(p, offsets),
    links = Board.wires(p, places, 'c1'),
    ctx = fakeContext();
  D.drawGraph(ctx, places, links, null, null, { x: 0, y: 0, scale: 1 }, 'c1', new Set());
  const labels = ctx.calls
      .filter((call) => call[0] === 'fillText')
      .map((call) => String(call[1])),
    dashes = ctx.calls.filter((call) => call[0] === 'setLineDash' && call[1]?.length);
  assert.ok(
    labels.some((label) => label.startsWith('AI 出口 ·')),
    'AI exit marker has a visible AI label',
  );
  assert.ok(
    labels.some((label) => label.startsWith('AI 入口 ·')),
    'AI entrance marker has a visible AI label',
  );
  assert.ok(labels.includes('AI'), 'the AI wire itself is labelled');
  assert.ok(dashes.length >= 1, 'AI markers/wires are painted with a dashed pattern');
});

test('inspector and map hooks expose the AI binding and AI wire workflow', () => {
  const roomSource = read('src/editor/pages/room.cjs'),
    boardSource = read('src/editor/graph-board.cjs'),
    drawSource = read('src/editor/draw.cjs'),
    appSource = read('src/editor/app.cjs');

  // Selected AI exit and selected player exit both get a real binding select.
  assert.match(roomSource, /'ai-exit-binding'/);
  assert.match(roomSource, /'player-exit-ai-binding'/);
  assert.match(roomSource, /ai-exit-binding/);
  assert.match(roomSource, /player-exit-ai-binding/);
  assert.match(roomSource, /AIPorts\.bind\(r, exitId, o\.id\)/);
  assert.match(roomSource, /AIPorts\.bind\(r, o\.id, aiExitId\)/);
  assert.match(roomSource, /AIPorts\.unbind\(r, o\.id\)/);
  assert.equal(
    /params\.routeId\s*=/.test(roomSource),
    false,
    'the inspector must never rewrite a portal routeId',
  );

  // Map drag/delete use the AI store, not the player wire store.
  assert.match(boardSource, /AIPorts\.connect\(live, from, to\)/);
  assert.match(boardSource, /AIPorts\.disconnect\(app\.store\.project, edge\.id\)/);
  assert.match(boardSource, /ai-wire-delete/);
  assert.match(boardSource, /ports\.aiExits/);
  assert.match(boardSource, /ports\.aiEntries/);
  assert.match(boardSource, /AI 出口 → AI 入口/);
  assert.match(drawSource, /place\.ports\.aiEntries/);
  assert.match(drawSource, /place\.ports\.aiExits/);
  assert.match(drawSource, /edge\.kind === 'ai'/);

  // Headless UI hooks report the same geometry/data without a browser launch.
  assert.match(appSource, /aiExits: place\.ports\.aiExits/);
  assert.match(appSource, /aiEntries: place\.ports\.aiEntries/);
  assert.match(appSource, /aiConnections: \(\) =>/);
  assert.match(appSource, /aiBindings: \(roomId\)/);
});
