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
        rooms: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
      { id: 'c', rooms: [{ id: 'd', name: 'D' }] },
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
