'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const M = require('../src/project/model.cjs'),
  R = require('../src/plugins/registry.cjs');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const p = M.themedExample(),
    c = p.courses.find((c) => c.kind === 'calculus'),
    r = c.rooms[0];
  r.tiles = [];
  r.movables = [
    {
      id: 'a',
      x: 10,
      y: 5,
      targetX: 14,
      targetY: 8,
      padId: 'pad',
      motionPath: [
        { x: 14, y: 5, seconds: 2, mode: 'easeIn' },
        { x: 14, y: 8, seconds: 1, mode: 'linear' },
      ],
    },
    { id: 'b', x: 12, y: 6, targetX: 15, targetY: 6, padId: 'pad' },
    { id: 'd-brick', x: 20, y: 8, targetX: 22, targetY: 8, padId: 'derivative' },
  ];
  r.objects = [
    R.instantiate(p, 'calculus.integral', 'pad', 5, 5, c),
    R.instantiate(p, 'calculus.derivative', 'derivative', 5, 7, c),
  ];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'room-timeline-')), 'level.json');
  fs.writeFileSync(file, JSON.stringify(p));
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    await page.locator('#project-file').setInputFiles(file);
    await page.locator('[data-enter="calculus"]').click();
    await page.locator('[data-tab="rooms"]').click();
    await page.locator('[data-room]').first().click();
    const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
    const room = async () =>
      (await snap()).project.courses.find((c) => c.kind === 'calculus').rooms[0];
    const point = async (x, y) => {
      const b = await page.locator('#room-canvas').boundingBox(),
        v = (await snap()).state.roomView;
      return [b.x + v.x + (x + 0.5) * 32 * v.scale, b.y + v.y + (y + 0.5) * 32 * v.scale];
    };
    await page.keyboard.press('KeyZ');
    await page.mouse.click(...(await point(10, 5)));
    await page.locator('[data-inspector="nodes"]').click();
    await page.locator('[data-segment-collision="0"]').uncheck();
    assert.equal((await room()).movables[0].motionPath[0].movingCollision, false);
    await page.locator('#brick-node-seconds').fill('2');
    await page.locator('#brick-node-seconds').press('Tab');
    assert.equal(
      (await room()).movables[0].motionPath[0].movingCollision,
      false,
      'time edits retain flag',
    );
    await page.locator('#brick-moving-collision').uncheck();
    await page.locator('#brick-moving-collision').check();
    assert.equal(
      await page.locator('[data-segment-collision="0"]').isChecked(),
      false,
      'master does not erase segment settings',
    );
    const result = await app.evaluate(
      ({ app }, project) => {
        const root = app.getAppPath(),
          req = process.getBuiltinModule('module').createRequire(root + '/package.json');
        const { Engine } = req(root + '/src/runtime/engine.cjs');
        const g = new Engine(project, 'calculus'),
          b = g.room.movables[0],
          s = g.movableStates.get(b.id);
        const present = () => g.colliders().some((v) => v.id === b.id);
        s.anim = { kind: 'path', to: 3 };
        s.pathTime = 1;
        const first = present();
        s.pathTime = 2.5;
        const second = present();
        s.anim = null;
        const idle = present();
        return { first, second, idle };
      },
      (await snap()).project,
    );
    assert.deepEqual(result, { first: false, second: true, idle: true });
    await page.keyboard.down('Shift');
    await page.mouse.click(...(await point(12, 6)));
    await page.keyboard.up('Shift');
    assert.equal(await page.locator('.motion-route-legend small').count(), 2);
    const before = JSON.stringify((await snap()).project),
      canvas = await page.locator('#room-canvas').evaluate((c) => c.toDataURL());
    await page.locator('[data-motion-time="2"]').click();
    assert.equal(await page.locator('#motion-preview-time').inputValue(), '2');
    assert.notEqual(
      await page.locator('#room-canvas').evaluate((c) => c.toDataURL()),
      canvas,
      'canvas displays simulated positions',
    );
    await page.locator('#motion-preview-time').fill('1');
    assert.equal(await page.locator('#motion-preview-range').inputValue(), '1');
    const slider = await page.locator('#motion-preview-range').boundingBox();
    await page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height / 2);
    await page.mouse.down();
    await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    assert.ok(Number(await page.locator('#motion-preview-time').inputValue()) > 1.5);
    await page.locator('#motion-preview-direction').selectOption('reverse');
    assert.equal(await page.locator('[data-motion-time="1"]').count(), 1);
    assert.equal(JSON.stringify((await snap()).project), before, 'preview never edits project');
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/motion-timeline-build18.png'),
    });
    await page.locator('#clear-selection').click();
    await page.mouse.click(...(await point(5, 5)));
    assert.equal(
      await page.locator('.motion-route-legend small').count(),
      2,
      'pad shows all bound bricks',
    );
    await page.locator('#motion-preview-time').fill('0.75');
    assert.equal(JSON.stringify((await snap()).project), before);
    await page.keyboard.press('Escape');
    await page.mouse.click(...(await point(5, 7)));
    assert.equal(
      await page.locator('.motion-route-legend small').count(),
      1,
      'derivative shows its bound brick',
    );
    await page.locator('[data-motion-time="0.45"]').click();
    assert.equal(JSON.stringify((await snap()).project), before);
    await page.keyboard.press('Escape');
    await page.mouse.click(...(await point(25, 2)));
    assert.equal(await page.locator('.motion-timeline').count(), 0);
    assert.equal((await snap()).state.motionPreview, null);
    assert.deepEqual(errors, []);
    console.log(
      'PASS packaged segment controls and runtime collision, multiselect/pad timeline, slider, numeric input, reverse, read-only preview and selection reset',
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
