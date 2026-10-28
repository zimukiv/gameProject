'use strict';
// Called on an already cloned v2 project, after legacy jet parameters are materialized.
// The unmarked checkpoint type identifies the supplied friend fork, not generic 2.5.2 files.
// A project that already carries compatibility.runtime must never be treated as the friend
// profile again: the stage-1 custom project is marked explicitly and stays byte-stable.
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
  project.pluginManifest = { ...project.pluginManifest };
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
