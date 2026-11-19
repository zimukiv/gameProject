'use strict';
// Focused checks for the global route map: one uniform world cell size for all
// rooms of all courses, additive project-level course offsets that never rewrite
// authored room.graph coordinates, owner-course resolution for manual moves, and
// the guard that keeps wiring inside a single course.
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  G = require('../src/editor/graph-layout.cjs'),
  D = require('../src/editor/draw.cjs');

function starter() {
  return M.themedExample();
}
function graphs(project) {
  return project.courses.map((course) => course.rooms.map((room) => ({ ...room.graph })));
}
function globalRects(places) {
  return places.map((place) => ({
    x: place.x,
    y: place.y,
    width: place.layout.width,
    height: place.layout.height,
  }));
}
function overlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('every room of every course uses the same world cell size', () => {
  const project = starter(),
    rooms = project.courses.flatMap((course) => course.rooms);
  for (const room of rooms) {
    const layout = G.card(room);
    assert.equal(layout.width, room.cols * G.CELL_SIZE);
    assert.equal(layout.height, G.LABEL_HEIGHT + room.rows * G.CELL_SIZE);
    assert.equal(layout.body.width / room.cols, layout.body.height / room.rows);
  }
  const { offsets } = G.ensureOffsets(project),
    places = G.placements(project, offsets);
  assert.equal(places.length, rooms.length, 'the global map shows every room of every course');
  for (const place of places) {
    assert.equal(place.width, place.room.cols * G.CELL_SIZE);
    assert.equal(place.height, G.LABEL_HEIGHT + place.room.rows * G.CELL_SIZE);
    assert.ok(place.width / place.room.cols > 0);
  }
});

test('global placements keep every course visible instead of filtering by active course', () => {
  const project = starter(),
    { offsets } = G.ensureOffsets(project),
    places = G.placements(project, offsets, project.courses[1].id),
    seen = [...new Set(places.map((place) => place.courseId))];
  assert.deepEqual(
    seen,
    project.courses.map((course) => course.id),
  );
  assert.equal(
    places.filter((place) => place.courseId === project.courses[1].id).every((p) => p.active),
    true,
  );
  assert.equal(
    places.filter((place) => place.courseId !== project.courses[1].id).some((p) => p.active),
    false,
  );
});

test('overlapping course spaces get derived offsets without rewriting room.graph', () => {
  const project = starter(),
    before = graphs(project),
    { offsets, changed } = G.ensureOffsets(project);
  assert.equal(changed, true, 'missing project offsets are derived once');
  assert.deepEqual(graphs(project), before, 'authored coordinates must stay untouched');
  assert.equal(offsets[project.courses[0].id].x, 0, 'the first course keeps its authored space');
  assert.ok(
    offsets[project.courses[1].id].x > 0,
    'the overlapping second course is shifted right, not rewritten',
  );
  const rects = globalRects(G.placements(project, offsets));
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      assert.equal(overlap(rects[i], rects[j]), false, `global rooms ${i}/${j} must not overlap`);
  assert.deepEqual(graphs(project), before);
});

test('persisted course offsets win, are idempotent and stay backward compatible', () => {
  const project = starter(),
    second = project.courses[1].id;
  project.layout = { version: 1, courseOffsets: { [second]: { x: 5000, y: -20 } } };
  const first = G.ensureOffsets(project);
  assert.deepEqual(first.offsets[second], { x: 5000, y: -20 }, 'stored offsets are reused');
  assert.equal(first.changed, true, 'courses without stored offsets are derived');
  project.layout.courseOffsets = first.offsets;
  const again = G.ensureOffsets(project);
  assert.equal(again.changed, false);
  assert.deepEqual(again.offsets, first.offsets);

  const saved = JSON.parse(JSON.stringify(project)),
    restored = M.migrate(saved);
  assert.deepEqual(restored.layout, project.layout, 'layout data survives save/load migration');
  const old = JSON.parse(JSON.stringify(project));
  delete old.layout;
  const migrated = M.migrate(old);
  assert.equal(migrated.layout, undefined, 'older projects simply have no layout data');
  const derived = G.ensureOffsets(migrated);
  assert.equal(derived.changed, true, 'offsets are derived again for files without layout data');
  assert.deepEqual(derived.offsets, G.ensureOffsets(starter()).offsets);
  assert.deepEqual(graphs(migrated), graphs(project));
});

test('a manual move writes back to the owner course only and keeps ids and wires', () => {
  const project = starter(),
    { offsets } = G.ensureOffsets(project),
    places = G.placements(project, offsets),
    entry = places.find((place) => place.courseId === project.courses[1].id),
    otherCourse = project.courses[0],
    otherRoomsBefore = JSON.stringify(otherCourse.rooms.map((room) => room.graph)),
    before = { ...entry.room.graph },
    wiresBefore = JSON.stringify(project.courses[1].connections);
  const moved = G.toLocal(entry, entry.x + 105, entry.y + 52.5);
  entry.room.graph = moved;
  assert.equal(moved.x, before.x + 105);
  assert.equal(moved.y, before.y + 52.5);
  assert.equal(G.locate(project, entry.room.id).course.id, project.courses[1].id);
  assert.equal(JSON.stringify(otherCourse.rooms.map((room) => room.graph)), otherRoomsBefore);
  assert.equal(JSON.stringify(project.courses[1].connections), wiresBefore);
  assert.deepEqual(
    G.placements(project, offsets).find((place) => place.key === entry.key).room.graph,
    moved,
  );
});

test('cross-course wiring is guarded and within-course wiring is still allowed', () => {
  const project = starter(),
    first = project.courses[0],
    second = project.courses[1],
    local = { courseId: first.id, roomId: first.rooms[0].id },
    foreign = { courseId: second.id, roomId: second.rooms[0].id };
  assert.equal(G.canConnect(project, local, foreign), false);
  assert.equal(G.canConnect(project, foreign, local), false);
  assert.equal(
    G.canConnect(project, local, { courseId: first.id, roomId: first.rooms[1].id }),
    true,
  );
  assert.equal(G.canConnect(project, local, { courseId: first.id, roomId: 'missing-room' }), false);
  // The existing per-course connection model still connects same-course ports.
  const count = first.connections.length,
    exit = first.rooms[2].exits[0],
    entry = first.rooms[0].entries[0];
  M.connect(first, first.rooms[2].id, exit.id, first.rooms[0].id, entry.id);
  assert.equal(first.connections.length, count + 1);
});

test('hit testing, port markers and fit all use the same placement geometry', () => {
  const project = starter(),
    { offsets } = G.ensureOffsets(project),
    places = G.placements(project, offsets),
    bounds = G.placeBounds(places),
    view = G.fitPlaces(places, 1200, 700, 1);
  assert.equal(view.scale, 1);
  assert.ok(Math.abs(bounds.x + bounds.width / 2 + view.x - 600) < 1e-9);
  assert.ok(Math.abs(bounds.y + bounds.height / 2 + view.y - 350) < 1e-9);
  const fitted = G.fitPlaces(places, 1200, 700);
  assert.ok(fitted.scale > 0);
  const target = places[places.length - 1],
    hit = G.hitPlace(places, {
      x: target.x + target.width / 2,
      y: target.y + target.height - 1,
    });
  assert.equal(hit.key, target.key, 'the topmost room is hit exactly where it is painted');
  const room = target.room,
    body = target.layout.body;
  assert.equal(
    target.ports.entries[0].x,
    target.x + body.x + (room.entries[0].x + 0.5) * G.CELL_SIZE,
  );
  assert.equal(
    target.ports.exits[0].y,
    target.y + body.y + (room.exits[0].y + (room.exits[0].h || 1) / 2) * G.CELL_SIZE,
  );
  // draw.cjs projects the same ports through the shared helper.
  assert.deepEqual(D.graphPorts(room), G.ports(room));
  assert.deepEqual(D.graphPorts(room, target.x, target.y), target.ports);
});
