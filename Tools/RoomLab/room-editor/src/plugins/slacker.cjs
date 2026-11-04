'use strict';
// Slacker mechanisms stay small and observable: check-in records a visible
// count/feedback, wakefulness grants a short speed burst through the existing
// launchPlayer context (no extra persistent runtime state is introduced).
const base = {
  version: '1.0.0',
  category: '水课',
  courses: ['slacker'],
  slots: ['idle', 'active'],
  collider: 'pad',
  trigger: 'foot',
};
module.exports = [
  {
    ...base,
    type: 'slacker.checkin',
    name: '签到板',
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
    type: 'slacker.awake',
    name: '清醒板',
    glyph: '☕',
    defaults: { speed: 520, lift: 140, cooldown: 3 },
    schema: [
      { key: 'speed', label: '清醒加速速度', kind: 'number', min: 100, max: 1200 },
      { key: 'lift', label: '附加上抛速度', kind: 'number', min: 0, max: 600 },
      { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 30 },
    ],
    createState: () => ({ boosts: 0 }),
    onTrigger(ctx, o, s) {
      const direction = ctx.player.face || 1;
      ctx.launchPlayer(direction * o.params.speed, -o.params.lift);
      s.boosts = (s.boosts || 0) + 1;
      ctx.say('清醒：短暂加速');
      ctx.emit('awake', { id: o.id, speed: o.params.speed, direction, count: s.boosts });
    },
    visual: (ctx, o, s) => (s.cooldown > 0 ? 'active' : 'idle'),
  },
];
