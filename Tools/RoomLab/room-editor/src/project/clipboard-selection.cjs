'use strict';
// Copy/paste of the current room selection (objects, bricks, terrain, zones).
// Pure project data only: no DOM, no asset IO, so it is covered by node tests.
//
// Contract
// - capture(room, refs) snapshots every marquee-selectable kind with relative
//   positions: terrain, objects, movables, zones, entries/exits and the native
//   campaign platforms/patrols/signs. Ports travel as plain data only; their
//   course wiring is never copied, so a pasted exit/entry has no connection.
// - paste(room, clip, {offsetX, offsetY}) creates fresh IDs for every copied
//   object and rewrites internal references (block groups, brick motion groups,
//   pad bindings, zone links, rail nodes, assembly/attachment). References that
//   point outside the selection are dropped instead of being re-bound to an
//   unrelated object. Native items are written into room.nativeCampaign, never
//   into a top-level room.platforms container.
// - Out-of-room pastes are rejected before any mutation, so the caller can show
//   one message without leaving half-pasted data and without a confirmation
//   dialog per key.
const { uid } = require('../shared/utils.cjs');
const Native = require('./native-compat.cjs');
const Rail = require('./rail-nodes.cjs');
const { get } = require('./selection.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));
const KINDS = ['tiles', 'objects', 'movables', 'entries', 'exits', 'zones', ...Native.kinds];
const PREFIX = {
  objects: 'object',
  movables: 'movable',
  zones: 'zone',
  entries: 'entry',
  exits: 'exit',
  platforms: 'platform',
  patrols: 'patrol',
  signs: 'sign',
};
const round = (value) => Math.round(Number(value) * 10000) / 10000;
const rectOf = (kind, item) =>
  kind === 'tiles' ? { x: item.x, y: item.y, w: 1, h: 1 } : Native.rect(kind, item);
function groupMembers(room, kind, item) {
  if (kind === 'movables' && item.brickGroup)
    return room.movables.filter((b) => b.brickGroup === item.brickGroup);
  if (item.assemblyId)
    return KINDS.flatMap((k) =>
      Native.list(room, k).filter((o) => o.assemblyId === item.assemblyId),
    );
  return [item];
}
function capture(room, refs) {
  const selected = new Map(),
    ids = new Set(),
    chosen = new Set();
  for (const ref of refs || []) {
    if (!KINDS.includes(ref.kind)) continue;
    const item = get(room, ref);
    if (!item) continue;
    const id =
      ref.kind === 'tiles'
        ? ref.x + ',' + ref.y
        : ref.id ?? Native.identity(item, Native.list(room, ref.kind).indexOf(item));
    selected.set(ref.kind + ':' + id, { kind: ref.kind, item });
    chosen.add(item);
    if (item.id) ids.add(item.id);
  }
  if (!selected.size) throw new Error('请先框选或选中要复制的对象。');
  const entries = [...selected.values()],
    rects = entries.map(({ kind, item }) => rectOf(kind, item)),
    origin = {
      x: Math.min(...rects.map((r) => r.x)),
      y: Math.min(...rects.map((r) => r.y)),
    };
  // Internal group membership is decided at capture time: a group only travels
  // with the clipboard when the whole group is inside the selection. Tiles carry
  // no ID, so membership is compared by the resolved item (not by ID).
  const groupRefs = new Map();
  for (const { kind, item } of entries) {
    const members = groupMembers(room, kind, item),
      inside = members.every((m) => chosen.has(m));
    if (item.assemblyId) groupRefs.set('assemblyId:' + item.assemblyId, inside);
    if (item.brickGroup) groupRefs.set('brickGroup:' + item.brickGroup, inside);
  }
  const clip = {
    version: 1,
    origin,
    bounds: {
      w: Math.max(...rects.map((r) => r.x + r.w)) - origin.x,
      h: Math.max(...rects.map((r) => r.y + r.h)) - origin.y,
    },
    internalIds: [...ids],
    groups: [...groupRefs].map(([key, inside]) => ({ key, inside })),
    items: entries.map(({ kind, item }) => ({
      kind,
      data: clone(item),
      x: rectOf(kind, item).x,
      y: rectOf(kind, item).y,
    })),
  };
  return clip;
}
function collectIds(clip) {
  const map = new Map();
  for (const entry of clip.items) {
    if (entry.kind === 'tiles' || !entry.data.id) continue;
    map.set(entry.data.id, uid(PREFIX[entry.kind] || 'copy'));
  }
  return map;
}
function externalClear(data, kind, internal, map) {
  if (kind === 'movables' && data.padId)
    data.padId = internal.has(data.padId) ? map.get(data.padId) : '';
  // attachmentTo is written on every member of a mixed assembly (tiles, spikes,
  // objects) and points at the movable leader. Remap it for every kind so a
  // copied group sticks to its new centre instead of the old mechanism.
  if (data.attachmentTo)
    if (internal.has(data.attachmentTo)) data.attachmentTo = map.get(data.attachmentTo);
    else delete data.attachmentTo;
  if (data.params) {
    for (const key of ['unlockPadId', 'zoneId', 'padId']) {
      const value = data.params[key];
      if (!value) continue;
      if (internal.has(value)) data.params[key] = map.get(value);
      else delete data.params[key];
    }
    if (Array.isArray(data.params.checkinIds))
      data.params.checkinIds = data.params.checkinIds
        .filter((id) => internal.has(id))
        .map((id) => map.get(id));
  }
}
function translate(kind, data, dx, dy) {
  if (Number.isFinite(Number(data.x))) data.x = Number(data.x) + dx;
  if (Number.isFinite(Number(data.y))) data.y = Number(data.y) + dy;
  if (kind === 'platforms') {
    if (Number.isFinite(Number(data.toX))) data.toX = Number(data.toX) + dx;
    if (Number.isFinite(Number(data.toY))) data.toY = Number(data.toY) + dy;
  }
  if (kind === 'patrols')
    for (const node of data.nodes || []) {
      node.x = Number(node.x) + dx;
      node.y = Number(node.y) + dy;
    }
  if (kind === 'movables') {
    if (Number.isFinite(Number(data.targetX))) data.targetX = Number(data.targetX) + dx;
    if (Number.isFinite(Number(data.targetY))) data.targetY = Number(data.targetY) + dy;
    for (const node of data.motionPath || []) {
      node.x = Number(node.x) + dx;
      node.y = Number(node.y) + dy;
    }
  }
  if (data.params?.path)
    for (const node of data.params.path) {
      node.x = Number(node.x) + dx;
      node.y = Number(node.y) + dy;
    }
}
function validate(room, kind, data) {
  const rect = Native.rect(kind, data);
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.w) ||
    !Number.isFinite(rect.h) ||
    rect.w <= 0 ||
    rect.h <= 0
  )
    return '坐标或尺寸无效';
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > room.cols || rect.y + rect.h > room.rows)
    return '超出房间边界';
  if (kind === 'patrols')
    for (const node of data.nodes || [])
      if (
        !Number.isFinite(Number(node.x)) ||
        !Number.isFinite(Number(node.y)) ||
        node.x - 0.5 < 0 ||
        node.y - 0.5 < 0 ||
        node.x + 0.5 > room.cols ||
        node.y + 0.5 > room.rows
      )
        return '巡逻节点超出房间边界';
  if (kind === 'platforms' && (data.toX !== undefined || data.toY !== undefined)) {
    const tx = Number.isFinite(Number(data.toX)) ? Number(data.toX) : Number(data.x),
      ty = Number.isFinite(Number(data.toY)) ? Number(data.toY) : Number(data.y);
    if (
      tx < 0 ||
      ty < 0 ||
      tx + (Number(data.w) || 1) > room.cols ||
      ty + (Number(data.h) || 1) > room.rows
    )
      return '平台目标点超出房间边界';
  }
  for (const node of data.params?.path || [])
    if (node.x < 0 || node.y < 0 || node.x > room.cols || node.y > room.rows)
      return '轨道节点超出房间边界';
  for (const node of data.motionPath || [])
    if (node.x < 0 || node.y < 0 || node.x >= room.cols || node.y >= room.rows)
      return '运动路径超出房间边界';
  if (kind === 'tiles' && (!Number.isInteger(Number(data.x)) || !Number.isInteger(Number(data.y))))
    return '地形坐标必须是整数格';
  return null;
}
function paste(room, clip, { offsetX = 0, offsetY = 0 } = {}) {
  if (!clip?.items?.length) throw new Error('剪贴板为空。');
  const dx = round(offsetX),
    dy = round(offsetY),
    internal = new Set(clip.internalIds || []),
    map = collectIds(clip),
    groupMap = new Map(),
    insideKeys = (clip.groups || []).filter((g) => g.inside).map((g) => g.key);
  for (const key of insideKeys)
    if (!groupMap.has(key))
      groupMap.set(key, uid(key.startsWith('assembly') ? 'assembly' : 'brick-group'));
  // A brick group created by the assembly tool mirrors its assembly ID; keep the
  // pasted copy on one shared group so the group stays coherent.
  for (const key of insideKeys) {
    if (!key.startsWith('brickGroup:')) continue;
    const asm = 'assemblyId:' + key.slice('brickGroup:'.length);
    if (groupMap.has(asm)) groupMap.set(key, groupMap.get(asm));
  }
  const plan = clip.items.map((entry) => {
    const data = clone(entry.data);
    translate(entry.kind, data, dx, dy);
    if (entry.kind !== 'tiles')
      data.id = map.get(entry.data.id) || uid(PREFIX[entry.kind] || 'copy');
    externalClear(data, entry.kind, internal, map);
    // Groups travel for every kind, terrain included: a partially selected group
    // is copied with its external group membership removed.
    for (const key of ['assemblyId', 'brickGroup'])
      if (data[key]) {
        const next = groupMap.get(key + ':' + data[key]);
        if (next) data[key] = next;
        else delete data[key];
      }
    if (entry.kind === 'movables' || data.type === 'physics.rail')
      Rail.ensure(data, { newIds: true });
    const problem = validate(room, entry.kind, data);
    if (problem) throw new Error(problem + '，未粘贴任何内容。');
    return { kind: entry.kind, data };
  });
  // Terrain that already exists is merged instead of duplicated.
  const occupied = new Set(room.tiles.map((t) => t.x + ',' + t.y)),
    refs = [];
  // Native kinds live in room.nativeCampaign; create that container only after
  // every item passed validation, so a rejected paste mutates nothing.
  if (plan.some((entry) => Native.kinds.includes(entry.kind))) Native.initRoom(room);
  for (const entry of plan) {
    if (entry.kind === 'tiles') {
      const key = entry.data.x + ',' + entry.data.y;
      if (!occupied.has(key)) {
        room.tiles.push(entry.data);
        occupied.add(key);
      }
      refs.push({ kind: 'tiles', x: entry.data.x, y: entry.data.y });
      continue;
    }
    const isNative = Native.kinds.includes(entry.kind);
    let bucket = isNative ? room.nativeCampaign[entry.kind] : (room[entry.kind] ||= []);
    if (!Array.isArray(bucket)) {
      // A malformed/legacy container must not silently swallow the pasted item.
      bucket = [];
      if (isNative) room.nativeCampaign[entry.kind] = bucket;
      else room[entry.kind] = bucket;
    }
    bucket.push(entry.data);
    refs.push({ kind: entry.kind, id: entry.data.id });
  }
  return { refs, count: plan.length };
}
module.exports = { capture, paste, KINDS };
