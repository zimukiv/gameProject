'use strict';
const { clone } = require('../shared/utils.cjs');
function enabled(o, kind = 'objects', definition = {}) {
  return typeof o.collision === 'boolean'
    ? o.collision
    : kind === 'tiles' || kind === 'movables' || kind === 'platforms' || !!definition.collider;
}
function shape(o, definition) {
  return enabled(o, 'objects', definition) ? definition.collider || 'tile' : false;
}
function owner(room, item, kind) {
  return require('./block-groups.cjs').collisionOwner(room, item, kind);
}
function inherited(room, item, kind, definition = {}, states = null) {
  const source = owner(room, item, kind);
  const def =
    source.item === item
      ? definition
      : source.kind === 'objects'
        ? require('../plugins/registry.cjs').get(source.item.type)
        : {};
  if (!enabled(source.item, source.kind, def)) return false;
  return (
    !states ||
    source.kind !== 'movables' ||
    require('./brick-motion.cjs').movingCollision(source.item, states.get(source.item.id))
  );
}
function normalize(p) {
  for (const c of p.courses || [])
    for (const r of c.rooms || [])
      for (const o of r.objects || []) {
        if (o.type === 'physics.jet') require('./jet-params.cjs').materialize(p, o);
        if (o.type === 'physics.ice' && o.params) delete o.params.zoneId;
        if (o.type === 'common.aiStartHollow') {
          o.type = 'common.aiStart';
          o.collision = false;
          o.assetOverrides = { ...c.artBindings?.['common.aiStartHollow'], ...o.assetOverrides };
        }
      }
  return p;
}
function portable(project) {
  const p = clone(project);
  for (const c of p.courses || [])
    for (const r of c.rooms || [])
      for (const o of r.objects || []) {
        if (o.type === 'physics.jet') require('./jet-params.cjs').materialize(p, o);
        if (o.type === 'physics.ice')
          o.params = { ...o.params, zoneId: require('./temperature.cjs').legacyZone(r, o) };
        if (o.type === 'common.aiStart' && o.collision === false) {
          o.type = 'common.aiStartHollow';
          o.trigger = { ...o.trigger, mode: 'region' };
        }
      }
  return require('./compatibility.cjs').normalize(p);
}
module.exports = { enabled, shape, normalize, portable, owner, inherited };
