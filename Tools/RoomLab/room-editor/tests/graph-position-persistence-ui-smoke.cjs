'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  G = require('../src/editor/graph-layout.cjs'),
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
    const course = async () =>
      (await snapshot()).project.courses.find((item) => item.kind === 'physics');
    const point = async (x, y) => {
      const box = await page.locator('#graph').boundingBox(),
        attrs = await page.locator('#graph').evaluate((node) => ({
          width: node.width,
          height: node.height,
        })),
        view = (await snapshot()).state.graphView;
      return [
        box.x + ((x * view.scale + view.x) * box.width) / attrs.width,
        box.y + ((y * view.scale + view.y) * box.height) / attrs.height,
      ];
    };

    await page.locator('#start-new').click();
    await page.locator('[data-enter="physics"]').click();
    await page.locator('#graph').waitFor();
    const initial = await course(),
      first = initial.rooms[0],
      second = initial.rooms[1],
      from = await point(first.graph.x + 30, first.graph.y + 10),
      to = await point(second.graph.x + 30, second.graph.y + 10);
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((id) => {
      const project = window.__ROOM_LAB__.snapshot().project,
        room = project.courses
          .find((item) => item.kind === 'physics')
          .rooms.find((item) => item.id === id),
        peer = project.courses.find((item) => item.kind === 'physics').rooms[1];
      return Math.hypot(room.graph.x - peer.graph.x, room.graph.y - peer.graph.y) < 1;
    }, first.id);
    const arranged = await course();
    assert.equal(G.overlaps(arranged.rooms), true, 'test should persist overlapping positions');

    await page.reload();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    await page.locator('[data-enter="physics"]').click();
    await page.locator('#graph').waitFor();
    const reloaded = await course();
    assert.deepEqual(
      reloaded.rooms.map((room) => room.graph),
      arranged.rooms.map((room) => room.graph),
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        draggedRoom: first.id,
        overlappingLayoutPreserved: true,
        reloadPositions: reloaded.rooms.map((room) => room.graph),
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
