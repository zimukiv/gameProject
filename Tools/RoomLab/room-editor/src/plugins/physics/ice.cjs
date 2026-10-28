'use strict';
module.exports = {
  type: 'physics.ice',
  version: '1.0.0',
  name: '累计融化冰块',
  glyph: '❄',
  category: '物理',
  courses: ['physics'],
  slots: ['solid', 'cracked', 'melted'],
  collider: 'tile',
  trigger: 'none',
  defaults: { meltAfter: 5, respawnDelay: 1, friction: 1.4 },
  schema: [
    { key: 'meltAfter', label: '累计站立融化（秒）', kind: 'number', min: 0.1, max: 60 },
    { key: 'respawnDelay', label: '冷态再生成间隔（秒）', kind: 'number', min: 0, max: 30 },
    { key: 'friction', label: '松键减速系数（越小越滑）', kind: 'number', min: 0.1, max: 20 },
  ],
  createState(ctx, o) {
    const cold = ctx.temperature(o) === 'cold';
    return { solid: cold, standing: 0, respawnRemaining: o.params.respawnDelay, generation: 0 };
  },
  isSolid(ctx, o, s) {
    return s.solid;
  },
  surface(ctx, o) {
    return { friction: o.params.friction, acceleration: 430 };
  },
  tick(ctx, o, s, dt) {
    const cold = ctx.temperature(o) === 'cold';
    if (!cold) {
      if (s.solid) {
        s.solid = false;
        s.respawnRemaining = o.params.respawnDelay;
        ctx.emit('ice-melt', { id: o.id, reason: 'heat' });
      }
      return;
    }
    if (s.solid) {
      if (ctx.player.grounded && ctx.player.support === o.id) s.standing += dt;
      if (s.standing >= o.params.meltAfter) {
        s.solid = false;
        s.respawnRemaining = o.params.respawnDelay;
        ctx.emit('ice-melt', { id: o.id, reason: 'standing' });
      }
    } else {
      s.respawnRemaining = Math.max(0, s.respawnRemaining - dt);
      if (s.respawnRemaining === 0 && !ctx.actorOverlaps(o)) {
        s.solid = true;
        s.standing = 0;
        s.generation++;
        ctx.emit('ice-create', { id: o.id });
      }
    }
  },
  visual(ctx, o, s) {
    return !s.solid ? 'melted' : s.standing >= o.params.meltAfter * 0.6 ? 'cracked' : 'solid';
  },
};
