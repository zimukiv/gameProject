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
    await page.locator('#start-new').click();
    await page.locator('[data-course="physics"] [data-enter]').click();
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();

    const source = (await snapshot()).project.courses.find((course) => course.id === 'physics')
      .rooms[0];
    await page.keyboard.press('Control+c');
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.includes('已复制整房'),
    );

    await page.locator('#home').click();
    await page.locator('[data-course="calculus"] [data-enter]').click();
    const before = (await snapshot()).project.courses.find((course) => course.id === 'calculus');
    await page.keyboard.press('Control+v');
    await page.waitForFunction((count) => {
      const project = window.__ROOM_LAB__.snapshot().project,
        calculus = project.courses.find((course) => course.id === 'calculus');
      return (
        calculus.rooms.length === count &&
        document.querySelector('#status').textContent.includes('已粘贴整房')
      );
    }, before.rooms.length + 1);

    let project = (await snapshot()).project;
    let target = project.courses.find((course) => course.id === 'calculus');
    const firstPasted = target.rooms.at(-1);
    assert.notEqual(firstPasted.id, source.id);
    assert.deepEqual(
      firstPasted.objects.map((object) => object.type),
      source.objects.map((object) => object.type),
    );
    assert.equal(firstPasted.tiles.length, source.tiles.length);
    assert.notDeepEqual(
      firstPasted.entries.map((entry) => entry.id),
      source.entries.map((entry) => entry.id),
    );
    assert.equal(
      target.connections.some(
        (wire) => wire.from.roomId === firstPasted.id || wire.to.roomId === firstPasted.id,
      ),
      false,
      'external room wiring must not be copied across courses',
    );
    const assetIds = new Set(project.assets.map((asset) => asset.id));
    const referenced = Object.values(firstPasted.artBindings || {}).flatMap((binding) =>
      typeof binding === 'string' ? [binding] : Object.values(binding || {}),
    );
    assert.ok(
      referenced.every((id) => assetIds.has(id)),
      'copied room art must resolve',
    );

    await page.locator('#planning-tab-library').click();
    await page.locator('[data-room-clipboard-paste]').click();
    await page.waitForFunction((count) => {
      const calculus = window.__ROOM_LAB__
        .snapshot()
        .project.courses.find((course) => course.id === 'calculus');
      return calculus.rooms.length === count;
    }, before.rooms.length + 2);
    project = (await snapshot()).project;
    target = project.courses.find((course) => course.id === 'calculus');
    assert.notEqual(target.rooms.at(-1).id, firstPasted.id);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(
      JSON.stringify({
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        sourceRoom: source.id,
        targetRooms: target.rooms.length,
        copiedObjects: firstPasted.objects.length,
        copiedArtBindings: referenced.length,
        uniquePasteIds: true,
        externalWires: false,
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
