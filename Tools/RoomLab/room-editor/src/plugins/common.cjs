'use strict';
const base = {
  version: '1.0.0',
  courses: ['*'],
  category: '通用',
  slots: ['idle'],
  schema: [],
  defaults: {},
  collider: false,
  trigger: 'none',
};
function rearmAI(ctx, o, state) {
  if (!ctx.ai.active)
    Object.assign(state, { used: false, cooldown: 0, firedDuringContact: false, waitingAI: false });
}
module.exports = [
  { ...base, type: 'common.coin', name: '大 token', glyph: 'T' },
  { ...base, type: 'common.small', name: '小 token', glyph: '+' },
  { ...base, type: 'common.collectible', name: '收藏品', glyph: '★' },
  { ...base, type: 'common.spike', name: '尖刺', glyph: '^' },
  {
    ...base,
    type: 'common.checkpoint',
    name: '存档点',
    glyph: '⚑',
    category: '流程',
    slots: ['idle', 'active'],
    collider: false,
    trigger: 'region',
    onTrigger(ctx, o) {
      ctx.setCheckpoint(o);
    },
    visual(ctx, o, state) {
      return state.active ? 'active' : 'idle';
    },
  },
  {
    ...base,
    type: 'common.aiStart',
    name: 'AI 启动板',
    version: '1.1.0',
    glyph: 'AI',
    collider: 'tile',
    trigger: 'foot',
    defaults: { once: true },
    afterRetry: rearmAI,
    onTrigger(ctx, o) {
      ctx.activateAI(o);
    },
  },
  {
    ...base,
    type: 'common.aiStartHollow',
    hidden: true, // v2 compatibility alias; the editor exposes one AI block with a collision switch.
    name: 'AI 启动板 · 空心',
    glyph: 'AI',
    hollow: true,
    collider: false,
    trigger: 'region',
    defaults: { once: true },
    afterRetry: rearmAI,
    onTrigger(ctx, o) {
      ctx.activateAI(o);
    },
  },
  {
    ...base,
    type: 'common.portalIn',
    name: 'AI 传送入口',
    glyph: 'AI↓',
    defaults: { routeId: 'route-1' },
    schema: [{ key: 'routeId', label: '传送路径 ID', kind: 'text' }],
  },
  {
    ...base,
    type: 'common.portalOut',
    name: 'AI 传送出口',
    glyph: 'AI↑',
    defaults: { routeId: 'route-1' },
    schema: [{ key: 'routeId', label: '传送路径 ID', kind: 'text' }],
  },
];
