'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DPR = require('../src/editor/canvas-dpr.cjs');

function fakeCanvas() {
  const calls = [];
  const ctx = { setTransform: (...args) => calls.push(args) };
  return {
    style: {},
    dataset: {},
    getContext: () => ctx,
    calls,
  };
}

test('ratio follows the device pixel density', () => {
  assert.equal(DPR.ratioFor(100, 100, 1), 1);
  assert.equal(DPR.ratioFor(100, 100, 1.5), 1.5);
  assert.equal(DPR.ratioFor(100, 100, 2), 2);
  assert.equal(DPR.ratioFor(100, 100, 4), DPR.MAX_RATIO);
});

test('huge canvases are capped by the pixel budget instead of allocating everything', () => {
  // A canvas whose CSS box already exceeds the budget gets ratio 1: the backing
  // store can never be smaller than the CSS area, but no extra device pixels are
  // allocated (this is what keeps a full-room canvas from exploding in memory).
  assert.equal(DPR.ratioFor(4000, 4000, 2), 1);
  const wide = DPR.ratioFor(2000, 1000, 3);
  assert.ok(wide > 1 && wide < 3);
  assert.ok(2000 * 1000 * wide * wide <= DPR.MAX_PIXELS * 1.0001);
  const small = DPR.ratioFor(300, 160, 2);
  assert.equal(small, 2);
});

test('prepare sizes the backing store at CSS size * ratio and keeps CSS box fixed', () => {
  const canvas = fakeCanvas();
  const box = DPR.prepare(canvas, 320, 180, 2);
  assert.equal(box.width, 320);
  assert.equal(box.height, 180);
  assert.equal(box.ratio, 2);
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 360);
  assert.equal(canvas.style.width, '320px');
  assert.equal(canvas.style.height, '180px');
  assert.equal(canvas.dataset.cssWidth, '320');
  assert.equal(canvas.dataset.dpr, '2');
  assert.deepEqual(canvas.calls.at(-1), [2, 0, 0, 2, 0, 0]);
});

test('pointer coordinates stay in CSS space regardless of the backing store', () => {
  const canvas = fakeCanvas();
  DPR.prepare(canvas, 300, 200, 2);
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 150, height: 100 });
  const p = DPR.pointer(canvas, 85, 70);
  assert.equal(p.x, 150);
  assert.equal(p.y, 100);
});
