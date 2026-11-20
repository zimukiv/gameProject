'use strict';
// A typing burst collapses into one undo step. Undo/redo/clear must end that
// burst: editing the same field again right after Ctrl+Z (inside the 900ms merge
// window) has to be its own history step, otherwise the restored value is lost.
const test = require('node:test'),
  assert = require('node:assert/strict');
const { History } = require('../src/editor/history.cjs');

test('an edit inside the merge window after undo is a new undo step', () => {
  const h = new History();
  h.commit({ v: 0 }, { v: 1 }, { key: 'room.width' });
  h.commit({ v: 1 }, { v: 2 }, { key: 'room.width' });
  assert.equal(h.past.length, 1, 'the burst stayed one step');
  const undone = h.undo({ v: 2 });
  assert.deepEqual(undone, { v: 0 });
  // Same field, same merge key, well inside 900ms.
  h.commit(undone, { v: 5 }, { key: 'room.width' });
  assert.equal(h.past.length, 1, 'the new edit pushed its own snapshot');
  assert.deepEqual(h.undo({ v: 5 }), { v: 0 }, 'undo restores the pre-edit value');
});

test('redo also ends the merge run', () => {
  const h = new History();
  h.commit({ v: 0 }, { v: 1 }, { key: 'room.width' });
  h.undo({ v: 1 });
  const redone = h.redo({ v: 0 });
  assert.deepEqual(redone, { v: 1 });
  const stepsAfterRedo = h.past.length;
  h.commit(redone, { v: 9 }, { key: 'room.width' });
  assert.equal(h.past.length, stepsAfterRedo + 1, 'the post-redo edit was not merged away');
  assert.deepEqual(h.undo({ v: 9 }), { v: 1 });
});

test('clear resets the merge run', () => {
  const h = new History();
  h.commit({ v: 0 }, { v: 1 }, { key: 'room.width' });
  h.clear();
  h.commit({ v: 1 }, { v: 2 }, { key: 'room.width' });
  assert.equal(h.past.length, 1, 'clear dropped the old run and the new commit was stored');
  assert.equal(h.lastMerge.key, 'room.width');
  h.undo({ v: 2 });
  assert.equal(h.lastMerge, null, 'undo forgets the merge key');
  assert.equal(h.past.length, 0);
});

test('the rapid-burst merge itself is unchanged', () => {
  const h = new History();
  h.commit({ v: 0 }, { v: 1 }, { key: 'room.width' });
  h.commit({ v: 1 }, { v: 2 }, { key: 'room.width' });
  h.commit({ v: 2 }, { v: 3 }, { key: 'room.width' });
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.undo({ v: 3 }), { v: 0 });
});
