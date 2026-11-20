'use strict';
// One geometry source for drawing, hit testing, fit-to-all, port projection and
// the project-wide route map.
//
// Every room is laid out with the same world cell size (CELL_SIZE) so a room's
// map footprint always equals cols×rows; card width is never normalized away.
// The room body is the content thumbnail itself; only a compact label band sits
// above it. Notes and details live in the inspector/tooltip instead of a card.
//
// Authored per-course coordinates stay in room.graph. The global route map adds
// an optional project-level course offset (project.layout.courseOffsets) so all
// courses can be shown at once without rewriting authored coordinates; a room's
// global position is always room.graph + its course offset.
const { theme } = require('../project/themes.cjs');
const CELL_SIZE = 10.5,
  LABEL_HEIGHT = 16,
  GRID_SIZE = CELL_SIZE,
  TITLE_HEIGHT = LABEL_HEIGHT,
  PADDING = 0,
  WORLD_TILE = 32,
  COURSE_GAP = 140;
function card(room) {
  const width = Math.max(1, Number(room?.cols) || 1) * CELL_SIZE,
    height = Math.max(1, Number(room?.rows) || 1) * CELL_SIZE,
    body = { x: 0, y: LABEL_HEIGHT, width, height };
  return {
    width,
    height: LABEL_HEIGHT + height,
    labelHeight: LABEL_HEIGHT,
    body,
    // Kept as an alias: ports and drawing both project through this same thumb.
    thumb: body,
    notesY: body.y + body.height,
  };
}
function inside(room, point) {
  if (!room || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
  const x = Number(room.graph?.x) || 0,
    y = Number(room.graph?.y) || 0,
    box = card(room);
  return point.x > x && point.x < x + box.width && point.y > y && point.y < y + box.height;
}
// Topmost room under a world point: later rooms paint above earlier ones.
function hit(rooms, point) {
  return (
    rooms
      .slice()
      .reverse()
      .find((room) => inside(room, point)) || null
  );
}
// Port positions are projected through the same uniform cell size as the
// thumbnail, so the marker sits on the actual entry/exit cell of the room. The
// label band above the body offsets the thumbnail, exactly like drawing does.
function portAt(room, originX, originY) {
  const body = card(room).body,
    project = (cell) => ({
      roomId: room.id,
      id: cell.id,
      x: originX + body.x + (cell.x + 0.5) * CELL_SIZE,
      y: originY + body.y + (cell.y + (cell.h || 1) / 2) * CELL_SIZE,
      label: cell.name,
    });
  return {
    entries: (room.entries || []).map(project),
    exits: (room.exits || []).map(project),
  };
}
function ports(room, originX, originY) {
  return portAt(
    room,
    Number.isFinite(originX) ? originX : Number(room.graph?.x) || 0,
    Number.isFinite(originY) ? originY : Number(room.graph?.y) || 0,
  );
}
function snap(value, enabled = true, step = GRID_SIZE) {
  return enabled ? Math.round(value / step) * step : value;
}
function snapGraph(room, x, y, enabled = true) {
  return { x: snap(x, enabled), y: snap(y, enabled) };
}
function overlaps(rooms, gap = 16) {
  return rooms.some(
    (a, i) =>
      !Number.isFinite(a.graph?.x) ||
      !Number.isFinite(a.graph?.y) ||
      rooms.slice(i + 1).some((b) => {
        const x = card(a),
          y = card(b);
        return (
          a.graph.x < b.graph.x + y.width + gap &&
          a.graph.x + x.width + gap > b.graph.x &&
          a.graph.y < b.graph.y + y.height + gap &&
          a.graph.y + x.height + gap > b.graph.y
        );
      }),
  );
}
function arrange(course) {
  // Walk connected neighbours in room order, then pack using actual card sizes.
  const seen = new Set(),
    ordered = [],
    byId = new Map(course.rooms.map((r) => [r.id, r]));
  for (const start of course.rooms) {
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      ordered.push(byId.get(id));
      for (const w of course.connections) {
        if (w.from.roomId === id) queue.push(w.to.roomId);
        else if (w.to.roomId === id) queue.push(w.from.roomId);
      }
    }
  }
  const gap = 90,
    sizes = ordered.map(card),
    width = Math.max(
      1,
      ...sizes.map((s) => s.width),
      Math.sqrt(sizes.reduce((a, s) => a + (s.width + gap) * (s.height + gap), 0) * 1.6),
    );
  let x = 0,
    y = 0,
    row = 0;
  const positions = {};
  ordered.forEach((r, i) => {
    const s = sizes[i];
    if (x && x + s.width > width) {
      x = 0;
      y += row + gap;
      row = 0;
    }
    positions[r.id] = { x, y };
    x += s.width + gap;
    row = Math.max(row, s.height);
  });
  return positions;
}
function hasPosition(room) {
  return Number.isFinite(room?.graph?.x) && Number.isFinite(room?.graph?.y);
}
function ensurePositions(rooms) {
  const positions = {},
    placed = rooms.filter(hasPosition).map((room) => ({ ...room, graph: { ...room.graph } }));
  for (const room of rooms.filter((item) => !hasPosition(item))) {
    const graph = vacant(room, placed);
    positions[room.id] = graph;
    placed.push({ ...room, graph: { ...graph } });
  }
  return positions;
}
function vacant(room, rooms) {
  const placed = rooms.map((r) => ({ ...r, graph: { ...r.graph } })),
    size = card(room),
    gap = 70;
  const width = Math.max(
    size.width,
    ...placed.map((r) => card(r).width),
    Math.sqrt(
      placed.reduce(
        (n, r) => {
          const s = card(r);
          return n + (s.width + gap) * (s.height + gap);
        },
        (size.width + gap) * (size.height + gap),
      ) * 1.6,
    ),
  );
  const xs = [0, ...placed.map((r) => r.graph.x + card(r).width + gap)].sort((a, b) => a - b),
    ys = [0, ...placed.map((r) => r.graph.y + card(r).height + gap)].sort((a, b) => a - b);
  for (const y of ys)
    for (const x of xs)
      if (x === 0 || x + size.width <= width) {
        const candidate = { ...room, graph: { x, y } };
        if (!placed.some((r) => overlaps([candidate, r], gap / 2))) return candidate.graph;
      }
  return { x: 0, y: Math.max(0, ...placed.map((r) => r.graph.y + card(r).height)) + gap };
}
function bounds(rooms) {
  const minX = Math.min(0, ...rooms.map((r) => r.graph.x)),
    minY = Math.min(0, ...rooms.map((r) => r.graph.y));
  return {
    minX: rooms.length ? Math.min(...rooms.map((r) => r.graph.x)) : minX,
    minY: rooms.length ? Math.min(...rooms.map((r) => r.graph.y)) : minY,
    maxX: rooms.length ? Math.max(...rooms.map((r) => r.graph.x + card(r).width)) : 1,
    maxY: rooms.length ? Math.max(...rooms.map((r) => r.graph.y + card(r).height)) : 1,
  };
}
function fit(rooms, width, height, scale) {
  const b = bounds(rooms),
    w = b.maxX - b.minX,
    h = b.maxY - b.minY;
  scale = scale ?? Math.min(1.2, (width - 60) / (w + 40), (height - 60) / (h + 40));
  return {
    scale: Math.max(0.001, scale),
    x: width / 2 - (b.minX + w / 2) * scale,
    y: height / 2 - (b.minY + h / 2) * scale,
  };
}

// ---- Project-wide route map -------------------------------------------------
// Global position = authored room.graph + course offset. The offset is derived
// once (first global view) only where course coordinate spaces would overlap,
// and is then persisted, so authored coordinates are never rewritten by layout.
function placeKey(courseId, roomId) {
  return courseId + '/' + roomId;
}
function offsetOf(offsets, course) {
  const value = offsets?.[course?.id];
  return Number.isFinite(value?.x) && Number.isFinite(value?.y)
    ? { x: value.x, y: value.y }
    : { x: 0, y: 0 };
}
function localRect(room) {
  const box = card(room);
  return {
    x: Number(room.graph?.x) || 0,
    y: Number(room.graph?.y) || 0,
    width: box.width,
    height: box.height,
  };
}
function shiftRect(rect, offset) {
  return {
    x: rect.x + offset.x,
    y: rect.y + offset.y,
    width: rect.width,
    height: rect.height,
  };
}
function intersects(a, b, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
function courseBounds(course) {
  const rooms = course?.rooms?.length ? course.rooms : [];
  if (!rooms.length) return null;
  const rects = rooms.map(localRect),
    minX = Math.min(...rects.map((r) => r.x)),
    minY = Math.min(...rects.map((r) => r.y)),
    maxX = Math.max(...rects.map((r) => r.x + r.width)),
    maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
// Derive/persist course offsets. Stored offsets win; missing ones start at 0,0
// and are pushed to the right of everything already placed only when needed.
function ensureOffsets(project) {
  const stored = project?.layout?.courseOffsets || {},
    offsets = {},
    placed = [];
  let changed = false;
  for (const course of project?.courses || []) {
    const box = courseBounds(course),
      saved = stored[course.id];
    let offset;
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) offset = { x: saved.x, y: saved.y };
    else {
      offset = { x: 0, y: 0 };
      if (box && placed.some((rect) => intersects(shiftRect(box, offset), rect, COURSE_GAP / 2)))
        offset = {
          x: Math.max(...placed.map((rect) => rect.x + rect.width)) + COURSE_GAP - box.x,
          y: 0,
        };
      changed = true;
    }
    offsets[course.id] = offset;
    if (box) placed.push(shiftRect(box, offset));
  }
  return { offsets, changed };
}
// One placement per room of every course: x/y are global top-left coordinates.
// `accentOf(room)` lets the caller paint user-group colours on the map exactly
// like the thumbnail bars do; without it the legacy theme colour is kept.
function placements(project, offsets, activeCourseId = null, accentOf = null) {
  const list = [];
  for (const course of project?.courses || []) {
    const offset = offsetOf(offsets, course),
      color = theme(course.kind).color,
      active = course.id === activeCourseId;
    for (const room of course.rooms || []) {
      const box = card(room),
        x = (Number(room.graph?.x) || 0) + offset.x,
        y = (Number(room.graph?.y) || 0) + offset.y;
      list.push({
        key: placeKey(course.id, room.id),
        courseId: course.id,
        course,
        room,
        color: (accentOf && accentOf(room, course)) || color,
        active,
        offset,
        x,
        y,
        width: box.width,
        height: box.height,
        layout: box,
        ports: ports(room, x, y),
      });
    }
  }
  return list;
}
function hitPlace(list, point) {
  for (let i = list.length - 1; i >= 0; i--)
    if (
      point.x > list[i].x &&
      point.x < list[i].x + list[i].width &&
      point.y > list[i].y &&
      point.y < list[i].y + list[i].height
    )
      return list[i];
  return null;
}
function placeBounds(list) {
  if (!list.length) return { x: 0, y: 0, width: 1, height: 1 };
  const minX = Math.min(...list.map((p) => p.x)),
    minY = Math.min(...list.map((p) => p.y)),
    maxX = Math.max(...list.map((p) => p.x + p.width)),
    maxY = Math.max(...list.map((p) => p.y + p.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
function fitPlaces(list, width, height, scale) {
  const b = placeBounds(list);
  scale = scale ?? Math.min(1.2, (width - 60) / (b.width + 40), (height - 60) / (b.height + 40));
  scale = Math.max(0.001, scale);
  return {
    scale,
    x: width / 2 - (b.x + b.width / 2) * scale,
    y: height / 2 - (b.y + b.height / 2) * scale,
  };
}
// Convert a global drag position back into the owner course's authored space.
function toLocal(entry, x, y) {
  return { x: x - entry.offset.x, y: y - entry.offset.y };
}
function locate(project, roomId) {
  for (const course of project?.courses || [])
    for (const room of course.rooms || []) if (room.id === roomId) return { course, room };
  return null;
}
function courseOf(project, courseId) {
  return (project?.courses || []).find((course) => course.id === courseId) || null;
}
// Project wiring is project-wide: a wire joins a port of any room to a port of
// any other room, crossing the legacy course containers (project.map). The
// legacy same-course wires keep working through the same compatibility layer.
function canConnect(project, from, to) {
  if (!from || !to || !from.roomId || !to.roomId) return false;
  const MapCompat = require('../project/map-compat.cjs'),
    a = MapCompat.roomRef(project, from.roomId),
    b = MapCompat.roomRef(project, to.roomId);
  if (!a || !b) return false;
  if (from.exitId && !a.room.exits.some((exit) => exit.id === from.exitId)) return false;
  if (to.entryId && !b.room.entries.some((entry) => entry.id === to.entryId)) return false;
  return true;
}
module.exports = {
  CELL_SIZE,
  LABEL_HEIGHT,
  GRID_SIZE,
  PADDING,
  TITLE_HEIGHT,
  WORLD_TILE,
  COURSE_GAP,
  card,
  inside,
  hit,
  portAt,
  ports,
  snap,
  snapGraph,
  overlaps,
  arrange,
  vacant,
  hasPosition,
  ensurePositions,
  bounds,
  fit,
  placeKey,
  offsetOf,
  localRect,
  courseBounds,
  ensureOffsets,
  placements,
  hitPlace,
  placeBounds,
  fitPlaces,
  toLocal,
  locate,
  courseOf,
  canConnect,
};
