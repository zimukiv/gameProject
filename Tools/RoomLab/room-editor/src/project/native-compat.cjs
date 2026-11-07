'use strict';
// Authoring adapter only. The Unity runtime owns campaign behavior.
const { clone, uid } = require('../shared/utils.cjs');
const kinds = ['platforms', 'patrols', 'signs'];
const enabled = (p) => p?.nativeCampaign?.id === 'deadline-rework-v2';
const authored = (p, c) =>
  c?.kind === 'physics' &&
  p.nativeCampaign?.saveMode === 'contact-auto-v1' &&
  (p.nativeCampaign.authoredCourses || []).includes(c.id);
const active = (p, c) => enabled(p) && !authored(p, c);
const list = (r, kind) => (kinds.includes(kind) ? r.nativeCampaign?.[kind] || [] : r[kind] || []);
const identity = (o, i) => o.id || '@' + i;
const get = (r, ref) => list(r, ref.kind).find((o, i) => identity(o, i) === ref.id);
const rect = (kind, o) =>
  kind === 'patrols'
    ? { x: (o.nodes?.[0]?.x ?? 0) - 0.5, y: (o.nodes?.[0]?.y ?? 0) - 0.5, w: 1, h: 1 }
    : { x: o.x, y: o.y, w: o.w || 1, h: o.h || 1 };
function initRoom(r) {
  r.nativeCampaign = {
    switches: [],
    platforms: [],
    patrols: [],
    signs: [],
    awareness: 50,
    checkins: 0,
    requireAI: false,
    ...r.nativeCampaign,
  };
  return r;
}
function initCourse(c) {
  c.nativeCampaign = { signals: [], ...c.nativeCampaign };
  c.rooms.forEach(initRoom);
  return c;
}
function move(kind, o, dx, dy) {
  if (kind === 'patrols') {
    for (const n of o.nodes) {
      n.x += dx;
      n.y += dy;
    }
    return;
  }
  o.x += dx;
  o.y += dy;
  if (kind === 'platforms') {
    if (o.toX !== undefined) o.toX += dx;
    if (o.toY !== undefined) o.toY += dy;
  }
}
function duplicate(r) {
  for (const kind of ['platforms', 'patrols']) for (const o of list(r, kind)) o.id = uid(kind);
}
function create(r, kind, pos) {
  initRoom(r);
  const item =
    kind === 'platforms'
      ? { id: uid('platform'), ...pos, w: 1, h: 1 }
      : kind === 'patrols'
        ? {
            id: uid('patrol'),
            speed: 95,
            nodes: [
              { x: pos.x + 0.5, y: pos.y + 0.5 },
              { x: Math.min(r.cols - 0.5, pos.x + 2.5), y: pos.y + 0.5 },
            ],
          }
        : { ...pos, text: '标记' };
  r.nativeCampaign[kind].push(item);
  return { kind, id: identity(item, r.nativeCampaign[kind].length - 1) };
}
function rules(r) {
  return [
    ...list(r, 'platforms'),
    ...['objects', 'tiles', 'movables', 'exits'].flatMap((k) =>
      (r[k] || []).map((o) => o.rework).filter(Boolean),
    ),
  ];
}
function rename(c, r, scope, oldName, newName) {
  const rooms = scope === 'signal' ? c.rooms : [r],
    names = scope === 'signal' ? c.nativeCampaign.signals : r.nativeCampaign.switches;
  if (
    !oldName ||
    !names.includes(oldName) ||
    !newName.trim() ||
    newName.length > 48 ||
    names.includes(newName)
  )
    throw Error('名称不存在、重复或超出48字');
  names[names.indexOf(oldName)] = newName;
  for (const room of rooms)
    for (const rule of rules(room)) {
      for (const key of scope === 'signal' ? ['signal', 'visibleSignal'] : ['switch'])
        if (rule[key] === oldName) rule[key] = newName;
      const key = scope === 'signal' ? 'signals' : 'states';
      if (rule[key] && Object.hasOwn(rule[key], oldName)) {
        rule[key][newName] = rule[key][oldName];
        delete rule[key][oldName];
      }
      if (scope === 'switch' && rule.allSwitches)
        rule.allSwitches = rule.allSwitches.map((n) => (n === oldName ? newName : n));
    }
}
function dependencyWarnings(c) {
  const warnings = [];
  for (const r of c.rooms)
    for (const rule of rules(r)) {
      const names = [rule.signal, rule.visibleSignal, ...Object.keys(rule.signals || {})].filter(
        Boolean,
      );
      for (const n of names)
        if (!c.rooms.some((x) => x.objects.some((o) => o.rework?.signal === n)))
          warnings.push(r.name + '：信号 ' + n + ' 缺少控制来源（可能未导入依赖房间）');
      const locals = [
        rule.switch,
        ...(rule.allSwitches || []),
        ...Object.keys(rule.states || {}),
      ].filter(Boolean);
      for (const n of locals)
        if (!r.objects.some((o) => o.rework?.switch === n))
          warnings.push(r.name + '：本房开关 ' + n + ' 缺少控制来源');
    }
  return [...new Set(warnings)];
}
// Explicit import policy: never silently enable a campaign in an ordinary project.
function importContext(target, source, targetCourse, from, room, options = {}) {
  if (!enabled(source)) {
    if (active(target, targetCourse)) initRoom(room);
    return [];
  }
  if (!enabled(target)) {
    if (!options.adoptNative)
      throw Error('该房间依赖测试版规则，请确认启用来源规则，或先打开完整测试版项目。');
    target.nativeCampaign = clone(source.nativeCampaign);
    target.courses.filter((c) => !authored(target, c)).forEach(initCourse);
    if (!authored(target, targetCourse))
      targetCourse.nativeCampaign.resourceAwareness = !!from.nativeCampaign?.resourceAwareness;
  }
  if (authored(source, from) !== authored(target, targetCourse))
    throw Error('原作者物理规则与扩展玩法规则不同，请使用相同模式的大关');
  if (authored(source, from) && authored(target, targetCourse)) return [];
  if (targetCourse.kind !== from.kind) throw Error('测试版房间只能导入同主题大关');
  if (
    !!target.nativeCampaign.network !== !!source.nativeCampaign.network ||
    !!target.nativeCampaign.guided !== !!source.nativeCampaign.guided ||
    !!targetCourse.nativeCampaign?.resourceAwareness !== !!from.nativeCampaign?.resourceAwareness
  )
    throw Error('来源和目标的测试版规则不同，请使用完整项目导入，避免改变现有房间玩法');
  initCourse(targetCourse);
  initRoom(room);
  const names = from.nativeCampaign?.signals || [];
  const map = options.signalMap || Object.fromEntries(names.map((n) => [n, n]));
  for (const rule of rules(room)) {
    for (const k of ['signal', 'visibleSignal'])
      if (rule[k] && map[rule[k]]) rule[k] = map[rule[k]];
    if (rule.signals)
      rule.signals = Object.fromEntries(
        Object.entries(rule.signals).map(([k, v]) => [map[k] || k, v]),
      );
  }
  for (const n of names)
    if (!targetCourse.nativeCampaign.signals.includes(map[n]))
      targetCourse.nativeCampaign.signals.push(map[n]);
  duplicate(room);
  return [];
}
function outOfBounds(r, cols = r.cols, rows = r.rows) {
  const out = [];
  const inside = (x, y, w = 0, h = 0) =>
    Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x + w <= cols && y + h <= rows;
  for (const p of list(r, 'platforms'))
    if (
      !inside(p.x, p.y, p.w || 1, p.h || 1) ||
      !inside(p.toX ?? p.x, p.toY ?? p.y, p.w || 1, p.h || 1)
    )
      out.push({ kind: 'platforms', id: p.id });
  for (const p of list(r, 'patrols'))
    if ((p.nodes || []).some((n) => !inside(n.x - 0.5, n.y - 0.5, 1, 1)))
      out.push({ kind: 'patrols', id: p.id });
  list(r, 'signs').forEach((p, i) => {
    if (!inside(p.x, p.y) || p.x === cols || p.y === rows)
      out.push({ kind: 'signs', id: identity(p, i) });
  });
  return out;
}
module.exports = {
  enabled,
  authored,
  active,
  kinds,
  list,
  identity,
  get,
  rect,
  initRoom,
  initCourse,
  move,
  duplicate,
  create,
  rules,
  rename,
  dependencyWarnings,
  importContext,
  outOfBounds,
};
