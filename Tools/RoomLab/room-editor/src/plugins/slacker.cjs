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
// Screen coordinates: 0° points right, +90° points down. Incoming velocity is
// quantised into eight 45° sectors. Sectors are half-open
// [center-22.5°, center+22.5°), so the right sector is exactly
// -22.5° ≤ angle < +22.5° (the +22.5° boundary belongs to down-right).
const S = Math.SQRT1_2,
  EIGHT_WAY = [
    { x: 1, y: 0 }, // right
    { x: S, y: S }, // down-right
    { x: 0, y: 1 }, // down
    { x: -S, y: S }, // down-left
    { x: -1, y: 0 }, // left
    { x: -S, y: -S }, // up-left
    { x: 0, y: -1 }, // up
    { x: S, y: -S }, // up-right
  ];
function entryDirection(player) {
  const x = Number(player?.vx) || 0,
    y = Number(player?.vy) || 0;
  // Zero speed (including a stationary player that only has a facing flag)
  // must not invent a direction; stay idle until real entry velocity exists.
  if (Math.hypot(x, y) < 1) return null;
  const angle = Math.atan2(y, x),
    sector = Math.round((angle + 1e-9) / (Math.PI / 4));
  return { ...EIGHT_WAY[((sector % 8) + 8) % 8] };
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
    schema: [{ key: 'cooldown', label: '重复签到冷却（秒）', kind: 'number', min: 0.1, max: 30 }],
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
    version: '1.3.0',
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
    canTrigger(ctx) {
      return entryDirection(ctx.player) !== null;
    },
    onTrigger(ctx, o, s) {
      const direction = entryDirection(ctx.player);
      if (!direction) return;
      ctx.launchPlayer(direction.x * o.params.speed, direction.y * o.params.speed);
      s.boosts = (s.boosts || 0) + 1;
      ctx.say('清醒：沿进入方向加速');
      ctx.emit('awake', { id: o.id, speed: o.params.speed, direction, count: s.boosts });
    },
    visual: (ctx, o, s) => (s.cooldown > 0 ? 'active' : 'idle'),
  },
];
