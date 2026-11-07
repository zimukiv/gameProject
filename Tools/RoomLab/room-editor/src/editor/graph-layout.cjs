'use strict';
// One geometry source for drawing, hit testing, fit-to-all and port projection.
const CELL_SIZE = 10.5,
  PADDING = 8,
  TITLE_HEIGHT = 32;
function card(room) {
  const thumb = {
    x: PADDING,
    y: TITLE_HEIGHT,
    width: room.cols * CELL_SIZE,
    height: room.rows * CELL_SIZE,
  };
  return {
    width: thumb.width + PADDING * 2,
    height: thumb.y + thumb.height + 7 + 48 + PADDING,
    titleHeight: TITLE_HEIGHT,
    thumb,
    notesY: thumb.y + thumb.height + 7,
  };
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
module.exports = { CELL_SIZE, PADDING, TITLE_HEIGHT, card, overlaps, arrange, vacant, bounds, fit };
