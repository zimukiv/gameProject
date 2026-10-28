'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  S = require('../src/project/selection.cjs');
test('group moves preserve locked blocks and their rail child positions', () => {
  const r = M.room('r', 'R');
  r.objects = [
    M.object('locked', 'physics.rail', 3, 5, {
      path: [
        { x: 3.5, y: 5 },
        { x: 6.5, y: 5 },
      ],
    }),
    M.object('free', 'common.small', 8, 5),
  ];
  r.objects[0].locked = true;
  const before = JSON.stringify(r.objects[0]);
  S.move(
    r,
    [
      { kind: 'objects', id: 'locked' },
      { kind: 'objects', id: 'free' },
    ],
    2,
    1,
  );
  assert.equal(JSON.stringify(r.objects[0]), before);
  assert.equal(r.objects[1].x, 10);
});
