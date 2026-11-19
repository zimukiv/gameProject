'use strict';
// UI acceptance for the planning redesign: the global route map shows every
// course at once, the active course only highlights, the project menu exposes
// exactly four actions, the cloud room library is top level, and the room
// library is the primary room-editing entry (with a course/all filter).
const assert = require('node:assert/strict'),
  path = require('node:path');
const { chromium, _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Run against the real Electron shell when EDITOR_EXE points at a packaged exe or
// USE_ELECTRON=1 asks for the dev electron, otherwise fall back to the built page
// in Chromium. Electron launches with ROOM_EDITOR_TEST=1 so main.cjs allocates a
// throw-away userData profile and this run never reads or writes real saves.
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
      // Attach to an already-running Edge over CDP when the environment blocks
      // Playwright's own browser spawn (CDP_ENDPOINT, as in themes-ui-smoke).
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
    const course = async (kind) =>
      (await project()).courses.find((item) => item.kind === kind) || (await project()).courses[0];
    const graphs = async () =>
      JSON.stringify((await project()).courses.map((c) => c.rooms.map((r) => r.graph)));
    const toScreen = async (courseId, x, y) => {
      const state = await snap(),
        offset = (state.state.courseOffsets || {})[courseId] || { x: 0, y: 0 },
        view = state.state.graphView,
        box = await page.locator('#graph').boundingBox(),
        dims = await page.locator('#graph').evaluate((node) => ({ w: node.width, h: node.height }));
      return [
        box.x + (((x + offset.x) * view.scale + view.x) * box.width) / dims.w,
        box.y + (((y + offset.y) * view.scale + view.y) * box.height) / dims.h,
      ];
    };

    await page.locator('#start-new').click();
    await page.locator('#graph').waitFor();
    assert.equal((await project()).courses.length, 3);

    // 1. The route map shows all rooms at once; the room-first strip replaces the
    // old course chips/legend, and nothing on the main screen is course-first.
    assert.equal(
      await page.locator('#planning-content .graph-layout.planning-map #graph').count(),
      1,
      'the route map canvas lives inside #planning-content',
    );
    assert.equal(await page.locator('#planning-content #graph-inspector').count(), 1);
    assert.equal(await page.locator('.graph-legend-item').count(), 0, 'no course legend');
    assert.equal(await page.locator('.course-chip').count(), 0, 'no course chips');
    assert.equal(await page.locator('[data-select-course]').count(), 0);
    const rooms = (await project()).courses.reduce((sum, item) => sum + item.rooms.length, 0);
    assert.equal(await page.locator('.room-strip-item').count(), rooms);
    assert.equal(await page.locator('[data-strip-mini]').count(), rooms);
    assert.match(
      await page.locator('#graph-inspector').textContent(),
      /点击房间/,
      'the empty inspector is a one-line prompt, not a course breakdown',
    );

    // 2. Project menu has exactly the four allowed actions.
    await page.locator('[data-menu-trigger]', { hasText: '项目' }).click();
    assert.deepEqual(
      await page
        .locator('#menu-project button')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent.trim())),
      ['打开项目', '另存为', '导出房间', '导入房间'],
    );
    await page.keyboard.press('Escape');

    // 3. Save stays primary and the cloud room library is a top-level primary action.
    assert.match(await page.locator('#save-project').getAttribute('class'), /primary/);
    assert.match(await page.locator('#cloud-room-library').getAttribute('class'), /primary/);
    assert.equal(await page.locator('#cloud-room-library').isVisible(), true);

    // 4. Selecting a room thumbnail only re-highlights/locates; no position is
    // rewritten, and the owner course becomes the active one.
    const before = await graphs();
    const secondCourse = (await project()).courses[1],
      pickId = secondCourse.rooms[0].id;
    await page.locator('[data-strip-room="' + pickId + '"]').click();
    assert.equal((await snap()).state.courseId, secondCourse.id);
    assert.equal((await snap()).state.graphSelection.id, pickId);
    assert.equal(await page.locator('.room-strip-item.selected').count(), 1);
    assert.equal(await graphs(), before, 'selecting a room never rewrites coordinates');
    assert.equal(await page.locator('.graph-legend-item').count(), 0);

    // 5. Dragging a room writes back to its owner course only.
    const physics = await course('physics'),
      target = physics.rooms[0],
      point = await toScreen(physics.id, target.graph.x + 20, target.graph.y + 30);
    await page.mouse.move(...point);
    await page.mouse.down();
    await page.mouse.move(point[0] + 90, point[1] + 60, { steps: 8 });
    await page.mouse.up();
    const moved = await course('physics');
    assert.notDeepEqual(moved.rooms[0].graph, target.graph);
    assert.equal(
      JSON.stringify((await project()).courses[1].rooms.map((r) => r.graph)),
      JSON.stringify(JSON.parse(before)[1]),
      'other courses keep their authored positions',
    );

    // 6. Cross-course wiring is rejected instead of attaching to the wrong course.
    const wiringBefore = JSON.stringify((await course('calculus')).connections),
      exit = require('../src/editor/graph-layout.cjs').ports(moved.rooms[1]).exits[0],
      entry = require('../src/editor/graph-layout.cjs').ports((await course('calculus')).rooms[0])
        .entries[0],
      from = await toScreen(physics.id, exit.x, exit.y),
      to = await toScreen((await course('calculus')).id, entry.x, entry.y);
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.includes('不能跨大关接线'),
    );
    assert.equal(JSON.stringify((await course('calculus')).connections), wiringBefore);

    // 7. The room library lists every room with no course headings; filters are
    // 全部 / 收藏 / groups, and a favourite survives the filter round trip.
    await page.locator('#planning-tab-library').click();
    const all = await page.locator('[data-room-card]').count();
    assert.equal(
      all,
      (await project()).courses.reduce((sum, item) => sum + item.rooms.length, 0),
    );
    assert.equal(await page.locator('.room-thumb canvas').count(), all);
    assert.equal(await page.locator('.library-course-heading').count(), 0);
    assert.equal(await page.locator('[data-library-course]').count(), 0);
    const firstRoom = (await project()).courses[0].rooms[0].id;
    await page.locator('[data-room-card="' + firstRoom + '"] [data-fav]').click();
    assert.match(
      await page.locator('[data-room-card="' + firstRoom + '"]').getAttribute('class'),
      /\bfavorite\b/,
      'a favourite card is highlighted',
    );
    await page.locator('[data-room-filter="favorites"]').click();
    assert.equal(await page.locator('[data-room-card]').count(), 1);
    await page.locator('[data-room-filter="all"]').click();
    assert.equal(await page.locator('[data-room-card]').count(), all);

    // 8. Cards open the room editor and the breadcrumb returns to planning.
    // Returning from a room keeps the previous planning tab (library here), so the
    // test chooses the map tab explicitly instead of resetting the user's tab.
    await page.locator('[data-room]').first().click();
    await page.locator('#room-canvas').waitFor();
    await page.locator('#crumb-project').click();
    await page.locator('#planning-tab-map').click();
    await page.locator('#graph').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        globalMap: true,
        courseHighlightOnly: true,
        projectMenu: 4,
        cloudLibraryTopLevel: true,
        libraryFilter: true,
        crossCourseWireGuarded: true,
        electron: useElectron,
        packaged: !!process.env.EDITOR_EXE,
        errors,
      }),
    );
  } finally {
    if (electronApp) await electronApp.close();
    else if (process.env.CDP_ENDPOINT) {
      if (page) await page.close().catch(() => {});
    } else if (browser) await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
