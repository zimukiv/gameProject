'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Nav = require('../src/editor/room-navigation.cjs');
const Guide = require('../src/editor/block-guide.cjs');
function fixture() {
  return {
    courses: [
      {
        id: 'p',
        name: '物理',
        rooms: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
      { id: 'c', name: '高数', rooms: [{ id: 'd', name: 'D' }] },
    ],
    roomOrganization: {
      version: 1,
      favorites: [],
      groups: [{ id: 'g', name: '跨主题', roomIds: ['d', 'a'] }],
    },
  };
}
test('room navigation uses groups across owners and supports explicit all scope', () => {
  const p = fixture();
  assert.deepEqual(
    Nav.context(p, 'a').rooms.map((x) => x.room.id),
    ['d', 'a'],
  );
  assert.equal(Nav.context(p, 'b').rooms.length, 3);
  assert.equal(Nav.context(p, 'a', { roomGroupId: null }).rooms.length, 3);
  assert.equal(Nav.context(p, 'a', { roomGroupId: 'deleted' }).group.id, 'g');
  let result;
  Nav.navigate({ store: { project: p }, go: (...args) => (result = args) }, 'd', 'g');
  assert.deepEqual(result, ['room', { courseId: 'c', roomId: 'd', roomGroupId: 'g' }]);
});
test('group reorder changes metadata only, preserving original room ownership and starts', () => {
  const p = fixture(),
    original = JSON.stringify(p.courses);
  Nav.moveInGroup(p, 'g', 'a', 'd', false);
  assert.deepEqual(p.roomOrganization.groups[0].roomIds, ['a', 'd']);
  assert.equal(JSON.stringify(p.courses), original);
  Nav.moveInGroup(p, 'g', 'd', 'a', false);
  assert.deepEqual(p.roomOrganization.groups[0].roomIds, ['d', 'a']);
});
test('guide covers every visible palette definition without hidden aliases', () => {
  const entries = Guide.entries('physics');
  assert.equal(
    entries.some((x) => x.type === 'common.aiStartHollow'),
    false,
  );
  for (const item of entries) assert.ok(item.description.length > 5);
  assert.equal(entries.find((x) => x.type === 'calculus.integral').requiresItem, 'item.calculator');
});
test('room page shows a thumbnail selector bar instead of text tabs/dropdowns', () => {
  const p = fixture();
  p.roomOrganization.favorites = ['a'];
  const app = {
    store: { project: p },
    state: { roomId: 'a', roomFilter: 'all', courseId: 'p' },
  };
  const strip = Nav.strip(app);
  assert.match(strip, /class="room-thumb-selector"/);
  assert.equal((strip.match(/data-nav-room=/g) || []).length, 3);
  assert.match(strip, /class="room-thumb-card active[^"]*" data-nav-room="a"/);
  assert.equal(strip.includes('<select'), false, 'no room dropdown');
  assert.equal(strip.includes('room-tabs'), false, 'no text tab list');
  // The same organisation filters as the home page drive the bar.
  assert.match(strip, /data-room-filter="all"/);
  assert.match(strip, /data-room-filter="favorites"/);
  assert.match(strip, /data-room-filter="group:g"/);
  // Filtering by a group shows only that group, regardless of owner container.
  const grouped = Nav.strip({ ...app, state: { ...app.state, roomFilter: 'group:g' } });
  assert.equal((grouped.match(/data-nav-room=/g) || []).length, 2);
  assert.match(grouped, /data-nav-room="d"/);
  // Top bar: project / current custom group / room name, all plain labels.
  const crumb = Nav.breadcrumbs(app);
  assert.ok(crumb.includes('项目'));
  assert.ok(crumb.includes('跨主题'), 'the owning user group replaces the course name');
  assert.ok(crumb.includes('A'));
  assert.equal(crumb.includes('<select'), false);
  assert.equal(Nav.ownerLabel(app), '跨主题');
  // An ungrouped room reads 未分组 and its label returns to the all-rooms view.
  const ungrouped = { ...app, state: { ...app.state, roomId: 'b' } };
  assert.equal(Nav.ownerLabel(ungrouped), Nav.UNGROUPED);
  assert.equal(Nav.filterForRoom(ungrouped, 'b'), 'all');
  assert.equal(Nav.filterForRoom(app, 'a'), 'group:g');
  const ungroupedCrumb = Nav.breadcrumbs(ungrouped);
  assert.ok(ungroupedCrumb.includes(Nav.UNGROUPED));
  assert.equal(ungroupedCrumb.includes('物理'), false);
  // The thumbnail footer shows grouping, not the legacy course container.
  assert.ok(strip.includes('>跨主题<'));
  assert.ok(strip.includes('>未分组<'));
});
