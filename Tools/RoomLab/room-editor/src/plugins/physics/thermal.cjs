'use strict';
module.exports = {
  type: 'physics.thermal',
  version: '1.1.0',
  name: '冷热控制板',
  glyph: '℃',
  category: '物理',
  courses: ['physics'],
  slots: ['cold', 'hot'],
  collider: 'pad',
  trigger: 'foot',
  defaults: { zoneId: '', mode: 'toggle', cooldown: 1, initialState: 'inherit' },
  schema: [
    { key: 'zoneId', label: '控制区域', kind: 'zone' },
    {
      key: 'initialState',
      label: '初始状态',
      kind: 'select',
      values: ['inherit', 'cold', 'hot'],
      labels: { inherit: '继承区域', cold: '初始冷', hot: '初始热' },
    },
    { key: 'mode', label: '切换方式', kind: 'select', values: ['toggle', 'cold', 'hot'] },
    { key: 'cooldown', label: '冷却（秒）', kind: 'number', min: 0.1, max: 10 },
  ],
  createState(ctx, o) {
    return { lastTemperature: ctx.temperature(o) };
  },
  onTrigger(ctx, o, s) {
    const old = ctx.temperature(o),
      next = o.params.mode === 'toggle' ? (old === 'cold' ? 'hot' : 'cold') : o.params.mode;
    ctx.setTemperature(o.params.zoneId, next);
    s.lastTemperature = next;
    ctx.emit('temperature', { id: o.id, zoneId: o.params.zoneId, value: next });
  },
  restoreEffects(ctx, o, s) {
    if (s.lastTemperature) ctx.setTemperature(o.params.zoneId, s.lastTemperature);
  },
  restoreSnapshotEffects(o, s, cache) {
    if (o.params.zoneId) cache.zones[o.params.zoneId] = s.lastTemperature;
    else cache.environment = s.lastTemperature;
  },
  visual(ctx, o) {
    return ctx.temperature(o);
  },
};
