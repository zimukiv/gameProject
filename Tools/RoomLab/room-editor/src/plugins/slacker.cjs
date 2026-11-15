'use strict';
// Slacker mechanisms stay small and observable: check-in records a visible
// count/feedback, wakefulness grants a directional speed burst through the
// existing launchPlayer context (no extra persistent runtime state is introduced).
const base = {
  version: '1.0.0',
  category: '水课',
  courses: ['slacker'],
  slots: ['idle', 'active'],
  collider: 'pad',
  trigger: 'foot',
};
function entryDirection(player) {
  const x = Number(player?.vx) || 0,
    y = Number(player?.vy) || 0;
  if (Math.abs(x) < 1 && Math.abs(y) < 1)
    return { x: player?.face === -1 ? -1 : 1, y: 0 };
  if (Math.abs(x) >= Math.abs(y)) return { x: x < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: y < 0 ? -1 : 1 };
}
module.exports = [
  {
    ...base,
    version: '1.1.0',
    type: 'slacker.checkin',
    name: '签到板',
    requiresItem: 'item.phone',
    glyph: '✓',
    defaults: { cooldown: 1 },
    schema: [
      { key: 'cooldown', label: '重复签到冷却（秒）', kind: 'number', min: 0.1, max: 30 },
    ],
    createState: () => ({ signIns: 0 }),
    onTrigger(ctx, o, s) {
      s.signIns = (s.signIns || 0) + 1;
      ctx.say('签到成功：第 ' + s.signIns + ' 次记录');
      ctx.emit('checkin', { id: o.id, count: s.signIns });
    },
    visual: (ctx, o, s) => (s.signIns > 0 ? 'active' : 'idle'),
  },
  {
    ...base,
    version: '1.2.0',
    type: 'slacker.awake',
    name: '清醒板',
    glyph: '☕',
    collider: 'tile',
    requiresItem: 'item.coffee',
    silentWithoutItem: true,
    dynamicSolidity: true,
    trigger: 'region',
    isSolid(ctx) {
      return !ctx.hasItem('item.coffee');
    },
    defaults: { speed: 520, cooldown: 3 },
    schema: [
      { key: 'speed', label: '通过方向加速速度', kind: 'number', min: 100, max: 1200 },
      { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 30 },
    ],
    createState: () => ({ boosts: 0 }),
    onTrigger(ctx, o, s) {
      const direction = entryDirection(ctx.player);
      ctx.launchPlayer(direction.x * o.params.speed, direction.y * o.params.speed);
      s.boosts = (s.boosts || 0) + 1;
      ctx.say('清醒：沿进入方向加速');
      ctx.emit('awake', { id: o.id, speed: o.params.speed, direction, count: s.boosts });
    },
    visual: (ctx, o, s) => (s.cooldown > 0 ? 'active' : 'idle'),
  },
];
