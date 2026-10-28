'use strict';
const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function resolve(values, explicit = values) {
  const result = { ...values };
  const direction =
    explicit.direction ||
    (explicit.launchX !== undefined || explicit.launchY !== undefined
      ? 'custom'
      : values.direction);
  result.direction = direction;
  if (vectors[direction]) {
    const force = explicit.force ?? values.force;
    result.force = force;
    result.launchX = vectors[direction][0] * force;
    result.launchY = vectors[direction][1] * force;
  } else if (direction === 'custom') {
    result.force = Math.hypot(result.launchX, result.launchY);
  }
  return result;
}
function materialize(project, object) {
  const explicit = { ...project.blockDefaults?.['physics.jet']?.params, ...object.params };
  if (!vectors[explicit.direction]) return;
  const p = resolve({ launchX: 0, launchY: -900, force: 900, ...explicit }, explicit);
  object.params = { ...object.params, launchX: p.launchX, launchY: p.launchY };
}
module.exports = { resolve, materialize };
