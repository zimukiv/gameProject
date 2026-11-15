'use strict';
const TEACHER = 'slacker.teacher',
  CHECKIN = 'slacker.checkin';
const isTeacher = (o) => o?.type === TEACHER;
const ids = (teacher) =>
  Array.isArray(teacher?.params?.checkinIds)
    ? [...new Set(teacher.params.checkinIds.filter((id) => typeof id === 'string' && id))]
    : [];
function checkins(room, teacher) {
  const wanted = new Set(ids(teacher));
  return room.objects.filter((o) => o.type === CHECKIN && wanted.has(o.id));
}
function set(teacher, next) {
  teacher.params ||= {};
  teacher.params.checkinIds = [...new Set(next.filter(Boolean))];
}
function toggle(room, teacher, targets) {
  if (!isTeacher(teacher)) return false;
  const valid = new Set(
      room.objects.filter((o) => o.type === CHECKIN).map((o) => o.id),
    ),
    picked = [...new Set(targets.map((o) => o?.id).filter((id) => valid.has(id)))];
  if (!picked.length) return false;
  const current = new Set(ids(teacher)),
    allBound = picked.every((id) => current.has(id));
  for (const id of picked) {
    if (allBound) current.delete(id);
    else current.add(id);
  }
  set(teacher, [...current]);
  return true;
}
function move(teacher, dx) {
  if (!isTeacher(teacher) || !dx) return;
  teacher.params ||= {};
  teacher.params.patrolMinX = Number(teacher.params.patrolMinX || 0) + dx;
  teacher.params.patrolMaxX = Number(teacher.params.patrolMaxX || 0) + dx;
}
function remap(teacher, map) {
  if (!isTeacher(teacher)) return;
  set(teacher, ids(teacher).map((id) => map.get(id) || id));
}
function cleanup(room) {
  const valid = new Set(
    room.objects.filter((o) => o.type === CHECKIN).map((o) => o.id),
  );
  for (const o of room.objects)
    if (isTeacher(o)) set(o, ids(o).filter((id) => valid.has(id)));
}
module.exports = {
  TEACHER,
  CHECKIN,
  isTeacher,
  ids,
  checkins,
  set,
  toggle,
  move,
  remap,
  cleanup,
};
