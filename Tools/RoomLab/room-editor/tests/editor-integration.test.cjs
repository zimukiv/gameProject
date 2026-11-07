'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  G = require('../src/editor/graph-layout.cjs'),
  B = require('../src/project/native-bricks.cjs'),
  { fixture } = require('./helpers/native-fixture.cjs');
test('actual-size graph layout separates varied cards without touching connections or room order', () => {
  const rooms = Array.from({ length: 32 }, (_, i) => ({
    id: String(i),
    cols: i % 3 === 0 ? 180 : 30 + i,
    rows: 15 + (i % 7),
    graph: { x: 0, y: 0 },
  }));
  const course = {
      rooms,
      connections: rooms
        .slice(1)
        .map((r, i) => ({ from: { roomId: String(i) }, to: { roomId: r.id } })),
    },
    before = JSON.stringify(course),
    plan = G.arrange(course);
  assert.equal(JSON.stringify(course), before);
  assert.equal(G.overlaps(rooms), true);
  const placed = rooms.map((r) => ({ ...r, graph: plan[r.id] }));
  assert.equal(G.overlaps(placed), false);
  const next = { id: 'new', cols: 300, rows: 100 };
  next.graph = G.vacant(next, placed);
  assert.equal(G.overlaps([...placed, next]), false);
  const view = G.fit(placed, 1100, 650),
    bounds = G.bounds(placed);
  assert.ok(bounds.minX * view.scale + view.x >= 0 && bounds.maxX * view.scale + view.x <= 1100);
  assert.ok(bounds.minY * view.scale + view.y >= 0 && bounds.maxY * view.scale + view.y <= 650);
});
test('negative-world graph fit centers actual content rather than origin', () => {
  const rooms = [{ id: 'a', cols: 30, rows: 17, graph: { x: -10000, y: -9000 } }];
  const v = G.fit(rooms, 800, 600, 1),
    b = G.bounds(rooms);
  assert.equal(((b.minX + b.maxX) / 2) * v.scale + v.x, 400);
  assert.equal(((b.minY + b.maxY) / 2) * v.scale + v.y, 300);
});
test('native binding shares integral/derivative signals and toggles once per batch', () => {
  const { r } = fixture(),
    p = r.nativeCampaign.platforms[0];
  delete p.signal;
  delete p.switch;
  const integral = { type: 'calculus.integral', rework: { switch: 'alpha', value: true } },
    derivative = { type: 'calculus.derivative', rework: { switch: 'alpha', value: false } };
  B.toggle(r, integral, [p]);
  assert.ok(B.bound(p, integral));
  assert.ok(B.bound(p, derivative));
  assert.equal(derivative.rework.value, false);
  B.toggle(r, derivative, [p]);
  assert.equal(B.bound(p, integral), false);
  const cross = {
    type: 'calculus.integral',
    rework: { signal: 'beta', switch: 'alpha', value: true },
  };
  B.toggle(r, cross, [p]);
  assert.equal(p.signal, 'beta');
  assert.equal(p.switch, undefined);
  const locked = { ...p, locked: true };
  B.toggle(r, cross, [locked]);
  assert.equal(locked.signal, 'beta');
});
test('new controller creates a valid local binding and editing target preserves identity and extras', () => {
  const { r } = fixture(),
    p = r.nativeCampaign.platforms[0],
    pad = { type: 'calculus.derivative' };
  delete p.signal;
  delete p.switch;
  B.toggle(r, pad, [p]);
  assert.ok(r.nativeCampaign.switches.includes(p.switch));
  assert.equal(pad.rework.value, false);
  const id = p.id;
  p.foldOnReturnAfterSwitch = 'alpha';
  B.setTarget(p, { x: 8.1, y: 8.3 }, r);
  assert.equal(p.id, id);
  assert.equal(p.toX, 8);
  assert.equal(p.toY, 8.5);
  assert.equal(p.foldOnReturnAfterSwitch, 'alpha');
  assert.throws(() => B.setTarget(p, { x: r.cols, y: 0 }, r), /越界/);
});
