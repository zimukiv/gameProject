'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  Registry = require('../src/plugins/registry.cjs'),
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
    const game = () => page.evaluate(() => window.__ROOM_LAB__.snapshot().game);
    const state = () => page.evaluate(() => window.__ROOM_LAB__.snapshot().state);
    const items = Registry.all()
      .filter((definition) => definition.item)
      .map((definition) => definition.type)
      .sort();

    await page.locator('#start-new').click();
    await page.locator('[data-enter="physics"]').click();
    await page.locator('[data-tab="rooms"]').click();
    await page.locator('[data-room]').first().click();
    await page.locator('#play-room').click();
    if (await page.locator('#dialog').isVisible())
      await page.getByRole('button', { name: '仅检查基础机制', exact: true }).click();
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game?.developerMode === true);
    let current = await game();
    assert.deepEqual(Object.keys(current.items).sort(), items);
    assert.match(await page.locator('.play-hud').innerText(), /开发者模式[\s\S]*全道具/);

    await page.locator('#play-edit').click();
    await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    assert.equal((await state()).route, 'room');
    await page.locator('#crumb-project').click();
    await page.getByRole('button', { name: '从首房试玩', exact: true }).click();
    if (await page.locator('#dialog').isVisible())
      await page.getByRole('button', { name: '仅检查基础机制', exact: true }).click();
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game?.developerMode === false);
    current = await game();
    assert.deepEqual(current.items, {});
    assert.doesNotMatch(await page.locator('.play-hud').innerText(), /开发者模式/);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        roomEditorDeveloperItems: items,
        overviewItems: current.items,
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
