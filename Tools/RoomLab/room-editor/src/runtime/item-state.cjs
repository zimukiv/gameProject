'use strict';
// 项目全局道具状态：初始状态（项目级、可序列化）与运行时收集状态接口。
// 字段合同（项目 v2 可选顶层字段）：
//   project.itemState = { version: 1, initial: { [itemType]: count } }
// 只保存初始状态；运行时收集状态跨房间保存在 Engine.items，死亡时随存档点
// 快照回退（checkpoint.items / checkpoint.collects），不写回项目、不进入正常
// 成品流程之外。
const VERSION = 1,
  FIELD = 'itemState';

function isCount(value) {
  return Number.isInteger(value) && value > 0;
}

function sanitize(items) {
  const out = {};
  if (!items || typeof items !== 'object' || Array.isArray(items)) return out;
  for (const [type, count] of Object.entries(items))
    if (typeof type === 'string' && type && isCount(count)) out[type] = count;
  return out;
}

function initial(project) {
  return sanitize(project?.[FIELD]?.initial);
}

function setInitial(project, items) {
  const clean = sanitize(items),
    previous = project[FIELD];
  project[FIELD] = {
    ...(previous && typeof previous === 'object' ? previous : {}),
    version: VERSION,
    initial: clean,
  };
  return project[FIELD];
}

// 运行时接口：Engine 只需实现 items 与 itemCollects（已收集道具对象键）。
// 恢复语义：items 与 collected 都是完整覆盖，不叠加当前状态。
// - collected 中的道具对象键保持“已收集”（不可重复拾取）；
// - 不在 collected 中的道具对象键会从 credited 移除，允许重新收集；
// - credited 中的非道具收集物（金币等）不属于本接口合同，保持原状。
function snapshot(engine) {
  return {
    version: VERSION,
    items: { ...(engine?.items || {}) },
    collected: Array.isArray(engine?.itemCollects) ? engine.itemCollects.slice() : [],
  };
}

function restore(engine, state) {
  if (!engine || !state || typeof state !== 'object') return false;
  engine.items = sanitize(state.items);
  const collected = new Set(
    (Array.isArray(state.collected) ? state.collected : []).filter(
      (key) => typeof key === 'string' && key,
    ),
  );
  if (engine.credited instanceof Set) {
    for (const key of Array.isArray(engine.itemCollects) ? engine.itemCollects : [])
      if (!collected.has(key)) engine.credited.delete(key);
    for (const key of collected) engine.credited.add(key);
  }
  engine.itemCollects = [...collected];
  return true;
}

module.exports = { VERSION, FIELD, sanitize, initial, setInitial, snapshot, restore };
