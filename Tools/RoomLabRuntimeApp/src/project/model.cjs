'use strict';
const { clone, uid, rotate } = require('../shared/utils.cjs');
const RailNodes = require('./rail-nodes.cjs');
const Traces = require('./play-traces.cjs');
const Collision = require('./collision.cjs');
const Limits = require('./room-limits.cjs');
const VERSION = 2,
  TILE = 32;
function floor(room, x0, x1, y) {
  for (let x = x0; x <= x1; x++)
    for (let row = y; row < room.rows; row++) room.tiles.push({ x, y: row });
}
function room(id, name, cols = 30, rows = 17) {
  return {
    id,
    name,
    notes: '',
    cols,
    rows,
    phase: 'inherit',
    aiId: null,
    aiPolicy: 'inherit',
    environment: 'cold',
    graph: { x: 0, y: 0 },
    tiles: [],
    entries: [{ id: id + '-entry', name: '默认入口', notes: '', x: 1, y: rows - 4, face: 1 }],
    exits: [],
    objects: [],
    movables: [],
    zones: [],
  };
}
function object(id, type, x, y, params = {}) {
  return RailNodes.ensure({
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
  });
}
function example() {
  const a = room('jet-room', '01 喷气起跳');
  a.notes = '安全教学。踩喷气板向上飞，再向右移动到上层出口。';
  a.phase = 'slow';
  a.aiPolicy = 'off';
  a.graph = { x: 30, y: 90 };
  floor(a, 0, 12, 14);
  floor(a, 14, 29, 8);
  a.objects = [
    object('jet-a', 'physics.jet', 10, 14, { launchX: 0, launchY: -900, cooldown: 1 }),
    object('fuel-a', 'common.coin', 2, 13),
    object('fuel-b', 'common.coin', 17, 7),
  ];
  a.exits = [{ id: 'jet-exit', name: '上层出口', notes: '接温控房', x: 28, y: 6, w: 1, h: 2 }];
  const b = room('ice-room', '02 温控与累计融冰');
  b.notes = '踩温控板制造冰桥。冰累计站立 5 秒融化，冷态延迟再生成；AI 在此启动。';
  b.phase = 'fast';
  b.environment = 'hot';
  b.graph = { x: 370, y: 90 };
  floor(b, 0, 4, 14);
  floor(b, 13, 29, 14);
  b.zones = [{ id: 'cold-zone', name: '冰桥热区', x: 4, y: 8, w: 10, h: 9, initial: 'hot' }];
  b.objects = [
    object('wake-b', 'common.aiStart', 1, 14),
    object('thermal-b', 'physics.thermal', 3, 14, {
      zoneId: 'cold-zone',
      mode: 'toggle',
      cooldown: 1,
    }),
    object('fuel-c', 'common.coin', 4, 13),
    object('fuel-d', 'common.coin', 18, 13),
  ];
  for (let x = 5; x <= 12; x++)
    b.objects.push(
      object('ice-' + x, 'physics.ice', x, 14, {
        meltAfter: 5,
        respawnDelay: 1,
        friction: 1.4,
      }),
    );
  b.exits = [{ id: 'ice-exit', name: '右侧出口', notes: '接电磁炮房', x: 28, y: 12, w: 1, h: 2 }];
  const c = room('rail-room', '03 电磁加速提交', 36, 18);
  c.notes = 'AI 状态跨房保留。踩轨道起点，从零加速到末端，再抛向提交台。';
  c.phase = 'fast';
  c.graph = { x: 710, y: 90 };
  c.entries[0].y = 14;
  floor(c, 0, 17, 15);
  floor(c, 24, 35, 10);
  c.objects = [
    object('rail-c', 'physics.rail', 6, 15, {
      path: [
        { x: 6.5, y: 15 },
        { x: 17.5, y: 15 },
      ],
      acceleration: 2400,
      maxSpeed: 900,
      launchAngle: -60,
      cooldown: 2,
    }),
    object('fuel-e', 'common.coin', 3, 14),
    object('fuel-f', 'common.coin', 31, 9),
    object('star-c', 'common.collectible', 29, 9),
  ];
  c.exits = [{ id: 'rail-end', name: '提交作业', notes: '结束第一大关', x: 34, y: 8, w: 1, h: 2 }];
  return {
    version: VERSION,
    id: 'physics-project',
    name: '第一大关 · 物理 DDL',
    notes: '第一版内容只制作物理关。',
    settings: { tileSize: TILE, maxDashes: 3, paidStockCap: 3, freeDashOnLand: true },
    courses: [
      {
        id: 'physics',
        name: '物理',
        kind: 'physics',
        notes: '速度、材料与温控',
        aiId: 'physics-demo-ai',
        defaultSize: { cols: 30, rows: 17 },
        artBindings: {},
        rooms: [a, b, c],
        connections: [
          {
            id: 'wire-a',
            from: { roomId: a.id, exitId: 'jet-exit' },
            to: { roomId: b.id, entryId: b.entries[0].id },
            velocity: 'reset',
          },
          {
            id: 'wire-b',
            from: { roomId: b.id, exitId: 'ice-exit' },
            to: { roomId: c.id, entryId: c.entries[0].id },
            velocity: 'reset',
          },
        ],
      },
    ],
    assets: [],
    blockDefaults: {},
    pluginManifest: {
      'physics.jet': '1.0.0',
      'physics.ice': '1.0.0',
      'physics.thermal': '1.0.0',
      'physics.rail': '1.0.0',
    },
  };
}
function migrate(data) {
  if (data?.version === 2) return Collision.normalize(RailNodes.normalize(clone(data)));
  if (data?.version !== 1 || !Array.isArray(data.rooms)) throw new Error('不支持的项目版本。');
  const p = example();
  p.id = uid('project');
  p.name = data.name || '旧关卡';
  p.notes = '由编辑器 v1 迁移';
  p.courses = [];
  const course = {
    id: 'migrated',
    name: data.name || '迁移大关',
    kind: 'legacy',
    notes: '旧数据与绑定保留',
    aiId: 'demo-ai',
    defaultSize: { cols: data.grid?.cols || 30, rows: data.grid?.rows || 17 },
    artBindings: {},
    rooms: [],
    connections: [],
  };
  for (const old of data.rooms) {
    const r = room(old.id, old.name, data.grid?.cols || 30, data.grid?.rows || 17);
    r.notes = old.notes || '';
    r.tiles = clone(old.solids || []);
    r.entries[0].x = old.spawn.x;
    r.entries[0].y = old.spawn.y;
    const id = (key) => r.id + ':' + key;
    r.objects = (old.pads || []).map((pad) =>
      object(
        id(pad.id),
        pad.type === 'ai' ? 'common.aiStart' : 'legacy.' + pad.type,
        pad.x,
        pad.y,
        { ...pad },
      ),
    );
    r.movables = (old.blocks || []).map((b) => ({
      ...b,
      id: id(b.id),
      padId: b.padId ? id(b.padId) : '',
      assetOverrides: {},
    }));
    for (const e of old.entities || []) {
      if (e.type === 'exit')
        r.exits.push({ id: id(e.id), name: '出口', notes: '', x: e.x, y: e.y, w: 1, h: 2 });
      else
        r.objects.push(
          object(
            id(e.id),
            {
              coin: 'common.coin',
              small: 'common.small',
              collectible: 'common.collectible',
              spike: 'common.spike',
              portalIn: 'common.portalIn',
              portalOut: 'common.portalOut',
            }[e.type],
            e.x,
            e.y,
            { routeId: e.routeId || '', unlockPadId: e.unlockPadId ? id(e.unlockPadId) : '' },
          ),
        );
    }
    course.rooms.push(r);
  }
  for (const old of data.rooms)
    for (const e of old.entities || [])
      if (e.type === 'exit' && e.targetRoomId) {
        const target = course.rooms.find((r) => r.id === e.targetRoomId);
        if (target)
          course.connections.push({
            id: uid('wire'),
            from: { roomId: old.id, exitId: old.id + ':' + e.id },
            to: { roomId: target.id, entryId: target.entries[0].id },
            velocity: 'reset',
          });
      }
  p.courses = [course];
  return p;
}
function validate(p, { play = false } = {}) {
  const errors = [],
    warnings = [];
  if (!p || p.version !== 2 || !Array.isArray(p.courses) || !p.courses.length)
    return { errors: ['项目版本或大关列表无效。'], warnings };
  const bounds = (message) => (play ? errors : warnings).push(message);
  if (p.settings?.tileSize !== 32) errors.push('世界格子尺寸必须为 32。');
  if (p.courses.length > 12) errors.push('大关数量超过 12。');
  const all = new Set(),
    checkId = (id, label) => {
      if (typeof id !== 'string' || !id || id.length > 100 || all.has(id))
        errors.push(label + ' ID 无效或重复');
      all.add(id);
    };
  const cell = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
  for (const course of p.courses) {
    checkId(course.id, '大关');
    if (!Array.isArray(course.rooms) || !course.rooms.length || course.rooms.length > 64) {
      errors.push('每大关需 1–64 间房');
      continue;
    }
    for (const r of course.rooms) {
      checkId(r.id, '房间');
      errors.push(
        ...require('./play-camera.cjs')
          .errors(r.playCamera)
          .map((e) => r.name + '：' + e),
      );
      if (!Limits.valid(r.cols, r.rows)) errors.push(r.name + ' ' + Limits.description);
      if (![r.tiles, r.entries, r.exits, r.objects, r.movables, r.zones].every(Array.isArray)) {
        errors.push(r.name + ' 数据列表缺失');
        continue;
      }
      const tiles = new Set();
      for (const t of r.tiles) {
        if (t.collision !== undefined && typeof t.collision !== 'boolean')
          errors.push('碰撞开关必须为布尔值');
        const key = t.x + ',' + t.y;
        if (!Number.isInteger(t.x) || !Number.isInteger(t.y) || tiles.has(key))
          errors.push(r.name + ' 固定砖坐标无效/重复');
        else if (!cell(t.x, r.cols) || !cell(t.y, r.rows)) bounds(r.name + ' 固定砖越界');
        tiles.add(key);
      }
      for (const x of r.entries.concat(r.exits, r.objects, r.movables, r.zones)) {
        if (x.collision !== undefined && typeof x.collision !== 'boolean')
          errors.push('碰撞开关必须为布尔值：' + x.id);
        checkId(x.id, '对象');
        if (!Number.isInteger(x.x) || !Number.isInteger(x.y))
          errors.push('对象坐标需整数：' + x.id);
        else if (!cell(x.x, r.cols) || !cell(x.y, r.rows)) bounds(r.name + ' 对象越界：' + x.id);
        if (x.w && (!Number.isInteger(x.w) || x.w < 1)) errors.push('区域宽度无效：' + x.id);
        else if (x.w && x.x + x.w > r.cols) bounds('区域宽度越界：' + x.id);
        if (x.h && (!Number.isInteger(x.h) || x.h < 1)) errors.push('区域高度无效：' + x.id);
        else if (x.h && x.y + x.h > r.rows) bounds('区域高度越界：' + x.id);
      }
      if (!r.entries.length) errors.push(r.name + ' 没有入口');
      for (const b of r.movables) {
        if (!Number.isInteger(b.targetX) || !Number.isInteger(b.targetY))
          errors.push('目标坐标需整数：' + b.id);
        else if (!cell(b.targetX, r.cols) || !cell(b.targetY, r.rows))
          bounds('机关砖目标越界：' + b.id);
        if (b.padId && !r.objects.some((o) => o.id === b.padId))
          errors.push('机关砖绑定缺失：' + b.id);
      }
      const initialTemperatures = new Map();
      for (const o of r.objects) {
        if (o.type === 'physics.thermal' && ['cold', 'hot'].includes(o.params?.initialState)) {
          const target = o.params.zoneId || '',
            old = initialTemperatures.get(target);
          if (old && old !== o.params.initialState)
            (play ? errors : warnings).push('同一区域初始温度互相冲突：' + r.name);
          initialTemperatures.set(target, o.params.initialState);
        }
        if (!o.type || !o.params || typeof o.params !== 'object')
          errors.push('功能块参数缺失：' + o.id);
        if (
          o.type !== 'physics.ice' &&
          o.params?.zoneId &&
          !r.zones.some((z) => z.id === o.params.zoneId)
        )
          (play ? errors : warnings).push('温控区域关联缺失：' + o.id);
        if (o.params?.path)
          for (const n of o.params.path) {
            if (n.id) checkId(n.id, '轨道子节点');
            if (n.parentId && n.parentId !== o.id) errors.push('轨道子节点归属无效：' + o.id);
            if (!Number.isFinite(n.x) || !Number.isFinite(n.y))
              errors.push('轨道节点无效：' + o.id);
            else if (n.x < 0 || n.y < 0 || n.x > r.cols || n.y > r.rows)
              bounds('轨道节点越界：' + o.id);
          }
      }
      if (r.playTraces !== undefined) {
        if (!Array.isArray(r.playTraces) || r.playTraces.length > Traces.MAX_TRACES)
          errors.push('试玩路径列表无效或过多：' + r.name);
        else
          for (const trace of r.playTraces) {
            if (
              !trace ||
              !Array.isArray(trace.points) ||
              trace.points.length > Traces.LIMIT ||
              trace.points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
            ) {
              errors.push('试玩路径数据无效：' + r.name);
              continue;
            }
            checkId(trace.id, '试玩路径');
          }
      }
      for (const e of r.entries)
        if (r.tiles.some((t) => t.collision !== false && t.x === e.x && t.y === e.y)) {
          (play ? errors : warnings).push(r.name + ' 入口埋在砖里：' + e.name);
        }
    }
    const outputs = new Set();
    for (const edge of course.connections || []) {
      checkId(edge.id, '连线');
      const a = course.rooms.find((r) => r.id === edge.from?.roomId),
        b = course.rooms.find((r) => r.id === edge.to?.roomId);
      if (
        !a?.exits.some((e) => e.id === edge.from.exitId) ||
        !b?.entries.some((e) => e.id === edge.to.entryId)
      )
        errors.push('连线端口缺失：' + edge.id);
      const key = edge.from?.exitId;
      if (outputs.has(key)) errors.push('一个出口只能接一条线：' + key);
      outputs.add(key);
    }
  }
  const assetIds = new Set();
  for (const a of p.assets || []) {
    if (assetIds.has(a.id)) errors.push('素材 ID 重复');
    assetIds.add(a.id);
    if (
      typeof a.path !== 'string' ||
      !a.path.startsWith('assets/') ||
      a.path.includes('..') ||
      /[\\:\0]/.test(a.path)
    )
      errors.push('素材必须使用项目相对路径');
  }
  for (const c of p.courses) {
    for (const binding of Object.values(c.artBindings || {}))
      for (const id of typeof binding === 'string' ? [binding] : Object.values(binding || {}))
        if (id && !assetIds.has(id)) warnings.push('缺失素材引用：' + id);
    for (const r of c.rooms) {
      for (const binding of Object.values(r.artBindings || {}))
        for (const id of typeof binding === 'string' ? [binding] : Object.values(binding || {}))
          if (id && !assetIds.has(id)) warnings.push('缺失房间素材：' + id);
      for (const o of r.objects || [])
        for (const id of Object.values(o.assetOverrides || {}))
          if (id && !assetIds.has(id)) warnings.push('缺失实例素材：' + id);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
function resizeRoom(r, cols, rows) {
  const next = clone(r);
  next.cols = cols;
  next.rows = rows;
  const out = [];
  const inCell = (x) => x.x >= 0 && x.y >= 0 && x.x < cols && x.y < rows;
  for (const t of next.tiles) if (!inCell(t)) out.push({ kind: 'tile', id: t.x + ',' + t.y });
  for (const x of next.entries.concat(next.exits, next.objects, next.movables, next.zones))
    if (!inCell(x) || (x.w && x.x + x.w > cols) || (x.h && x.y + x.h > rows))
      out.push({ kind: 'object', id: x.id });
  for (const b of next.movables)
    if (b.targetX >= cols || b.targetY >= rows) out.push({ kind: 'target', id: b.id });
  for (const o of next.objects)
    for (const n of o.params?.path || [])
      if (n.x > cols || n.y > rows) out.push({ kind: 'path', id: o.id });
  return { room: next, out };
}
function duplicateRoom(course, sourceId) {
  const source = course.rooms.find((r) => r.id === sourceId);
  if (!source) throw new Error('房间不存在');
  const r = clone(source),
    map = new Map();
  r.id = uid('room');
  r.name += ' 副本';
  if (r.playTraces) for (const trace of r.playTraces) trace.id = uid('trace');
  r.graph = { x: (source.graph?.x || 0) + 50, y: (source.graph?.y || 0) + 190 };
  for (const item of r.entries.concat(r.exits, r.objects, r.movables, r.zones)) {
    const old = item.id;
    item.id = uid('object');
    map.set(old, item.id);
  }
  for (const o of r.objects) {
    RailNodes.ensure(o, { newIds: true });
    if (o.params.zoneId) o.params.zoneId = map.get(o.params.zoneId) || o.params.zoneId;
    if (o.params.unlockPadId)
      o.params.unlockPadId = map.get(o.params.unlockPadId) || o.params.unlockPadId;
  }
  for (const b of r.movables) if (b.padId) b.padId = map.get(b.padId) || '';
  return r;
}
function connect(course, fromRoomId, exitId, toRoomId, entryId, velocity = 'reset') {
  course.connections = course.connections.filter((e) => e.from.exitId !== exitId);
  course.connections.push({
    id: uid('wire'),
    from: { roomId: fromRoomId, exitId },
    to: { roomId: toRoomId, entryId },
    velocity,
  });
}
module.exports = {
  VERSION,
  TILE,
  room,
  floor,
  object,
  example,
  migrate,
  validate,
  resizeRoom,
  duplicateRoom,
  connect,
  clone,
  uid,
};
