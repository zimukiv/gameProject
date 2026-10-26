'use strict';
// v1 maps retain their mechanism identities; compatibility is isolated from the physics-course modules.
module.exports = ['integral', 'derivative', 'rotor'].map((kind) => ({
  type: 'legacy.' + kind,
  version: '1.0.0',
  name: '旧版 ' + { integral: '聚拢', derivative: '拆散', rotor: '旋转' }[kind],
  glyph: { integral: '∫', derivative: 'd/dx', rotor: 'R' }[kind],
  category: '迁移兼容',
  courses: ['legacy'],
  slots: ['idle', 'active'],
  collider: 'pad',
  trigger: 'foot',
  defaults: { range: 12, once: kind !== 'rotor', angle: 90, launchX: 430, launchY: -780 },
  schema: [],
  onTrigger(ctx, o) {
    ctx.transformGroup(o, kind);
  },
}));
