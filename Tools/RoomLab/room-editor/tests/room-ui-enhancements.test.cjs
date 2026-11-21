'use strict';
// Focused, non-GUI checks for the room-first UI enhancements:
// 1. group order is independent of project order and reversible (drag-to-reorder),
// 2. dragging a card onto a group tab assigns through the same pure store,
// 3. the thumbnail-strip resize preference is clamped and never project data,
// 4. organisation/order changes survive JSON save/load (compatibility).
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/project/model.cjs'),
  Org = require('../src/project/room-organization.cjs'),
  Nav = require('../src/editor/room-navigation.cjs');

function fixture() {
  const project = M.migrate(M.themedExample());
  return {
    project,
    ids: project.courses.flatMap((course) => course.rooms.map((room) => room.id)),
  };
}

test('a group keeps its own card order, independent of project order', () => {
  const { project, ids } = fixture(),
    [a, b, c] = ids;
  let org = Org.createGroup(Org.empty(), '节奏', [c, a, b]);
  project.roomOrganization = org;
  assert.deepEqual(Org.filterRoomIds(project, 'group:group-1'), [c, a, b]);
  // The project arrays are untouched by display order.
  assert.deepEqual(
    project.courses.flatMap((course) => course.rooms.map((room) => room.id)),
    ids,
  );
  // Reordering inside the group is pure and can be undone by moving back.
  const moved = Org.moveWithinGroup(org, 'group-1', c, b, true);
  assert.deepEqual(Org.groupOf(moved, 'group-1').roomIds, [a, b, c]);
  assert.deepEqual(Org.groupOf(org, 'group-1').roomIds, [c, a, b], 'input value not mutated');
  const back = Org.moveWithinGroup(moved, 'group-1', c, a, false);
  assert.deepEqual(Org.groupOf(back, 'group-1').roomIds, [c, a, b]);
  // Invalid targets/rooms are a safe no-op instead of raising.
  assert.deepEqual(Org.moveWithinGroup(org, 'group-1', a, 'missing', true), org);
  assert.deepEqual(Org.moveWithinGroup(org, 'missing', a, b, true), org);
  assert.deepEqual(Org.moveWithinGroup(org, 'group-1', a, a, true), org);
});

test('room page group reorder writes only roomOrganization', () => {
  const { project, ids } = fixture(),
    [a, b, c] = ids;
  project.roomOrganization = Org.createGroup(Org.empty(), '节奏', [a, b, c]);
  const coursesBefore = JSON.stringify(project.courses);
  Nav.moveInGroup(project, 'group-1', c, a, false);
  assert.deepEqual(Org.filterRoomIds(project, 'group:group-1'), [c, a, b]);
  assert.equal(JSON.stringify(project.courses), coursesBefore, 'project room arrays unchanged');
  assert.deepEqual(project.roomOrganization.groups[0].roomIds, [c, a, b]);
});

test('assigning a dragged card to a group is idempotent and additive', () => {
  const { project, ids } = fixture(),
    [a, b] = ids;
  let org = Org.createGroup(Org.empty(), '目标', [a]);
  org = Org.assign(org, 'group-1', [b]);
  org = Org.assign(org, 'group-1', [b]);
  assert.deepEqual(Org.groupOf(org, 'group-1').roomIds, [a, b], 'no duplicate on re-drop');
  // A second group can take the same room; assignment never removes it elsewhere.
  org = Org.createGroup(org, '另一组', [b]);
  assert.deepEqual(Org.groupsContaining(org, b).map((group) => group.name), ['目标', '另一组']);
});

test('strip resize preference is clamped, persisted and never project data', () => {
  const { project } = fixture(),
    before = JSON.stringify(project),
    store = new Map();
  global.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  try {
    assert.equal(Nav.clampStripHeight(10), Nav.MIN_STRIP_HEIGHT);
    assert.equal(Nav.clampStripHeight(9999), Nav.MAX_STRIP_HEIGHT);
    assert.equal(Nav.clampStripHeight('168'), 168);
    assert.equal(Nav.clampStripHeight('nope'), null);
    const app = { state: {} };
    assert.equal(Nav.stripHeight(app), null, 'auto height by default');
    assert.equal(Nav.persistStripHeight(app, 180), 180);
    assert.equal(store.get(Nav.STRIP_HEIGHT_KEY), '180');
    const reloaded = { state: {} };
    assert.equal(Nav.stripHeight(reloaded), 180, 'preference survives a reload');
    assert.equal(Nav.persistStripHeight(app, null), null);
    assert.equal(store.has(Nav.STRIP_HEIGHT_KEY), false, 'reset removes the key');
    assert.equal(JSON.stringify(project), before, 'resizing never edits the project');
  } finally {
    delete global.localStorage;
  }
});

test('group order and membership survive JSON save/load migration', () => {
  const { project, ids } = fixture(),
    [a, b, c] = ids;
  project.roomOrganization = Org.createGroup(Org.empty(), '跨大关节奏', [c, a, b]);
  const restored = M.migrate(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(Org.groupOf(restored.roomOrganization, 'group-1').roomIds, [c, a, b]);
  assert.deepEqual(Org.filterRoomIds(restored, 'group:group-1'), [c, a, b]);
  // Unknown fields and older files without organisation stay compatible.
  project.extensionField = { keep: true };
  const extended = M.migrate(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(extended.extensionField, { keep: true });
  const legacy = JSON.parse(JSON.stringify(project));
  delete legacy.roomOrganization;
  assert.equal(M.migrate(legacy).roomOrganization, undefined);
  assert.deepEqual(Org.filterRoomIds(M.migrate(legacy), 'group:group-1'), []);
});
