'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const Preview = require('../src/project/motion-preview.cjs');
const Motion = require('../src/project/brick-motion.cjs');
function fixture() {
  return {
    tiles: [],
    objects: [
      { id: 'pad', type: 'calculus.integral' },
      { id: 'd', type: 'calculus.derivative', rework: { switch: 's' } },
    ],
    movables: [
      {
        id: 'a',
        padId: 'pad',
        x: 0,
        y: 0,
        motionPath: [
          { x: 4, y: 0, seconds: 2, mode: 'easeIn', movingCollision: false },
          { x: 4, y: 4, seconds: 1, mode: 'linear' },
        ],
      },
      { id: 'b', padId: 'pad', x: 2, y: 2, targetX: 3, targetY: 2 },
    ],
    nativeCampaign: {
      platforms: [{ id: 'native', x: 1, y: 1, toX: 5, toY: 1, seconds: 2, switch: 's' }],
    },
  };
}
test('pad selection and rectangle selection collect the same bound routes, including native controls', () => {
  const room = fixture(),
    before = JSON.stringify(room);
  const routes = Preview.collect(room, [{ kind: 'objects', id: 'pad' }]);
  assert.deepEqual(
    routes.map((r) => r.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    Preview.collect(room, [
      { kind: 'movables', id: 'a' },
      { kind: 'movables', id: 'b' },
    ]),
    routes,
  );
  assert.equal(Preview.collect(room, [{ kind: 'objects', id: 'd' }])[0].item.id, 'native');
  assert.deepEqual(
    Preview.stops(routes).map((s) => s[0]),
    [0, 0.45, 2, 3],
  );
  assert.deepEqual(Preview.sample(routes[0], 1), { x: 1, y: 0 });
  assert.deepEqual(Preview.sample(routes[0], 0.5, true), { x: 4, y: 2 });
  assert.deepEqual(Preview.sample(routes[1], 3), { x: 3, y: 2 });
  assert.equal(JSON.stringify(room), before);
});
test('preview follows grouped members and selected attached tiles without mutating coordinates', () => {
  const room = fixture();
  room.movables.forEach((b) => (b.brickGroup = 'g'));
  room.tiles.push({ x: 1, y: 1, attachmentTo: 'a' });
  assert.equal(Preview.collect(room, [{ kind: 'movables', id: 'a' }]).length, 2);
  assert.equal(Preview.collect(room, [{ kind: 'tiles', x: 1, y: 1 }])[0].id, 'a');
});
test('segment collision obeys direction at boundaries, master override and stationary restoration', () => {
  const b = fixture().movables[0],
    state = { pathTime: 1, anim: { kind: 'path', to: 3 } };
  assert.equal(Motion.movingCollision(b, state), false);
  state.pathTime = 2;
  assert.equal(Motion.movingCollision(b, state), true);
  state.anim.to = 0;
  assert.equal(Motion.movingCollision(b, state), false);
  state.pathTime = 2.5;
  assert.equal(Motion.movingCollision(b, state), true);
  b.movingCollision = false;
  assert.equal(Motion.movingCollision(b, state), false);
  state.anim = null;
  assert.equal(Motion.movingCollision(b, state), true);
  b.motionPath = [{ x: 0, y: 0, seconds: 1, mode: 'linear', movingCollision: false }];
  state.pathTime = 0.5;
  state.anim = { kind: 'path', to: 1 };
  assert.equal(Motion.movingCollision(b, state), true);
});
