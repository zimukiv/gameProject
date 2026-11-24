'use strict';
// Unified port deletion: a deleted entry/exit must drop every wire attached to
// it from BOTH the project-level map store and the legacy course store, so
// M.validate never reports a dangling edge afterwards. Undo restores them.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/project/model.cjs'),
  MapCompat = require('../src/project/map-compat.cjs'),
  { History } = require('../src/editor/history.cjs');

function fixture() {
  const p = M.themedExample();
  // Cross-course explicit edge (project.map) + a legacy course wire on the same
  // exit: the map edge shadows the legacy one, so deleting the exit must remove
  // both stores instead of letting the old wire reappear as a dangling edge.
  MapCompat.connect(
    p,
    { roomId: 'jet-room', exitId: 'jet-exit' },
    { roomId: 'slacker-room', entryId: 'slacker-room-entry' },
  );
  MapCompat.connect(
    p,
    { roomId: 'calculus-room', exitId: 'calculus-room-exit' },
    { roomId: 'jet-room', entryId: 'jet-room-entry' },
  );
  return p;
}

test('forgetPort removes both stores and leaves no dangling edge', () => {
  const p = fixture(),
    links = MapCompat.portLinks(p, 'jet-exit');
  assert.equal(links.length, 2, 'map edge + shadowed legacy wire are both linked');
  assert.equal(links.filter((w) => w.store === 'map').length, 1);
  assert.equal(links.filter((w) => w.store === 'course').length, 1);
  assert.deepEqual(M.validate(p).errors, []);

  const removed = MapCompat.forgetPort(p, 'jet-exit');
  assert.equal(removed, 2);
  assert.deepEqual(MapCompat.portLinks(p, 'jet-exit'), []);
  const errors = M.validate(p).errors;
  assert.deepEqual(errors, [], 'no dangling wire after deleting the exit port');
  assert.equal(
    MapCompat.connections(p).some((edge) => edge.from.exitId === 'jet-exit'),
    false,
  );
});

test('forgetPort on an entry removes incoming cross-room edges too', () => {
  const p = fixture();
  assert.equal(MapCompat.forgetPort(p, 'jet-room-entry'), 1);
  assert.deepEqual(M.validate(p).errors, []);
  assert.equal(
    MapCompat.connections(p).some((edge) => edge.to.entryId === 'jet-room-entry'),
    false,
  );
});

test('batch forgetPorts cleans every selected port from both stores', () => {
  const p = fixture(),
    ids = ['calculus-room-exit', 'slacker-room-entry', 'jet-room-entry'];
  const before = MapCompat.portLinks(p, ids);
  assert.ok(before.length >= 2);
  assert.ok(
    before.some((wire) => wire.store === 'map'),
    'project-level edge is included',
  );
  assert.equal(MapCompat.forgetPorts(p, ids), before.length);
  assert.deepEqual(MapCompat.portLinks(p, ids), []);
  assert.deepEqual(M.validate(p).errors, []);
});

test('delete + undo restores the wires and validates again', () => {
  const p = fixture(),
    history = new History(),
    before = M.clone(p);
  MapCompat.forgetPort(p, 'jet-exit');
  assert.deepEqual(M.validate(p).errors, []);
  assert.ok(history.commit(before, p), 'the delete is a real change');
  const restored = history.undo(p);
  assert.ok(restored, 'undo returns the pre-delete snapshot');
  assert.equal(MapCompat.portLinks(restored, 'jet-exit').length, 2);
  assert.deepEqual(M.validate(restored).errors, []);
});

test('port deletion keeps unrelated wires and entry protection intact', () => {
  const p = M.example();
  // The only entry of jet-room must stay: the UI refuses, the model has no
  // transport rule, so this asserts unrelated wires survive a delete.
  MapCompat.connect(
    p,
    { roomId: 'ice-room', exitId: 'ice-exit' },
    { roomId: 'rail-room', entryId: 'rail-room-entry' },
  );
  const kept = MapCompat.connections(p).filter((edge) => edge.to.entryId !== 'rail-room-entry');
  assert.ok(kept.length > 0, 'the example ships unrelated wires');
  MapCompat.forgetPort(p, 'rail-room-entry');
  assert.deepEqual(MapCompat.portLinks(p, 'rail-room-entry'), []);
  assert.deepEqual(M.validate(p).errors, []);
  assert.deepEqual(MapCompat.connections(p), kept, 'unrelated wires survive');
});
