'use strict';
// Project-global block defaults are the base; legacy course.blockDefaults stay
// readable as an inherited override and are never written back by global edits.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  Registry = require('../src/plugins/registry.cjs');

test('global default params apply to new instances in every course', () => {
  const p = M.example();
  p.blockDefaults = { 'slacker.teacher': { name: '全局老师', params: { speed: 9 } } };
  const course = p.courses[0];
  const o = Registry.instantiate(p, 'slacker.teacher', 't-global', 2, 2, course);
  assert.equal(o.name, '全局老师');
  assert.equal(o.params.speed, 9);
});

test('legacy course defaults still inherit over global without migration', () => {
  const p = M.example();
  p.blockDefaults = { 'slacker.teacher': { params: { speed: 9, patrolMinX: 1 } } };
  const course = p.courses[0];
  course.blockDefaults = { 'slacker.teacher': { params: { speed: 4 } } };
  const o = Registry.instantiate(p, 'slacker.teacher', 't-legacy', 2, 2, course);
  assert.equal(o.params.speed, 4);
  assert.equal(o.params.patrolMinX, 1);
  assert.deepEqual(course.blockDefaults['slacker.teacher'].params, { speed: 4 });
});

test('global default assets seed new instances and leave legacy objects alone', () => {
  const p = M.example();
  p.blockDefaults = { 'slacker.teacher': { assets: { idle: 'asset-global' } } };
  const course = p.courses[0];
  course.blockDefaults = { 'slacker.teacher': { assets: { idle: 'asset-legacy' } } };
  const o = Registry.instantiate(p, 'slacker.teacher', 't-assets', 2, 2, course);
  assert.equal(o.assetOverrides.idle, 'asset-legacy');
  assert.deepEqual(course.blockDefaults['slacker.teacher'].assets, { idle: 'asset-legacy' });
});
