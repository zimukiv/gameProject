'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs');
test('room dimensions accept 256 square while rejecting fractional or larger dimensions', () => {
  const p = M.example();
  p.courses[0].rooms[0].cols = 256;
  p.courses[0].rooms[0].rows = 256;
  assert.deepEqual(M.validate(p).errors, []);
  p.courses[0].rooms[0].cols = 257;
  assert.ok(M.validate(p).errors.some((e) => e.includes('尺寸')));
  p.courses[0].rooms[0].cols = 255.5;
  assert.ok(M.validate(p).errors.some((e) => e.includes('尺寸')));
});
