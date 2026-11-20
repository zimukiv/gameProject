'use strict';
// 房间“试玩进入背包”配置。字段合同（项目 v2 内房间的可选字段）：
//   room.playtestItems: string[]   // 允许的道具类型 ID（来自 Registry 的 item 定义）
// 字段缺失 ⇒ 旧存档兼容行为：开发者试玩携带全部道具。
// 字段存在（含空数组）⇒ 显式配置优先：它是“进入时拥有哪些道具”的完整背包，
// 覆盖 project.itemState.initial（空数组即进入时不带道具），只注入列出的道具。
// 该配置只影响编辑器开发者试玩，不写入正常成品流程。
const Registry = require('../plugins/registry.cjs');
const FIELD = 'playtestItems';

function catalog() {
  return Registry.all()
    .filter((definition) => definition.item === true && typeof definition.type === 'string')
    .map((definition) => ({
      type: definition.type,
      name: definition.name || definition.type,
      glyph: definition.glyph || '◆',
    }));
}

function knownTypes() {
  return new Set(catalog().map((item) => item.type));
}

function sanitize(list) {
  if (!Array.isArray(list)) return null;
  const known = knownTypes(),
    out = [];
  for (const type of list)
    if (typeof type === 'string' && known.has(type) && !out.includes(type)) out.push(type);
  return out;
}

function read(room) {
  const configured = !!room && Object.prototype.hasOwnProperty.call(room, FIELD),
    items = configured ? sanitize(room[FIELD]) : null;
  return {
    configured,
    items: items || [],
    invalid: configured && sanitize(room[FIELD]) === null,
  };
}

// null ⇒ 删除字段，回到旧存档兼容行为。
function write(room, list) {
  if (list === null || list === undefined) {
    delete room[FIELD];
    return null;
  }
  const items = sanitize(Array.isArray(list) ? list : []);
  room[FIELD] = items || [];
  return room[FIELD];
}

function resolve(room) {
  const state = read(room);
  if (state.configured && !state.invalid)
    return { mode: 'configured', items: state.items.slice(), legacy: false };
  return { mode: 'legacy-all', items: catalog().map((item) => item.type), legacy: true };
}

module.exports = { FIELD, catalog, knownTypes, sanitize, read, write, resolve };
