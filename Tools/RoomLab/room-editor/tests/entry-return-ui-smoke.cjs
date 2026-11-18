'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium, _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  let browser, electronApp, page;
  const errors = [];
  try {
    if (process.env.EDITOR_EXE) {
      const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      electronApp = await _electron.launch({
        executablePath: process.env.EDITOR_EXE,
        args: [],
        env,
        timeout: 30000,
      });
      page = await electronApp.firstWindow();
      await page.waitForFunction(() => !!window.__ROOM_LAB__);
    } else {
      browser = await chromium.launch({ headless: true, channel: 'msedge' });
      page = await browser.newPage({ viewport: { width: 1450, height: 1040 } });
      await page.goto(
        'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
      );
    }
    page.on('pageerror', (error) => errors.push(error.message));
    const snapshot = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
    const room = async () =>
      (await snapshot()).project.courses.find((course) => course.kind === 'physics').rooms[0];
    const point = async (x, y) => {
      const box = await page.locator('#room-canvas').boundingBox(),
        view = (await snapshot()).state.roomView;
      return [
        box.x + view.x + (x + 0.5) * 32 * view.scale,
        box.y + view.y + (y + 0.5) * 32 * view.scale,
      ];
    };

    await page.locator('#start-new').click();
    await page.locator('[data-enter="physics"]').click();
    await page.locator('[data-tab="rooms"]').click();
    await page.locator('[data-room]').first().click();
    const entry = (await room()).entries[0];
    assert.equal(entry.allowReturn, true);
    await page.mouse.click(...(await point(entry.x, entry.y)));
    await page.locator('[data-inspector="links"]').click();
    const toggle = page.locator('#entry-allow-return');
    assert.equal(await toggle.isChecked(), true);
    await toggle.uncheck();
    await page.locator('#save-entry').evaluate((button) => button.click());
    assert.equal((await room()).entries[0].allowReturn, false);

    await page.locator('#back-course').click();
    await page.locator('[data-room]').first().click();
    await page.mouse.click(...(await point(entry.x, entry.y)));
    await page.locator('[data-inspector="links"]').click();
    assert.equal(await page.locator('#entry-allow-return').isChecked(), false);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        defaultAllowed: true,
        savedOptOut: false,
        errors,
      }),
    );
  } finally {
    if (electronApp) await electronApp.close();
    if (browser) await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
