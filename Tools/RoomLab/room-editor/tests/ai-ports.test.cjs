'use strict';
// Explicit cross-room AI exit/entrance routing: room bindings, project wires,
// route-map ports and save/load cleanup.
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  AIPorts = require('../src/project/ai-ports.cjs'),
  MapCompat = require('../src/project/map-compat.cjs'),
  G = require('../src/editor/graph-layout.cjs');

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
    id: 'ai-ports',
    name: 'AI ports',
    notes: '',
    settings: { tileSize: 32, maxDashes: 3, paidStockCap: 1, freeDashOnLand: true },
    compatibility: { runtime: require('../src/project/compatibility.cjs').RUNTIME },
    courses: [
      course('c1', [
        room('a1', [object('a-out', 'common.portalOut', 16, 8, { routeId: 'local' })]),
        room('a2', [object('a-in', 'common.portalIn', 4, 8, { routeId: 'local' })]),
      ]),
      course('c2', [
        room('b1', [
          object('b-in', 'common.portalIn', 6, 8, { routeId: 'local' }),
          object('b-out', 'common.portalOut', 15, 8, { routeId: 'local' }),
        ]),
      ]),
    ],
    assets: [],
    blockDefaults: {},
    pluginManifest: {},
  };
}

test('room binding is one-to-one, clearable and ignores bad refs', () => {
  const p = project(),
    r = p.courses[0].rooms[0];
  assert.equal(AIPorts.bind(r, 'a1-exit', 'a-out'), true);
  assert.equal(AIPorts.bindingFor(r, 'a1-exit'), 'a-out');
  assert.equal(AIPorts.redirectExit(r, 'a1-exit').id, 'a-out');

  // A second player exit may not steal the same AI exit.
  r.exits.push({ id: 'a1-exit-2', name: '二号', notes: '', x: 10, y: 8, w: 1, h: 2 });
  assert.equal(AIPorts.bind(r, 'a1-exit-2', 'a-out'), true);
  assert.equal(AIPorts.bindingFor(r, 'a1-exit'), null);
  assert.equal(AIPorts.bindingFor(r, 'a1-exit-2'), 'a-out');

  // Clearable, and an invalid AI exit is rejected without losing data.
  assert.equal(AIPorts.bind(r, 'a1-exit-2', null), true);
  assert.deepEqual(AIPorts.bindings(r), []);
  assert.equal(AIPorts.bind(r, 'a1-exit', 'missing'), false);
  assert.equal(AIPorts.bind(r, 'missing-exit', 'a-out'), false);
  assert.equal(AIPorts.bind(r, 'a1-exit', 'a1-exit'), false);
});

test('object-map and legacy aliases are read without changing their shape', () => {
  const p = project(),
    r = p.courses[0].rooms[0];
  r.aiExitLinks = { 'a1-exit': 'a-out' };
  assert.equal(AIPorts.bindingFor(r, 'a1-exit'), 'a-out');
  assert.equal(AIPorts.redirectExit(r, 'a1-exit').id, 'a-out');
  AIPorts.sanitize(p);
  assert.deepEqual(r.aiExitLinks, { 'a1-exit': 'a-out' });
  r.aiExitLinks = { 'a1-exit': 'gone' };
  AIPorts.sanitize(p);
  assert.equal(r.aiExitLinks, undefined);
});

test('AI exit wires connect cross-course and project on the route map', () => {
  const p = project();
  assert.equal(G.canConnect(p, { roomId: 'a1', aiExitId: 'a-out' }, { roomId: 'b1', aiEntranceId: 'b-in' }), true);
  assert.equal(G.canConnect(p, { roomId: 'a1', aiExitId: 'a-out' }, { roomId: 'b1', aiEntranceId: 'a1-exit' }), false);
  assert.equal(G.canConnect(p, { roomId: 'a1', exitId: 'a1-exit' }, { roomId: 'b1', aiEntranceId: 'b-in' }), false);

  const edge = AIPorts.connect(
    p,
    { roomId: 'a1', aiExitId: 'a-out' },
    { roomId: 'b1', aiEntranceId: 'b-in' },
  );
  assert.equal(edge.from.courseId, 'c1');
  assert.equal(edge.to.courseId, 'c2');
  assert.equal(AIPorts.connections(p).length, 1);
  assert.equal(AIPorts.find(p, edge.id).to.aiEntranceId, 'b-in');
  assert.deepEqual(M.validate(p).errors, []);
  assert.equal(MapCompat.connections(p).length, 0, 'AI wires never masquerade as player wires');

  const ports = G.ports(p.courses[0].rooms[0]);
  assert.equal(ports.aiExits[0].id, 'a-out');
  assert.equal(ports.aiEntries.length, 0);
  assert.equal(G.ports(p.courses[1].rooms[0]).aiEntries[0].id, 'b-in');

  // One wire per AI exit: reconnecting replaces the old edge.
  AIPorts.connect(p, { roomId: 'a1', aiExitId: 'a-out' }, { roomId: 'a2', aiEntranceId: 'a-in' });
  assert.equal(AIPorts.connections(p).length, 1);
  assert.equal(AIPorts.connections(p)[0].to.roomId, 'a2');
  assert.equal(AIPorts.disconnect(p, AIPorts.connections(p)[0].id), true);
  assert.deepEqual(AIPorts.connections(p), []);
});

test('save/load keeps valid links and drops deleted or wrong-type refs', () => {
  const p = project(),
    r = p.courses[0].rooms[0];
  AIPorts.bind(r, 'a1-exit', 'a-out');
  AIPorts.connect(p, { roomId: 'a1', aiExitId: 'a-out' }, { roomId: 'b1', aiEntranceId: 'b-in' });
  const restored = M.migrate(JSON.parse(JSON.stringify(p)));
  assert.equal(AIPorts.bindingFor(restored.courses[0].rooms[0], 'a1-exit'), 'a-out');
  assert.equal(AIPorts.connections(restored).length, 1);
  assert.deepEqual(M.validate(restored).errors, []);

  // Deleting the entrance object invalidates both the wire and the load path.
  restored.courses[1].rooms[0].objects = restored.courses[1].rooms[0].objects.filter(
    (o) => o.id !== 'b-in',
  );
  assert.ok(M.validate(restored).errors.some((e) => e.includes('目标入口不存在')));
  assert.equal(AIPorts.carryEntrance(restored, restored.courses[0].rooms[0], 'a1-exit', 'b1'), null);
  const removed = AIPorts.sanitize(restored);
  assert.ok(removed >= 1);
  assert.deepEqual(AIPorts.connections(restored), []);

  // A binding to a non-portalOut object is stale as well.
  const stale = project();
  stale.courses[0].rooms[0].aiExitBindings = [
    { exitId: 'a1-exit', aiExitId: 'a-in' },
    { exitId: 'missing', aiExitId: 'a-out' },
  ];
  AIPorts.sanitize(stale);
  assert.deepEqual(AIPorts.bindings(stale.courses[0].rooms[0]), []);
});

test('deleting ports or rooms cleans bindings and AI wires only where touched', () => {
  const p = project(),
    a = p.courses[0].rooms[0],
    second = p.courses[1].rooms[0];
  a.objects.push(object('a-out-2', 'common.portalOut', 12, 8, { routeId: 'local' }));
  AIPorts.bind(a, 'a1-exit', 'a-out');
  AIPorts.connect(p, { roomId: 'a1', aiExitId: 'a-out' }, { roomId: 'b1', aiEntranceId: 'b-in' });
  AIPorts.connect(p, { roomId: 'a1', aiExitId: 'a-out-2' }, { roomId: 'a2', aiEntranceId: 'a-in' });
  const kept = AIPorts.connections(p)[1];
  // A player exit deletion removes its binding and AI wire, not unrelated wires.
  assert.equal(AIPorts.forgetPorts(p, ['a1-exit']), 2);
  assert.deepEqual(AIPorts.bindings(a), []);
  assert.deepEqual(
    AIPorts.connections(p).map((edge) => edge.id),
    [kept.id],
    'independent AI wire survives',
  );
  // Deleting the target room removes every wire that lands there.
  assert.equal(AIPorts.forgetRoom(p, 'a2'), 1);
  assert.deepEqual(AIPorts.connections(p), []);
  assert.equal(second.exits.length, 1, 'unrelated room untouched');
});

test('duplicating a room remaps both sides of AI bindings', () => {
  const p = project(),
    c = p.courses[0],
    source = c.rooms[0];
  AIPorts.bind(source, 'a1-exit', 'a-out');
  const copy = M.duplicateRoom(c, source.id);
  assert.equal(AIPorts.bindings(copy).length, 1);
  assert.notEqual(AIPorts.bindings(copy)[0].exitId, 'a1-exit');
  assert.notEqual(AIPorts.bindings(copy)[0].aiExitId, 'a-out');
  assert.ok(copy.exits.some((e) => e.id === AIPorts.bindings(copy)[0].exitId));
  assert.ok(
    copy.objects.some(
      (o) => o.id === AIPorts.bindings(copy)[0].aiExitId && o.type === 'common.portalOut',
    ),
  );
  assert.equal(AIPorts.bindingFor(source, 'a1-exit'), 'a-out', 'original untouched');
});

test('carryEntrance requires the explicit wire to land in the real destination', () => {
  const p = project(),
    a = p.courses[0].rooms[0];
  AIPorts.bind(a, 'a1-exit', 'a-out');
  AIPorts.connect(p, { roomId: 'a1', aiExitId: 'a-out' }, { roomId: 'b1', aiEntranceId: 'b-in' });
  assert.equal(AIPorts.carryEntrance(p, a, 'a1-exit', 'b1').id, 'b-in');
  assert.equal(AIPorts.carryEntrance(p, a, 'a1-exit', 'a2'), null, 'not the wired room');
  assert.equal(AIPorts.carryEntrance(p, a, 'other-exit', 'b1'), null, 'unbound exit');
});
