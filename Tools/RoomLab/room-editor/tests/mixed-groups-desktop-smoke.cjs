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
  r.objects = [R.instantiate(p, 'common.spike', 'group-spike', 20, 4, c)];
  r.movables = [
    { id: 'group-brick', x: 20, y: 5, targetX: 22, targetY: 5, padId: '', collision: true },
  ];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'room-mixed-')), 'level.json');
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
      const box = await page.locator('#room-canvas').boundingBox(),
        v = (await snap()).state.roomView;
      return [box.x + v.x + (x + 0.5) * 32 * v.scale, box.y + v.y + (y + 0.5) * 32 * v.scale];
    };
    await page.keyboard.press('KeyZ');
    await page.mouse.click(...(await point(20, 5)));
    await page.keyboard.down('Shift');
    await page.mouse.click(...(await point(20, 4)));
    await page.keyboard.up('Shift');
    await page.locator('#group-mixed').click();
    assert.equal((await room()).objects[0].attachmentTo, 'group-brick');
    assert.equal(await page.locator('#brick-node-save').isVisible(), false);
    await page.screenshot({ path: path.resolve(__dirname, '../test-output/mixed-group-build16.png') });
    await page.locator('[data-time-delta="1"]').click();
    assert.equal((await room()).movables[0].motionPath[0].seconds, 1.45);
    await page.locator('[data-time-delta="-0.5"]').click();
    assert.equal((await room()).movables[0].motionPath[0].seconds, 0.95);
    await page.locator('#brick-node-mode').selectOption('easeIn');
    assert.equal((await room()).movables[0].motionPath[0].mode, 'easeIn');
    await page.locator('#brick-node-seconds').fill('0.1');
    await page.locator('#brick-node-seconds').press('Tab');
    assert.equal((await room()).movables[0].motionPath[0].seconds, 0.1);
    await page.locator('[data-time-delta="-1"]').click();
    assert.equal((await room()).movables[0].motionPath[0].seconds, 0.05);
    await page.locator('#undo').click();
    assert.equal((await room()).movables[0].motionPath[0].seconds, 0.1);
    await page.mouse.move(...(await point(22.4, 5.4)));
    await page.mouse.down();
    await page.mouse.move(...(await point(23.4, 5.4)), { steps: 4 });
    await page.mouse.up();
    assert.equal((await room()).movables[0].motionPath[0].x, 23);
    await page.mouse.move(...(await point(20, 4)));
    await page.mouse.down();
    await page.mouse.move(...(await point(21, 4)), { steps: 4 });
    await page.mouse.up();
    assert.equal((await room()).objects[0].x, 21);
    assert.equal((await room()).movables[0].x, 21);
    await page.locator('[data-inspector="base"]').click();
    assert.equal(await page.locator('#apply-object').isVisible(), false);
    await page.locator('#object-x').fill('22');
    await page.locator('#object-x').press('Tab');
    assert.equal((await room()).movables[0].x, 22);
    assert.equal((await room()).objects[0].x, 22);
    await page.locator('#dissolve-assembly').click();
    assert.ok(!(await room()).objects[0].attachmentTo);
    assert.deepEqual(errors, []);
    console.log(
      'PASS mixed group create / drag / dissolve, whole-cell node drag, instant fields, time steppers and undo',
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
