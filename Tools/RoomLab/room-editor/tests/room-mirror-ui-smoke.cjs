'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
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
    const room = async () => {
      const project = (await snapshot()).project;
      return project.courses.find((course) => course.id === 'physics').rooms[0];
    };
    const wires = async () => {
      const project = (await snapshot()).project;
      return JSON.stringify(project.courses.find((course) => course.id === 'physics').connections);
    };

    await page.locator('#start-new').click();
    await page.locator('[data-course="physics"] [data-enter]').click();
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    assert.equal(await page.locator('#mirror-horizontal').count(), 1);
    assert.equal(await page.locator('#mirror-vertical').count(), 1);

    const original = await room(),
      originalWires = await wires();
    assert.equal(original.entries[0].x, 1);
    assert.equal(original.exits[0].x, 28);
    assert.equal(original.tiles[0].x, 0);
    assert.equal(original.entries[0].face, 1);

    await page.locator('#mirror-horizontal').click();
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.includes('左右镜像完成'),
    );
    let mirrored = await room();
    assert.equal(mirrored.entries[0].x, original.cols - 1 - original.entries[0].x);
    assert.equal(mirrored.entries[0].face, -1);
    assert.equal(mirrored.exits[0].x, original.cols - original.exits[0].x - original.exits[0].w);
    assert.equal(mirrored.tiles[0].x, original.cols - 1 - original.tiles[0].x);
    assert.equal(await wires(), originalWires, 'mirroring must not change room wiring');

    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.deepEqual(await room(), original);
    assert.equal(await wires(), originalWires);

    await page.locator('#mirror-vertical').click();
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.includes('上下镜像完成'),
    );
    mirrored = await room();
    assert.equal(mirrored.entries[0].y, original.rows - 1 - original.entries[0].y);
    assert.equal(mirrored.exits[0].y, original.rows - original.exits[0].y - original.exits[0].h);
    assert.equal(mirrored.tiles[0].y, original.rows - 1 - original.tiles[0].y);
    assert.equal(mirrored.entries[0].face, original.entries[0].face);
    assert.equal(await wires(), originalWires, 'vertical mirroring must not change room wiring');

    fs.mkdirSync(path.resolve(__dirname, '../test-output'), { recursive: true });
    await page.screenshot({
      path: path.resolve(__dirname, '../test-output/room-mirror-preview.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        horizontal: true,
        vertical: true,
        stableIdsAndWiring: true,
        undo: true,
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
