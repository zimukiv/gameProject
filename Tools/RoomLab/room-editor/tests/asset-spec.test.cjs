'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  Spec = require('../src/assets/spec.cjs'),
  Manager = require('../src/assets/manager.cjs'),
  M = require('../src/project/model.cjs'),
  Draw = require('../src/editor/draw.cjs'),
  { seeds } = require('../src/assets/seeds.cjs');
test('Demo spec constants keep the 32 PPU / 640x360 / 3x / 1920x1080 contract', () => {
  assert.equal(Spec.PPU, 32);
  assert.equal(Spec.TILE, 32);
  assert.deepEqual(Spec.WORLD, { width: 640, height: 360 });
  assert.deepEqual(Spec.SCREEN, { width: 1920, height: 1080 });
  assert.equal(Spec.ZOOM, 3);
  assert.equal(Spec.CAMERA_SIZE, 5.625);
  assert.deepEqual(Spec.PLAYER_PIVOT, { x: 0.5, y: 0.125 });
  assert.equal(Spec.PLAYER_FOOT, 8);
});
test('animation table matches the attached frame/FPS rules', () => {
  const expected = {
    idle: [4, 6],
    run: [6, 10],
    jump: [2, 10],
    fall: [2, 6],
    dash: [2, 14],
    crouch: [2, 10],
    death: [4, 10],
    landdust: [4, 12],
    jumpdust: [3, 12],
  };
  for (const [action, [frames, fps]] of Object.entries(expected)) {
    const info = Spec.animation(action);
    assert.equal(info.frames, frames, action);
    assert.equal(info.fps, fps, action);
  }
  assert.equal(Spec.animation('death').holdLast, true);
  assert.equal(Spec.animation('death').respawnSeconds, 0.9);
  assert.equal(Spec.animation('crouch').frame0Seconds, 0.1);
});
test('canvas sizes and collision hints distinguish pads, check-in and spikes', () => {
  assert.deepEqual(Spec.forType('physics.jet').canvas, { width: 32, height: 8 });
  assert.deepEqual(Spec.forType('common.small').canvas, { width: 10, height: 10 });
  assert.deepEqual(Spec.forType('common.coin').canvas, { width: 18, height: 18 });
  assert.deepEqual(Spec.forType('common.spike').canvas, { width: 32, height: 32 });
  assert.deepEqual(Spec.forType('background').canvas, { width: 512, height: 512 });
  assert.deepEqual(Spec.forType('backgroundMid').canvas, { width: 1920, height: 360 });
  // Check-in artwork stays 32x32 while its bindable collision is the bottom pad.
  assert.deepEqual(Spec.visualSize('slacker.checkin', { width: 32, height: 32 }), {
    width: 32,
    height: 32,
  });
  assert.deepEqual(Spec.collisionShape('slacker.checkin', { collider: 'pad' }), {
    kind: 'rect',
    width: 32,
    height: 8,
    anchor: 'bottom',
  });
  const spike = Spec.collisionShape('common.spike', { collider: false });
  assert.equal(spike.kind, 'circle');
  assert.equal(spike.radius, 11);
  // Runtime plugin definitions are not silently rewritten by the spec.
  assert.equal(Spec.collisionShape('slacker.awake', { collider: 'tile' }).height, 32);
  assert.equal(Spec.collisionShape('common.spike', { collider: 'tile' }).kind, 'circle');
});
test('canonical names infer folders and two-digit frames without rebinding old assets', () => {
  assert.deepEqual(Spec.infer('environment/physics/physics_jet_idle.png'), {
    type: 'physics.jet',
    slot: 'idle',
    category: 'mechanism',
    subcategory: 'physics.jet',
    canonical: 'physics_jet_idle.png',
  });
  assert.equal(Spec.infer('token_small.png').type, 'common.small');
  assert.equal(Spec.infer('bg_far_tile_a.png').type, 'background');
  const framed = Spec.infer('player_run_02.png');
  assert.equal(framed.animation, 'run');
  assert.equal(framed.frame, 2);
  assert.equal(framed.canonical, 'player_run_02.png');
  const atlas = Spec.importFrames('player_run.png', 192, 64);
  assert.deepEqual(atlas, {
    animation: 'run',
    frameWidth: 32,
    frameHeight: 64,
    fps: 10,
    frames: 6,
  });
  // A single frame keeps the whole image rather than slicing it.
  assert.equal(Spec.importFrames('player_run_00.png', 32, 64).frameWidth, 0);
  assert.equal(Spec.infer('my-custom-art.png'), null);
  const atlasInfo = Spec.check(
    { name: 'player_run.png', width: 192, height: 64, frameWidth: 32, frameHeight: 64 },
    {},
  );
  assert.equal(atlasInfo.status, 'ok');
  assert.equal(atlasInfo.animation.fps, 10);
});
test('checks are advisory: old 64x64 pad art warns but remains usable', () => {
  const old = {
    id: 'old-jet',
    name: 'Jet Idle.png',
    path: 'assets/Jet Idle.png',
    width: 64,
    height: 64,
  };
  const info = Spec.check(old, { type: 'physics.jet', slot: 'idle' });
  assert.equal(info.status, 'warn');
  assert.deepEqual(info.expected, { width: 32, height: 8 });
  assert.ok(info.issues.some((v) => v.includes('64×64')));
  assert.ok(info.warnings.some((v) => v.includes('空格')));
  assert.equal(info.canonical, 'physics_jet_idle.png');
  // Nothing in check() mutates the asset.
  assert.equal(old.width, 64);
  assert.equal(old.path, 'assets/Jet Idle.png');
});
test('built-in placeholders use the calibrated canvases and keep stable seed ids/paths', () => {
  const seed = seeds({ allThemes: true });
  const expected = {
    'seed-metal': [32, 32],
    'seed-ice-solid': [32, 32],
    'seed-jet-idle': [32, 8],
    'seed-thermal-hot': [32, 8],
    'seed-rail-active': [32, 8],
    'seed-calculus-integral': [32, 8],
    'seed-slacker-checkin': [32, 32],
    'seed-slacker-awake': [32, 8],
    'seed-token-small': [10, 10],
    'seed-token-big': [18, 18],
    'seed-spike': [32, 32],
    'seed-bg-far': [512, 512],
    'seed-bg-mid': [1920, 360],
  };
  for (const [id, [width, height]] of Object.entries(expected)) {
    const asset = seed.assets.find((a) => a.id === id);
    assert.ok(asset, id);
    assert.equal(asset.width, width, id);
    assert.equal(asset.height, height, id);
    assert.equal(asset.path, 'assets/' + id + '.svg', id);
    assert.ok(seed.files.get(asset.path), id);
  }
  const jet = Buffer.from(seed.files.get('assets/seed-jet-idle.svg')).toString();
  assert.match(jet, /width="32" height="8"/);
});
test('editor visual rect keeps legacy art at cell size and calibrates pads/tokens', () => {
  const object = { type: 'physics.jet', x: 2, y: 3, w: 1, h: 1 };
  assert.deepEqual(Draw.objectVisualRect(object, { width: 32, height: 8 }, { collider: 'pad' }), {
    x: 64,
    y: 120,
    w: 32,
    h: 8,
  });
  assert.deepEqual(Draw.objectVisualRect(object, { width: 64, height: 64 }, { collider: 'pad' }), {
    x: 64,
    y: 96,
    w: 32,
    h: 32,
  });
  assert.deepEqual(
    Draw.objectVisualRect(
      { type: 'slacker.checkin', x: 0, y: 0, w: 1, h: 1 },
      { width: 32, height: 32 },
      { collider: 'pad' },
    ),
    { x: 0, y: 0, w: 32, h: 32 },
  );
  assert.deepEqual(
    Draw.objectVisualRect(
      { type: 'common.small', x: 0, y: 0, w: 1, h: 1 },
      { width: 10, height: 10 },
      {},
    ),
    { x: 11, y: 11, w: 10, h: 10 },
  );
});
test('collision overlay draws actual pad strips and the spike damage circle', () => {
  const calls = [];
  const ctx = {
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {},
    stroke() {},
    fillRect() {},
    arc(...args) {
      calls.push(['arc', ...args]);
    },
    strokeRect(...args) {
      calls.push(['rect', ...args]);
    },
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
  };
  Draw.drawCollisionHint(
    ctx,
    { type: 'common.spike', x: 1, y: 2, w: 1, h: 1, params: {} },
    { collider: false },
    false,
    1,
  );
  assert.deepEqual(calls[0], ['arc', 48, 96, 11, 0, Math.PI * 2]);
  calls.length = 0;
  Draw.drawCollisionHint(
    ctx,
    { type: 'slacker.checkin', x: 1, y: 2, w: 1, h: 1, params: {} },
    { collider: 'pad' },
    true,
    1,
  );
  assert.deepEqual(calls[0], ['rect', 32.5, 88.5, 31, 7]);
});
test('import writes inferred atlas frame metadata while replacement keeps the old ID', async () => {
  const p = M.example(),
    store = { project: p, assetFiles: new Map(), change: (fn) => fn(p) },
    bytes = new Uint8Array([137, 80, 78, 71]),
    frames = Spec.importFrames('player_run.png', 192, 64);
  const meta = await Manager.importAsset(store, {
    name: 'player_run.png',
    bytes,
    width: 192,
    height: 64,
    courseId: 'physics',
    category: 'character',
    subcategory: 'player',
    ...frames,
  });
  assert.equal(meta.frameWidth, 32);
  assert.equal(meta.frameHeight, 64);
  assert.equal(meta.fps, 10);
  assert.equal(meta.subcategory, 'player');
  assert.ok(store.assetFiles.has(meta.path));
  const replaced = await Manager.importAsset(store, {
    name: 'player_run.png',
    bytes,
    width: 192,
    height: 64,
    replaceId: meta.id,
  });
  assert.equal(replaced.id, meta.id);
  assert.equal(replaced.frameWidth, 32);
  assert.equal(replaced.fps, 10);
});
