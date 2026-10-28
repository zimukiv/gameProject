'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  C = require('../src/project/play-camera.cjs'),
  D = require('../src/editor/draw.cjs'),
  M = require('../src/project/model.cjs');
test('legacy rooms retain the exact full-room view and camera never mutates source', () => {
  const r = { cols: 80, rows: 17 },
    before = JSON.stringify(r),
    old = D.fit(r, 1200, 700),
    v = C.view(r, { x: 1000, y: 300, w: 24, h: 28 }, 1200, 700);
  for (const k of ['x', 'y', 'scale']) assert.ok(Math.abs(v[k] - old[k]) < 1e-9);
  assert.equal(JSON.stringify(r), before);
});
test('follow view clamps to room boundaries, follows player, and adapts to window ratio', () => {
  const r = { cols: 80, rows: 40, playCamera: { mode: 'follow', cols: 20, rows: 12 } },
    a = C.view(r, { x: 0, y: 0, w: 24, h: 28 }, 1000, 600),
    b = C.view(r, { x: 1800, y: 800, w: 24, h: 28 }, 1000, 600),
    end = C.view(r, { x: 2550, y: 1270, w: 24, h: 28 }, 1000, 600);
  assert.equal(a.x, 22);
  assert.equal(a.y, 22);
  assert.ok(b.x < a.x && b.y < a.y);
  assert.ok(Math.abs(end.x + 80 * 32 * end.scale - 978) < 1e-8);
  assert.ok(Math.abs(end.y + 40 * 32 * end.scale - 578) < 1e-8);
  const resized = C.view(r, { x: 1800, y: 800, w: 24, h: 28 }, 600, 900);
  assert.ok(resized.cols >= 20 && resized.rows >= 12);
  assert.notEqual(resized.scale, a.scale);
  const small = { cols: 6, rows: 5, playCamera: r.playCamera },
    s = C.view(small, { x: 1, y: 1 }, 1000, 600),
    fit = D.fit(small, 1000, 600);
  assert.ok(Math.abs(s.scale - fit.scale) < 1e-8);
});
test('camera settings validate and survive room copy, ZIP export and import', () => {
  assert.ok(C.errors({ mode: 'follow', cols: 0, rows: 12 }).length);
  assert.ok(C.errors({ mode: 'follow', cols: Infinity, rows: 12 }).length);
  const bad = M.example();
  bad.courses[0].rooms[0].playCamera = { mode: 'follow', cols: 0, rows: 10 };
  assert.ok(M.validate(bad).errors.some((e) => e.includes('试玩视野')));
  const p = M.example();
  p.courses[0].rooms[0].playCamera = { mode: 'follow', cols: 18.5, rows: 10 };
  const camera = p.courses[0].rooms[0].playCamera;
  assert.deepEqual(M.duplicateRoom(p.courses[0], 'jet-room').playCamera, camera);
  const A = require('../src/project/archive.cjs'),
    single = require('../src/project/room-export.cjs').standalone(p, 'physics', 'jet-room'),
    loaded = A.unpack(A.pack(single, new Map()));
  assert.deepEqual(loaded.project.courses[0].rooms[0].playCamera, camera);
  const imported = require('../src/project/room-import.cjs').prepare(
    p,
    new Map(),
    loaded.project,
    loaded.files,
    'physics',
    'physics',
    'jet-room',
  );
  assert.deepEqual(imported.project.courses[0].rooms[3].playCamera, camera);
});
