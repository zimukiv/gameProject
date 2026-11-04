'use strict';
// Calculus mechanisms reuse the existing group-displacement context instead of
// copying the physics templates. Integral converges bound blocks onto their
// targets (closing a gap); derivative disperses them away (clearing a gate).
const base = {
  version: '1.0.0',
  category: '高数',
  courses: ['calculus'],
  slots: ['idle', 'active'],
  collider: 'pad',
  trigger: 'foot',
};
module.exports = [
  {
    ...base,
    type: 'calculus.integral',
    name: '积分聚合板',
    glyph: '∫',
    defaults: { range: 12, once: true, cooldown: 1 },
    schema: [
      { key: 'range', label: '聚合范围（格）', kind: 'number', min: 1, max: 40 },
      { key: 'once', label: '只聚合一次', kind: 'boolean' },
      { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 10 },
    ],
    onTrigger(ctx, o, s) {
      ctx.transformGroup(o, 'integral');
      s.fired = true;
      ctx.say('积分：机关砖向目标聚合');
      ctx.emit('calculus-integral', { id: o.id });
    },
    visual: (ctx, o, s) => (s.fired ? 'active' : 'idle'),
  },
  {
    ...base,
    type: 'calculus.derivative',
    name: '求导展开板',
    glyph: 'd/dx',
    defaults: { range: 12, once: true, cooldown: 1 },
    schema: [
      { key: 'range', label: '展开范围（格）', kind: 'number', min: 1, max: 40 },
      { key: 'once', label: '只展开一次', kind: 'boolean' },
      { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 10 },
    ],
    onTrigger(ctx, o, s) {
      ctx.transformGroup(o, 'derivative');
      s.fired = true;
      ctx.say('求导：机关砖向目标展开');
      ctx.emit('calculus-derivative', { id: o.id });
    },
    visual: (ctx, o, s) => (s.fired ? 'active' : 'idle'),
  },
];
