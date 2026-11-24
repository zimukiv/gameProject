'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/project/model.cjs');
const MapCompat = require('../src/project/map-compat.cjs');
const { Engine } = require('../src/runtime/engine.cjs');

function room(id, { x = 0 } = {}) {
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
    graph: { x, y: 0 },
    tiles: [],
    entries: [
      { id: id + '-entry', name: '入口', notes: '', x: 1, y: 8, face: 1, allowReturn: true },
    ],
    exits: [{ id: id + '-exit', name: '出口', notes: '', x: 18, y: 8, w: 1, h: 2 }],
    objects: [],
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
    id: 'compat-project',
    name: '兼容测试',
    notes: '',
    settings: { tileSize: 32, maxDashes: 3, paidStockCap: 1, freeDashOnLand: true },
    compatibility: { runtime: require('../src/project/compatibility.cjs').RUNTIME },
    courses: [course('c1', [room('a1')]), course('c2', [room('b1', { x: 400 })])],
    assets: [],
    blockDefaults: {},
    pluginManifest: {},
  };
}

test('旧 courses 容器原样保留，全局视图只读', () => {
  const p = M.example(),
    before = JSON.parse(JSON.stringify(p.courses));
  const view = MapCompat.view(p);
  assert.equal(view.rooms.length, 3);
  assert.equal(view.connections.length, 2);
  assert.deepEqual(p.courses, before);
  assert.equal(MapCompat.view(p).connections[0].source, 'course');
});

test('旧 course.connections 自动成为项目级全局连接', () => {
  const p = M.example(),
    edge = MapCompat.resolve(p, 'jet-room', 'jet-exit');
  assert.equal(edge.to.roomId, 'ice-room');
  assert.equal(edge.crossCourse, false);
  assert.deepEqual(M.validate(p).errors, []);
});

test('显式项目级连接允许跨原大关且可校验', () => {
  const p = project();
  const edge = MapCompat.connect(
    p,
    { roomId: 'a1', exitId: 'a1-exit' },
    { roomId: 'b1', entryId: 'b1-entry' },
  );
  assert.equal(edge.from.courseId, 'c1');
  assert.equal(edge.to.courseId, 'c2');
  const result = M.validate(p);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.includes('跨原大关')));
  assert.equal(MapCompat.resolve(p, 'a1', 'a1-exit').crossCourse, true);
});

test('连接校验拒绝缺失端口，且不改写旧 courses', () => {
  const p = project();
  p.map = {
    version: 1,
    connections: [
      {
        id: 'bad',
        from: { roomId: 'a1', exitId: 'missing' },
        to: { roomId: 'b1', entryId: 'b1-entry' },
      },
    ],
  };
  const before = JSON.parse(JSON.stringify(p.courses));
  assert.ok(M.validate(p).errors.some((e) => e.includes('来源出口不存在')));
  assert.deepEqual(p.courses, before);
  assert.throws(() =>
    MapCompat.connect(
      p,
      { roomId: 'a1', exitId: 'nope' },
      {
        roomId: 'b1',
        entryId: 'b1-entry',
      },
    ),
  );
});

test('跨原大关连接在引擎内实际可运行', () => {
  const p = project();
  MapCompat.connect(p, { roomId: 'a1', exitId: 'a1-exit' }, { roomId: 'b1', entryId: 'b1-entry' });
  const engine = new Engine(p, 'c1', 'a1');
  assert.equal(engine.room.id, 'a1');
  engine.exitCooldown = 0;
  engine.exitTriggerArmed = true;
  engine.player.x = 580;
  engine.player.y = 280;
  engine.update(1 / 120, {});
  assert.equal(engine.room.id, 'b1');
  assert.equal(engine.entry.id, 'b1-entry');
});

test('地图层可编辑：改速度、删连线、删房清理同时作用于两套存储', () => {
  const p = project();
  const cross = MapCompat.connect(
    p,
    { roomId: 'a1', exitId: 'a1-exit' },
    { roomId: 'b1', entryId: 'b1-entry' },
  );
  assert.equal(MapCompat.find(p, cross.id).source, 'map');
  assert.equal(MapCompat.updateVelocity(p, cross.id, 'keep'), true);
  assert.equal(p.map.connections[0].velocity, 'keep');
  assert.equal(MapCompat.disconnect(p, cross.id), true);
  assert.deepEqual(p.map.connections, []);
  assert.equal(MapCompat.find(p, cross.id), null);
  // 旧 course.connections 仍可编辑/删除，且删除项目级连接不会“复活”旧连线。
  const legacy = MapCompat.connect(p, { roomId: 'a1', exitId: 'a1-exit' }, { roomId: 'b1', entryId: 'b1-entry' });
  assert.equal(MapCompat.updateVelocity(p, legacy.id, 'keep'), true);
  assert.equal(p.map.connections[0].velocity, 'keep');
  const p2 = project();
  p2.courses[0].connections.push({
    id: 'legacy-wire',
    from: { roomId: 'a1', exitId: 'a1-exit' },
    to: { roomId: 'b1', entryId: 'b1-entry' },
    velocity: 'reset',
  });
  MapCompat.connect(p2, { roomId: 'a1', exitId: 'a1-exit' }, { roomId: 'b1', entryId: 'b1-entry' });
  assert.equal(MapCompat.connections(p2).length, 1, '项目级连接覆盖同一起点的旧连线');
  assert.equal(MapCompat.disconnect(p2, MapCompat.connections(p2)[0].id), true);
  assert.equal(MapCompat.connections(p2).length, 0, '删除后旧连线不再顶上来');
  // 删除房间清理两套存储里的所有相关连线。
  const p3 = project();
  p3.courses[0].connections.push({
    id: 'legacy-wire',
    from: { roomId: 'a1', exitId: 'a1-exit' },
    to: { roomId: 'b1', entryId: 'b1-entry' },
    velocity: 'reset',
  });
  MapCompat.connect(p3, { roomId: 'b1', exitId: 'b1-exit' }, { roomId: 'a1', entryId: 'a1-entry' });
  assert.equal(MapCompat.connections(p3).length, 2);
  p3.courses[0].rooms = p3.courses[0].rooms.filter((r) => r.id !== 'a1');
  assert.equal(MapCompat.forgetRoom(p3, 'a1'), 2);
  assert.equal(MapCompat.connections(p3).length, 0);
});

test('migrate 清理项目级 map 结构但保留未知字段与旧数据', () => {
  const p = project();
  p.map = { version: 1, extra: 'keep', connections: [{ from: {}, to: {} }] };
  p.unknownRoot = { keep: true };
  const migrated = M.migrate(p);
  assert.equal(migrated.unknownRoot.keep, true);
  assert.equal(migrated.map.extra, 'keep');
  assert.deepEqual(migrated.map.connections, []);
  assert.equal(migrated.courses[0].rooms[0].id, 'a1');
});
