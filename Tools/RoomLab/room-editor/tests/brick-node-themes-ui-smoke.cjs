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
    const point = async (x, y) => {
      const box = await page.locator('#room-canvas').boundingBox(),
        view = (await snapshot()).state.roomView;
      return [
        box.x + view.x + (x + 0.5) * 32 * view.scale,
        box.y + view.y + (y + 0.5) * 32 * view.scale,
      ];
    };
    const room = async (kind) =>
      (await snapshot()).project.courses.find((course) => course.kind === kind).rooms[0];

    await page.locator('#start-new').click();
    for (const kind of ['physics', 'slacker']) {
      await page.locator(`[data-enter="${kind}"]`).click();
      await page.locator('[data-tab="rooms"]').click();
      await page.locator('[data-room]').first().click();
      await page.locator('.block-card[data-tool="movable"]').click();
      await page.mouse.click(...(await point(7, 8)));
      await page.locator('#brick-node-place').waitFor();
      assert.equal(await page.locator('[data-inspector="nodes"]').count(), 1);

      await page.locator('#brick-node-place').click();
      await page.mouse.click(...(await point(8, 8)));
      let brick = (await room(kind)).movables.at(-1);
      assert.equal(brick.motionPath.length, 1);
      assert.deepEqual({ x: brick.motionPath[0].x, y: brick.motionPath[0].y }, { x: 8, y: 8 });

      await page.mouse.click(...(await point(9, 8)), { button: 'right' });
      brick = (await room(kind)).movables.at(-1);
      assert.equal(brick.motionPath.length, 2);
      assert.deepEqual({ x: brick.motionPath[1].x, y: brick.motionPath[1].y }, { x: 9, y: 8 });
      await page.locator('#home').click();
    }

    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        themes: ['physics', 'slacker'],
        inspectorNodeTab: true,
        buttonNodeAdd: true,
        contextNodeAdd: true,
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
