'use strict';
function move(course, id, targetId, after = false) {
  const from = course.rooms.findIndex((r) => r.id === id),
    target = course.rooms.findIndex((r) => r.id === targetId);
  if (from < 0 || target < 0) throw new Error('要排序的房间不存在');
  if (id === targetId) return false;
  const before = course.rooms.map((r) => r.id).join('\0'),
    [room] = course.rooms.splice(from, 1),
    at = course.rooms.findIndex((r) => r.id === targetId) + (after ? 1 : 0);
  course.rooms.splice(at, 0, room);
  return before !== course.rooms.map((r) => r.id).join('\0');
}
module.exports = { move };
