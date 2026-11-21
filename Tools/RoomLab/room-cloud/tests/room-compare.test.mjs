import test from 'node:test';
import assert from 'node:assert/strict';
import { compareProjects, projectRooms, stableStringify } from '../lib/room-compare.mjs';
const room = (id, name, extra = {}) => ({ id, name, cols: 30, rows: 17, graph: { x: 0, y: 0 }, objects: [], movables: [], zones: [], ...extra });
const project = (...rooms) => ({ name: '测试项目', courses: [{ id: 'c1', name: '旧大关', rooms }] });
const byId = result => new Map(result.rooms.map(r => [r.id, r]));
test('added, modified and deleted rooms are matched by room.id with explicit counts', () => {
  const result = compareProjects(
    project(room('new', '新增房间'), room('keep', '同名旧'), room('change', '改尺寸', { cols: 40 })),
    project(room('keep', '同名旧'), room('change', '改尺寸'), room('gone', '被删除')),
  );
  assert.equal(result.status, 'comparable');
  assert.deepEqual(result.counts, { added: 1, modified: 1, deleted: 1, layout: 0, unchanged: 1, total: 4 });
  assert.equal(byId(result).get('new').status, 'added');
  assert.equal(byId(result).get('change').status, 'modified');
  assert.equal(byId(result).get('gone').status, 'deleted');
  assert.deepEqual(result.changes.map(r => r.id), ['new', 'change', 'gone']);
});
test('same room name with different ids is an addition and a deletion, not an edit', () => {
  const result = compareProjects(project(room('new-id', '同名房间')), project(room('old-id', '同名房间')));
  assert.equal(byId(result).get('new-id').status, 'added');
  assert.equal(byId(result).get('old-id').status, 'deleted');
  assert.equal(result.counts.modified, 0);
});
test('comparison ignores object key insertion order', () => {
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] }), stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }));
  const result = compareProjects(
    project({ id: 'a', name: 'A', cols: 30, rows: 17, graph: { x: 1, y: 2 }, objects: [{ id: 'o', type: 'coin', x: 1 }] }),
    project({ objects: [{ x: 1, type: 'coin', id: 'o' }], graph: { y: 2, x: 1 }, rows: 17, cols: 30, name: 'A', id: 'a' }),
  );
  assert.equal(result.counts.unchanged, 1);
  assert.equal(result.counts.modified, 0);
});
test('root versions are a first save, never a fabricated list of additions', () => {
  const result = compareProjects(project(room('a', 'A'), room('b', 'B')), null);
  assert.equal(result.status, 'first-save');
  assert.equal(result.counts.added, 0);
  assert.equal(result.changes.length, 0);
  assert.ok(result.rooms.every(r => r.status === 'first-save'));
});
test('a missing or unverifiable parent is unavailable and never all-unchanged', () => {
  const result = compareProjects(project(room('a', 'A')), undefined, 'verify-failed');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'verify-failed');
  assert.equal(result.counts.unchanged, 0);
  assert.equal(result.changes.length, 0);
  assert.ok(result.rooms.every(r => r.status === 'unknown'));
});
test('graph-position-only edits are an explicit layout change, not unchanged', () => {
  const result = compareProjects(project(room('a', 'A', { graph: { x: 90, y: 0 } })), project(room('a', 'A')));
  assert.equal(byId(result).get('a').status, 'layout');
  assert.equal(result.counts.layout, 1);
  assert.equal(result.counts.unchanged, 0);
  assert.equal(result.changes[0].status, 'layout');
});
test('rooms renamed while ids stay stable are modifications and keep the previous name', () => {
  const result = compareProjects(project(room('a', '新名字')), project(room('a', '旧名字')));
  assert.equal(byId(result).get('a').status, 'modified');
  assert.equal(byId(result).get('a').previousName, '旧名字');
});
test('empty room projects compare safely in both directions', () => {
  assert.deepEqual(compareProjects(project(), project()).counts, { added: 0, modified: 0, deleted: 0, layout: 0, unchanged: 0, total: 0 });
  const removed = compareProjects(project(), project(room('a', 'A')));
  assert.equal(removed.rooms.length, 1);
  assert.equal(removed.rooms[0].status, 'deleted');
  assert.equal(projectRooms({ courses: [] }).length, 0);
});
