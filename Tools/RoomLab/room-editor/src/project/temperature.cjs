'use strict';
function initial(room, zoneId = '', parameters = (o) => o.params || {}) {
  let value = room.zones.find((z) => z.id === zoneId)?.initial || room.environment || 'cold';
  for (const o of room.objects) {
    const p = parameters(o);
    if (
      o.type === 'physics.thermal' &&
      (p.zoneId || '') === (zoneId || '') &&
      ['cold', 'hot'].includes(p.initialState ?? p.initial)
    )
      value = p.initialState ?? p.initial;
  }
  return value;
}
function covers(zone, o) {
  return (
    o.x < zone.x + zone.w &&
    o.x + (o.w || 1) > zone.x &&
    o.y < zone.y + zone.h &&
    o.y + (o.h || 1) > zone.y
  );
}
function affected(room, zoneId) {
  const zone = room.zones.find((z) => z.id === zoneId);
  return room.objects.filter(
    (o) =>
      o.type === 'physics.ice' && (zone ? covers(zone, o) : !room.zones.some((z) => covers(z, o))),
  );
}
function at(room, o, states = null, environment = null, parameters = (o) => o.params || {}) {
  const zones = room.zones.filter((z) => covers(z, o));
  if (!zones.length) return environment || initial(room, '', parameters);
  return zones.some((z) => (states?.get(z.id) || initial(room, z.id, parameters)) === 'hot')
    ? 'hot'
    : 'cold';
}
// v2 export compatibility only: older editors require a single zone reference.
function legacyZone(room, o) {
  const zones = room.zones.filter((z) => covers(z, o));
  return (zones.find((z) => initial(room, z.id) === 'hot') || zones[0])?.id || '';
}
module.exports = { initial, covers, affected, at, legacyZone };
