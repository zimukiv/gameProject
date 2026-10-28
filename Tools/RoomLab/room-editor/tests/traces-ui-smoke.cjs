'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.traceStrokes = new Set();
    const old = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...args) {
      if (this.canvas.id === 'play-canvas') window.traceStrokes.add(this.strokeStyle);
      return old.apply(this, args);
    };
  });
  const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
  try {
    await page.goto(
      'file:///' +
        path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/') +
        '?preview=room',
    );
    await page.locator('#play-room').click();
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(350);
    await page.keyboard.up('KeyD');
    assert.equal(await page.locator('#play-traces').count(), 1);
    await page.locator('#play-traces').click();

    await page.locator('#trace-save').click();
    let r = (await snap()).project.courses[0].rooms[0];
    assert.equal(r.playTraces.length, 1);
    assert.ok(r.playTraces[0].points.length > 2);
    await page.locator('#trace-close').click();
    await page.keyboard.press('KeyR');
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(180);
    await page.keyboard.up('KeyA');
    await page.locator('#play-traces').click();

    await page.locator('#trace-save').click();
    r = (await snap()).project.courses[0].rooms[0];
    assert.equal(r.playTraces.length, 2);
    assert.notEqual(r.playTraces[0].color, r.playTraces[1].color);
    await page.waitForFunction(
      (colors) => {
        const ctx = document.createElement('canvas').getContext('2d');
        return colors.every((color) => {
          ctx.strokeStyle = color + 'cc';
          return window.traceStrokes.has(ctx.strokeStyle);
        });
      },
      r.playTraces.map((t) => t.color),
    );
    await page.screenshot({ path: path.resolve(__dirname, '../test-output/traces-manager.png') });
    await page.locator('[data-trace-toggle]').first().uncheck();
    assert.equal((await snap()).project.courses[0].rooms[0].playTraces[0].visible, false);
    const download = page.waitForEvent('download');
    await page.locator('#trace-export').click();
    const file = await download;
    await file.saveAs(path.resolve(__dirname, '../test-output/paths.json'));
    await page
      .locator('#trace-import-file')
      .setInputFiles(path.resolve(__dirname, '../test-output/paths.json'));
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms[0].playTraces.length === 4,
    );
    await page.locator('#trace-close').click();
    await page.locator('#play-edit').click();
    await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    assert.equal(await page.locator('#room-traces').count(), 1);
    await page.locator('#room-traces').click();
    assert.equal(await page.locator('[data-trace-toggle]').count(), 4);
    await page.reload();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    assert.equal((await snap()).project.courses[0].rooms[0].playTraces.length, 4);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        record: true,
        save: true,
        multiplePaths: true,
        visibility: true,
        fileRoundTrip: true,
        persistInProject: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
