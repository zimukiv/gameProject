'use strict';
module.exports = {
  type: 'physics.rail',
  version: '1.0.0',
  name: '电磁加速轨道',
  glyph: '⚡',
  category: '物理',
  courses: ['physics'],
  slots: ['idle', 'active'],
  collider: 'pad',
  trigger: 'foot',
  defaults: {
    path: [
      { x: 0.5, y: 0.5 },
      { x: 3.5, y: 0.5 },
    ],
    acceleration: 2400,
    maxSpeed: 900,
    launchAngle: -60,
    cooldown: 2,
    allowExit: true,
  },
  schema: [
    { key: 'path', label: '轨道节点（格坐标）', kind: 'path' },
    { key: 'acceleration', label: '匀加速度', kind: 'number', min: 100, max: 6000 },
    { key: 'maxSpeed', label: '速度上限', kind: 'number', min: 100, max: 1800 },
    { key: 'launchAngle', label: '终点抛出角度', kind: 'number', min: -180, max: 180 },
    { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 20 },
    { key: 'allowExit', label: '允许跳跃/冲刺脱离', kind: 'boolean' },
  ],
  onTrigger(ctx, o) {
    ctx.startRail(o);
    ctx.emit('rail-start', { id: o.id });
  },
  visual: (ctx, o) => (ctx.player.rail?.id === o.id ? 'active' : 'idle'),
};
