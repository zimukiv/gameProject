'use strict';
module.exports = {
  type: 'physics.jet',
  version: '2.0.0',
  compatibleMajors: ['1'],
  name: '喷气装置',
  glyph: '↑',
  category: '物理',
  courses: ['physics'],
  slots: ['idle', 'active'],
  trigger: 'foot',
  collider: 'pad',
  defaults: {
    direction: 'up',
    force: 900,
    launchX: 0,
    launchY: -900,
    cooldown: 1,
    affectAI: true,
    range: 3,
  },
  schema: [
    {
      key: 'direction',
      label: '喷气方向',
      kind: 'select',
      values: ['up', 'down', 'left', 'right', 'custom'],
      labels: {
        up: '向上',
        down: '向下',
        left: '向左',
        right: '向右',
        custom: '自定义横纵速度（兼容旧版）',
      },
    },
    {
      key: 'force',
      label: '喷气力度（自定义方向时由横纵速度决定）',
      kind: 'number',
      min: 0,
      max: 1500,
    },
    { key: 'launchX', label: '自定义横向速度', kind: 'number', min: -1000, max: 1000 },
    { key: 'launchY', label: '自定义竖向速度（负值向上）', kind: 'number', min: -1500, max: 1000 },
    { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 10 },
    { key: 'affectAI', label: '也影响范围内 AI', kind: 'boolean' },
    { key: 'range', label: '施力范围（格）', kind: 'number', min: 1, max: 20 },
  ],
  onTrigger(ctx, o) {
    ctx.launchPlayer(o.params.launchX, o.params.launchY);
    if (o.params.affectAI) ctx.launchAI(o, o.params.range, o.params.launchX, o.params.launchY);
    ctx.emit('jet', { id: o.id });
  },
  visual: (ctx, o, s) => (s.cooldown > 0 ? 'active' : 'idle'),
};
