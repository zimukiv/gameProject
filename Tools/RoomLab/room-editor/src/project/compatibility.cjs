'use strict';
// Called on an already cloned v2 project, after legacy jet parameters are materialized.
// The unmarked checkpoint type identifies the supplied friend fork, not generic 2.5.2 files.
const RUNTIME = '2.5.5';
function normalize(project) {
  const objects = (project.courses || []).flatMap((c) => c.rooms.flatMap((r) => r.objects || []));
  const previous = project.compatibility || {};
  const friend = !previous.runtime && objects.some((o) => o.type === 'common.checkpoint');
  if (friend) {
    for (const o of objects) {
      if (o.type === 'physics.jet' && ['left', 'right'].includes(o.params?.direction)) {
        o.collision = false;
        o.trigger = { ...o.trigger, mode: 'region' };
      }
      if (o.type === 'physics.rail') o.params = { ...o.params, sideTrigger: true };
    }
  }
  if (project.settings) project.settings.paidStockCap = 1;
  project.pluginManifest = { ...project.pluginManifest };
  const awakeVersion = project.pluginManifest['slacker.awake'];
  if (
    objects.some((o) => o.type === 'slacker.awake') &&
    (!awakeVersion || ['1.0.0', '1.1.0'].includes(awakeVersion))
  ) {
    for (const course of project.courses || [])
      for (const room of course.rooms || []) {
        const occupied = new Set((room.tiles || []).map((tile) => tile.x + ',' + tile.y));
        for (const o of room.objects || [])
          if (o.type === 'slacker.awake') {
            if (o.y > 0 && occupied.has(o.x + ',' + o.y)) o.y -= 1;
            o.collision = true;
            o.trigger = { ...o.trigger, mode: 'region' };
          }
      }
    project.pluginManifest['slacker.awake'] = '1.3.0';
  }
  if (
    objects.some((o) => o.type === 'common.checkpoint') &&
    !project.pluginManifest['common.checkpoint']
  )
    project.pluginManifest['common.checkpoint'] = '1.0.0';
  if (
    objects.some((o) => o.type === 'physics.rail' && o.params?.sideTrigger) &&
    (!project.pluginManifest['physics.rail'] ||
      String(project.pluginManifest['physics.rail']).split('.')[0] === '1')
  )
    project.pluginManifest['physics.rail'] = '2.0.0';
  project.compatibility = {
    ...previous,
    runtime: previous.runtime || RUNTIME,
    ...(friend ? { importedProfile: 'friend-2.5.2' } : {}),
  };
  return project;
}
module.exports = { normalize, RUNTIME };
