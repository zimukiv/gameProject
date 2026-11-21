// Pure room-history comparison. No I/O, credentials, URLs or storage; callers supply parsed project JSON.
// Rooms are matched by their globally unique room.id, never by name or position.
export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }
  const text = JSON.stringify(value);
  return text === undefined ? 'null' : text;
}
export function projectRooms(project) {
  const rooms = [];
  for (const course of Array.isArray(project?.courses) ? project.courses : [])
    for (const room of Array.isArray(course?.rooms) ? course.rooms : [])
      if (room && typeof room === 'object') rooms.push(room);
  return rooms;
}
export function roomContent(room) {
  const { graph, ...content } = room || {};
  return stableStringify(content);
}
export function roomMetrics(room) {
  const objects = Array.isArray(room?.objects) ? room.objects.length : 0;
  const movables = Array.isArray(room?.movables) ? room.movables.length : 0;
  const zones = Array.isArray(room?.zones) ? room.zones.length : 0;
  return {
    name: typeof room?.name === 'string' && room.name ? room.name : '未命名房间',
    cols: Number.isSafeInteger(room?.cols) ? room.cols : 0,
    rows: Number.isSafeInteger(room?.rows) ? room.rows : 0,
    objects,
    mechanisms: objects + movables + zones,
  };
}
function emptyCounts() {
  return { added: 0, modified: 0, deleted: 0, layout: 0, unchanged: 0, total: 0 };
}
function record(room, status, previousName) {
  return { id: String(room.id ?? ''), status, ...roomMetrics(room), ...(previousName ? { previousName } : {}) };
}
// parent === null means a root revision (first save). A missing/unverifiable parent is `undefined`
// plus an explicit reason, so callers can show “无法比较” instead of pretending nothing changed.
export function compareProjects(current, parent, reason = 'missing-parent') {
  const currentRooms = projectRooms(current);
  if (parent === null) {
    return {
      status: 'first-save', reason: 'root', rooms: currentRooms.map(room => record(room, 'first-save')),
      changes: [], counts: emptyCounts(),
    };
  }
  if (parent === undefined) {
    return {
      status: 'unavailable', reason, rooms: currentRooms.map(room => record(room, 'unknown')),
      changes: [], counts: emptyCounts(),
    };
  }
  const parentRooms = projectRooms(parent), parentById = new Map(), currentById = new Map();
  for (const room of parentRooms) if (!parentById.has(room.id)) parentById.set(room.id, room);
  for (const room of currentRooms) if (!currentById.has(room.id)) currentById.set(room.id, room);
  const counts = emptyCounts(), rooms = [], changes = [];
  for (const room of currentRooms) {
    const before = parentById.get(room.id);
    let status = 'added';
    if (before) {
      const contentChanged = roomContent(room) !== roomContent(before);
      const layoutChanged = stableStringify(room.graph) !== stableStringify(before.graph);
      status = contentChanged ? 'modified' : layoutChanged ? 'layout' : 'unchanged';
    }
    const item = record(room, status, before && before.name !== room.name ? before.name : undefined);
    rooms.push(item);
    if (status !== 'unchanged') {changes.push(item); counts[status]++;}
    else counts.unchanged++;
    counts.total++;
  }
  for (const room of parentRooms) {
    if (currentById.has(room.id)) continue;
    const item = record(room, 'deleted');
    rooms.push(item); changes.push(item); counts.deleted++; counts.total++;
  }
  return { status: 'comparable', reason: 'parent', rooms, changes, counts };
}
