'use strict';
// Route-board marquee and multi-room drag geometry. The pure helpers used by the
// canvas are exercised directly: rectangle intersection selection and one-delta
// movement that keeps every relative offset (including across course offsets).
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  Layout = require('../src/editor/graph-layout.cjs');

function board() {
  const project = M.themedExample(),
    physics = project.courses[0],
    calculus = project.courses[1],
    offsets = Object.fromEntries(
      project.courses.map((course, index) => [
        course.id,
        index === 1 ? { x: 1400, y: 120 } : { x: index * 2800, y: 0 },
      ]),
    ),
    places = Layout.placements(project, offsets, physics.id);
  return { project, physics, calculus, offsets, places };
}

test('left-drag rectangle selects every intersecting room and ignores the rest', () => {
  const { places } = board(),
    first = places[0],
    second = places[1],
    from = { x: first.x + 2, y: first.y + 2 },
    to = { x: second.x + second.width - 2, y: second.y + second.height - 2 },
    selected = Layout.placesInRect(places, from, to);
  assert.deepEqual(
    selected.map((place) => place.room.id),
    [first.room.id, second.room.id],
  );
  // A rectangle that only touches the empty gap between rooms selects nothing.
  const gapFrom = { x: first.x + first.width + 2, y: first.y },
    gapTo = { x: second.x - 2, y: second.y + 2 };
  assert.equal(
    Layout.placesInRect(places, gapFrom, gapTo).some(
      (place) => place.room.id === first.room.id || place.room.id === second.room.id,
    ),
    false,
  );
  // Reversed drag direction is normalised.
  assert.deepEqual(
    Layout.placesInRect(places, to, from).map((place) => place.room.id),
    selected.map((place) => place.room.id),
  );
});

test('one snapped delta moves a cross-course selection without changing relative positions', () => {
  const { places, offsets } = board(),
    physicsRoom = places.find((place) => place.courseId === places[0].courseId),
    calculusRoom = places.find((place) => place.courseId !== places[0].courseId),
    entries = [physicsRoom, calculusRoom],
    ids = entries.map((entry) => entry.room.id),
    before = entries.map((entry) => ({
      x: entry.x,
      y: entry.y,
      local: { x: entry.room.graph.x, y: entry.room.graph.y },
    })),
    snapped = Layout.selectionDelta(entries, ids, 13, -7, true, physicsRoom.room.id),
    moved = Layout.movePlaces(entries, snapped.x, snapped.y);
  assert.equal(moved.length, 2);
  for (const [index, item] of moved.entries()) {
    const entry = entries[index];
    // Every member moves by exactly the same global delta.
    assert.equal(item.graph.x - before[index].local.x, snapped.x);
    assert.equal(item.graph.y - before[index].local.y, snapped.y);
    // Authored coordinates stay in the owner course's space.
    assert.equal(item.graph.x + offsets[entry.courseId].x, entry.x + snapped.x);
    assert.equal(item.graph.y + offsets[entry.courseId].y, entry.y + snapped.y);
  }
  // Snapping is applied once to the primary room, not per room.
  assert.equal(Layout.snap(physicsRoom.x + 13, true), physicsRoom.x + snapped.x);
  // Relative offsets between the two rooms are untouched.
  assert.equal(
    moved[1].graph.x + offsets[calculusRoom.courseId].x -
      (moved[0].graph.x + offsets[physicsRoom.courseId].x),
    calculusRoom.x - physicsRoom.x,
  );
});

test('snap can be disabled for free placement and unchanged rooms stay put', () => {
  const { places } = board(),
    entry = places[0],
    delta = Layout.selectionDelta([entry], [entry.room.id], 3.25, 4.5, false, entry.room.id);
  assert.deepEqual(delta, { x: 3.25, y: 4.5 });
  const moved = Layout.movePlaces([entry], delta.x, delta.y)[0];
  assert.equal(moved.graph.x, entry.x + 3.25 - entry.offset.x);
  assert.equal(moved.graph.y, entry.y + 4.5 - entry.offset.y);
  assert.deepEqual(
    Layout.movePlaces([], 10, 10),
    [],
  );
});
