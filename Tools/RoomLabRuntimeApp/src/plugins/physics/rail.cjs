'use strict';
module.exports = {
  type: 'physics.rail',
  version: '2.0.0',
  compatibleMajors: ['1'],
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
    sideTrigger: false,
  },
  schema: [
    { key: 'path', label: '轨道节点（格坐标）', kind: 'path' },
    { key: 'acceleration', label: '匀加速度', kind: 'number', min: 100, max: 6000 },
    { key: 'maxSpeed', label: '速度上限', kind: 'number', min: 100, max: 1800 },
    { key: 'launchAngle', label: '终点抛出角度', kind: 'number', min: -180, max: 180 },
    { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 20 },
    { key: 'allowExit', label: '允许跳跃/冲刺脱离', kind: 'boolean' },
    { key: 'sideTrigger', label: '允许左右侧面接触启动（朋友版兼容）', kind: 'boolean' },
  ],
  onTrigger(ctx, o) {
    ctx.startRail(o);
    ctx.emit('rail-start', { id: o.id });
  },
  visual: (ctx, o) => (ctx.player.rail?.id === o.id ? 'active' : 'idle'),
  triggerOccupied(ctx, o, player, rect, oldBottom) {
    if (!o.params.sideTrigger) return undefined;
    const top =
      player.grounded &&
      player.vy >= 0 &&
      oldBottom <= rect.y + 2 &&
      Math.abs(player.y + player.h - rect.y) < 1 &&
      player.x + player.w > rect.x + 2 &&
      player.x < rect.x + rect.w - 2;
    const vertical = player.y + player.h > rect.y && player.y < rect.y + rect.h;
    const left = player.x <= rect.x + 2 && player.x + player.w >= rect.x - 8;
    const right = player.x >= rect.x + rect.w - 2 && player.x <= rect.x + rect.w + 8;
    // Hollow devices retain the independent overlap trigger as well.
    const inside = player.x + player.w > rect.x && player.x < rect.x + rect.w;
    return top || (vertical && (left || right || inside));
  },
};
