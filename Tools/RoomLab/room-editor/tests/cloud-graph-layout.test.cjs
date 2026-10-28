'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { layout } = require('../src/editor/cloud-graph-panel.cjs');
test('embedded graph uses mutable display parents, hides deleted aliases, retains immutable source', () => {
  const g = layout({
    branches: [
      { head: 'a', name: 'main' },
      { head: 'b', name: 'removed' },
    ],
    revisions: [
      { id: 'a', parent: null },
      { id: 'b', parent: 'a' },
      { id: 'c', parent: 'b' },
    ],
    graph: {
      metadata: [
        { id: 'b', parentId: 'a', deletedAt: 1 },
        { id: 'c', parentId: 'a' },
      ],
    },
  });
  assert.deepEqual(
    g.nodes.map((n) => n.id),
    ['a', 'c'],
  );
  assert.equal(g.nodes[1].parent, 'a');
  assert.equal(g.nodes[1].sourceParent, 'b');
  assert.ok(Number.isFinite(g.nodes[1].x));
});
test('embedded graph handles unavailable and cyclic source relationships', () => {
  const g = layout({
    revisions: [
      { id: 'a', parent: 'b' },
      { id: 'b', parent: 'a' },
      { id: 'c', parent: 'old' },
    ],
  });
  assert.equal(g.nodes.length, 4);
  assert.ok(g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});
