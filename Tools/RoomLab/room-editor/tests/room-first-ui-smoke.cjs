'use strict';
// Real-UI acceptance for the room-first planning screen (stage 3). Runs in the
// actual Electron shell (USE_ELECTRON=1 / EDITOR_EXE) or, when that cannot be
// spawned, in Chromium against the built page. It covers: the horizontal room
// thumbnail strip (click selects + locates on the map, double click edits),
// favourite star + gold highlight + 收藏 filter, user-named grouping with a
// multi-room selection, and persistence of organisation metadata across a page
// reload (local draft -> store.load).
const assert = require('node:assert/strict'),
  path = require('node:path');
const { chromium, _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'),
  useElectron = !!process.env.EDITOR_EXE || process.env.USE_ELECTRON === '1';

(async () => {
  let browser, electronApp, page;
  const errors = [];
  try {
    if (useElectron) {
      const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      electronApp = await _electron.launch({
        executablePath: process.env.EDITOR_EXE || require('electron'),
        args: process.env.EDITOR_EXE ? [] : [root],
        env,
        timeout: 30000,
      });
      page = await electronApp.firstWindow();
      await page.waitForFunction(() => !!window.__ROOM_LAB__);
    } else if (process.env.CDP_ENDPOINT) {
      browser = await chromium.connectOverCDP(process.env.CDP_ENDPOINT);
      const context = browser.contexts()[0] || (await browser.newContext());
      page = await context.newPage();
    } else {
      browser = await chromium.launch({ headless: true, channel: 'msedge' });
      page = await browser.newPage();
    }
    page.on('pageerror', (error) => errors.push(error.message));
    if (!useElectron) {
      await page.setViewportSize({ width: 1480, height: 1000 }).catch(() => {});
      if (!process.env.CDP_ENDPOINT)
        await page.goto(
          'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
        );
    }
    const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
    const project = async () => (await snap()).project;
    const org = async () => page.evaluate(() => window.__ROOM_LAB__.organization());

    await page.locator('#start-new').click();
    await page.locator('#graph').waitFor();
    const rooms = (await project()).courses.flatMap((course) =>
      course.rooms.map((room) => ({ id: room.id, name: room.name })),
    );

    // 1. No course-first surface; one thumbnail per room.
    assert.equal(await page.locator('.course-chip, .graph-legend-item').count(), 0);
    assert.equal(await page.locator('[data-strip-room]').count(), rooms.length);
    assert.equal(await page.locator('[data-select-course]').count(), 0);
    const first = rooms[0],
      second = rooms[1];

    // 2. Clicking a thumbnail selects it and locates it on the route map.
    const viewBefore = (await snap()).state.graphView;
    await page.locator(`[data-strip-room="${first.id}"]`).click();
    const selected = await snap();
    assert.equal(selected.state.graphSelection.id, first.id);
    assert.equal(selected.state.planningTab, 'map');
    assert.notDeepEqual(selected.state.graphView, viewBefore, 'the map locates the room');
    assert.equal(await page.locator(`[data-strip-room="${first.id}"].selected`).count(), 1);
    assert.match(
      await page.locator('#graph-inspector').textContent(),
      new RegExp(first.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the compact inspector shows the selected room',
    );

    // 3. Double click opens the room editor; the strip edit icon works too.
    await page.locator(`[data-strip-room="${first.id}"]`).dblclick();
    await page.locator('#room-canvas').waitFor();
    await page.locator('#crumb-project').click();
    await page.locator('[data-strip-edit]').nth(1).click();
    await page.locator('#room-canvas').waitFor();
    assert.equal((await snap()).state.roomId, second.id, 'the ✎ control edits that room');
    await page.locator('#crumb-project').click();

    // 4. Favourite star: immediate, highlighted, filterable, undoable.
    await page.locator(`[data-strip-room="${second.id}"] [data-fav]`).click();
    assert.deepEqual((await org()).favorites, [second.id]);
    assert.equal(await page.locator(`[data-strip-room="${second.id}"].favorite`).count(), 1);
    assert.match(
      await page.locator(`[data-strip-room="${second.id}"] [data-fav]`).getAttribute('class'),
      /\bon\b/,
    );
    await page.locator('[data-room-filter="favorites"]').click();
    assert.equal(await page.locator('[data-strip-room]').count(), 1);
    await page.locator('[data-room-filter="all"]').click();
    assert.equal(await page.locator('[data-strip-room]').count(), rooms.length);
    // Undo/redo keep the project consistent.
    await page.keyboard.press('Control+z');
    assert.deepEqual((await org()).favorites, []);
    await page.keyboard.press('Control+y');
    assert.deepEqual((await org()).favorites, [second.id]);

    // 5. Cross-course user group built from a multi-room selection.
    await page.locator('#planning-tab-library').click();
    const courseCount = (await project()).courses.length;
    assert.ok(courseCount > 1, 'the starter project has several courses');
    const crossCourse = (await project()).courses[1].rooms[0];
    await page.locator(`[data-room-card="${first.id}"]`).click();
    await page.locator(`[data-room-card="${crossCourse.id}"]`).click({ modifiers: ['Control'] });
    assert.deepEqual((await snap()).state.roomMulti.sort(), [first.id, crossCourse.id].sort());
    await page.locator('#group-new').click();
    await page.locator('#group-name-input').fill('跨大关整理');
    await page.locator('#dialog-actions').getByRole('button', { name: '保存' }).click();
    const grouped = await org();
    assert.equal(grouped.groups.length, 1);
    assert.equal(grouped.groups[0].name, '跨大关整理');
    assert.deepEqual(grouped.groups[0].roomIds.sort(), [first.id, crossCourse.id].sort());
    await page.locator(`[data-room-filter="group:${grouped.groups[0].id}"]`).click();
    assert.equal(await page.locator('[data-room-card]').count(), 2);
    assert.equal(
      await page.locator('[data-room-card] [data-group-remove]').first().count(),
      1,
      'cards expose group membership',
    );

    // 6. Organisation survives a reload (local draft round trip), and the map
    // still shows every room with favourites highlighted rather than filtered.
    await page.reload();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    const reloaded = await page.evaluate(() => window.__ROOM_LAB__.organization());
    assert.deepEqual(reloaded.favorites, [second.id]);
    assert.deepEqual(reloaded.groups[0].roomIds.sort(), [first.id, crossCourse.id].sort());
    assert.equal(await page.locator('[data-strip-room]').count(), rooms.length);
    assert.equal(await page.locator('.room-strip-item.favorite').count(), 1);
    assert.equal(await page.locator('#graph').count(), 1);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        roomStrip: rooms.length,
        stripClickLocates: true,
        stripDoubleClickEdits: true,
        favouriteHighlightAndFilter: true,
        crossCourseGroup: true,
        organisationPersisted: true,
        electron: useElectron,
        packaged: !!process.env.EDITOR_EXE,
        errors,
      }),
    );
  } finally {
    if (electronApp) await electronApp.close();
    else if (browser) await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
