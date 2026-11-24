'use strict';
// Real-UI acceptance for the foldable room thumbnail bar on the editor page.
// Runs in the actual Electron shell (USE_ELECTRON=1 / EDITOR_EXE), like the other
// room navigation smokes. Covers: fold releases canvas height, view/selection/
// project stay untouched, an edit that re-renders keeps the folded state, room
// switching and a reload keep it, a top-bar ownership click re-opens the bar,
// and thumbnails come back sharp when unfolded. The home page's own fold key
// stays independent.
const assert = require('node:assert/strict'),
  path = require('node:path');
const { chromium, _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'),
  roomKey = 'roomlab-room-strip-collapsed',
  homeKey = 'roomlab-room-picker-collapsed',
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
      page = await browser.newPage({ viewport: { width: 1480, height: 1000 } });
      await page.goto(
        'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
      );
    }
    page.on('pageerror', (error) => errors.push(error.message));
    const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
    const canvasHeight = () =>
      page.locator('#room-canvas').evaluate((node) => node.getBoundingClientRect().height);
    const stripVisible = () => page.locator('#room-thumb-strip').isVisible();
    const expanded = async () =>
      (await page.locator('#room-strip-toggle').getAttribute('aria-expanded')) === 'true';
    const enterRoom = async (roomId) => {
      if (!(await page.locator('#room-canvas').count())) {
        await page.locator(`[data-strip-room="${roomId}"]`).dblclick();
        await page.locator('#room-canvas').waitFor();
      }
    };

    await page.evaluate(
      ([a, b]) => {
        localStorage.removeItem(a);
        localStorage.removeItem(b);
      },
      [roomKey, homeKey],
    );
    await page.locator('#start-new').click();
    await page.locator('#graph').waitFor();
    const rooms = (await snap()).project.courses.flatMap((course) => course.rooms);
    const first = rooms[0],
      second = rooms[1];
    await enterRoom(first.id);

    // 1. Default: unfolded, with a clear "房间选择 N / 收起" entry.
    assert.equal(await expanded(), true, 'the strip starts unfolded');
    assert.equal(await stripVisible(), true);
    assert.match(await page.locator('#room-strip-toggle').textContent(), /房间选择\s*\d+/);
    assert.match(await page.locator('#room-strip-toggle').textContent(), /收起/);
    const opened = await snap(),
      openedHeight = await canvasHeight();

    // 2. Fold: only the thumbnail row goes away and the canvas grows. The view
    // transform, selection, filter and project must be byte-identical.
    await page.locator('#room-strip-toggle').click();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'true', roomKey);
    assert.equal(await expanded(), false, 'folded state is announced');
    assert.equal(await stripVisible(), false, 'the thumbnail row is hidden');
    assert.match(await page.locator('#room-strip-toggle').textContent(), /展开/);
    assert.equal(
      await page.locator('[data-room-filter="all"]').isVisible(),
      true,
      'filter chips stay reachable while folded',
    );
    const folded = await snap(),
      foldedHeight = await canvasHeight();
    assert.ok(
      foldedHeight > openedHeight + 30,
      `folding must release canvas height (${openedHeight} -> ${foldedHeight})`,
    );
    assert.deepEqual(folded.state.roomView, opened.state.roomView, 'zoom/pan unchanged');
    assert.equal(folded.state.selection, opened.state.selection, 'selection unchanged');
    assert.deepEqual(folded.state.multiSelection, opened.state.multiSelection);
    assert.equal(folded.state.roomId, opened.state.roomId);
    assert.equal(folded.state.courseId, opened.state.courseId);
    assert.equal(folded.state.roomFilter, opened.state.roomFilter);
    assert.deepEqual(folded.project, opened.project, 'folding never edits the project');

    // 3. Expand: thumbnails are back and painted at the real DPR (not a stale
    // stretched cache), and the canvas returns to its former height.
    await page.locator('#room-strip-toggle').click();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'false', roomKey);
    assert.equal(await expanded(), true);
    assert.equal(await stripVisible(), true);
    const thumb = page.locator('[data-thumb]').first();
    const thumbBox = await thumb.evaluate((node) => ({
      cssWidth: Number(node.dataset.cssWidth),
      cssHeight: Number(node.dataset.cssHeight),
      width: node.width,
      height: node.height,
      ratio: Number(node.dataset.dpr) || 1,
    }));
    assert.equal(thumbBox.cssWidth, 132, 'thumbnails keep their CSS size');
    assert.ok(
      thumbBox.width >= Math.round(132 * thumbBox.ratio),
      'thumbnail backing store follows the device pixel ratio',
    );
    assert.ok(Math.abs((await canvasHeight()) - openedHeight) <= 4, 'height restored on expand');
    assert.deepEqual((await snap()).state.roomView, opened.state.roomView, 'view survives folding');

    // 4. A real edit re-renders the page; the folded state must survive it.
    await page.locator('#room-strip-toggle').click();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'true', roomKey);
    const viewBeforeEdit = (await snap()).state.roomView;
    await page.locator('#room-name').fill(first.name + '·折叠');
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      (name) =>
        window.__ROOM_LAB__
          .snapshot()
          .project.courses.some((c) => c.rooms.some((r) => r.name === name)),
      first.name + '·折叠',
    );
    await enterRoom(first.id);
    assert.equal(await expanded(), false, 'editing keeps the bar folded');
    assert.deepEqual((await snap()).state.roomView, viewBeforeEdit, 'edit keeps the view');

    // 5. Switching rooms keeps the fold (state is an editor preference only).
    await page.locator('#crumb-project').click();
    await page.locator('[data-strip-room]').first().waitFor();
    await page.locator(`[data-strip-room="${second.id}"]`).dblclick();
    await page.locator('#room-canvas').waitFor();
    assert.equal((await snap()).state.roomId, second.id, 'switched rooms');
    assert.equal(await expanded(), false, 'switching rooms keeps the folded bar');

    // 6. A top-bar ownership click re-opens the bar instead of hiding the
    // navigation it just changed.
    await page.locator('#crumb-owner').click();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'false', roomKey);
    assert.equal(await expanded(), true, 'ownership click unfolds the bar');
    assert.equal(await stripVisible(), true, 'the filtered thumbnails are visible');

    // 7. Reload keeps the fold; the home page fold switch is an independent key.
    await page.locator('#room-strip-toggle').click();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'true', roomKey);
    await page.evaluate((key) => localStorage.setItem(key, 'false'), homeKey);
    await page.reload();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    await page.locator(`[data-strip-room="${first.id}"]`).dblclick();
    await page.locator('#room-canvas').waitFor();
    assert.equal(await expanded(), false, 'reload keeps the folded bar');
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), homeKey),
      'false',
      'the room bar never writes the home page fold key',
    );
    await page.locator('#room-strip-toggle').click();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'false', roomKey);
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), homeKey),
      'false',
      'unfolding the room bar leaves the home page fold key alone',
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        electron: useElectron,
        packaged: !!process.env.EDITOR_EXE,
        openedHeight,
        foldedHeight,
        foldReleasesCanvas: true,
        viewSelectionProjectUnchanged: true,
        editKeepsFold: true,
        roomSwitchKeepsFold: true,
        reloadKeepsFold: true,
        ownershipClickUnfolds: true,
        homeFoldKeyIndependent: true,
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
