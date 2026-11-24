'use strict';
// Real-UI acceptance for the unified map / room-first editor (stage 2). Runs in
// the actual Electron shell (USE_ELECTRON=1 / EDITOR_EXE) or in Chromium against
// the built page, exactly like tests/room-first-ui-smoke.cjs.
//
// Covered here (all through real DOM events, never by calling internals):
// 1. no legacy room-page buttons (返回路线图 / 复制整房 / 粘贴整房), no phase and
//    no 应用房间设置 button,
// 2. room property inputs save immediately while keeping focus and the canvas
//    zoom; half-typed/invalid values never write,
// 3. playtest inventory checkboxes take effect immediately,
// 4. Ctrl+C / Ctrl+V on a marquee selection creates new IDs, remaps internal
//    references and can be undone,
// 5. top bar ownership + thumbnail bar switch rooms across the old containers
//    (group label filters the strip; ungrouped label returns to all rooms),
// 6. a wire between rooms of two different legacy containers is really created,
//    drawn from the unified map layer and survives a reload,
// 7. group colours are shared by the map and the edit page and persist,
// 8. 2x device pixel ratio: backing store, layout and pointer → cell mapping.
const assert = require('node:assert/strict'),
  path = require('node:path');
const { chromium, _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'),
  useElectron = !!process.env.EDITOR_EXE || process.env.USE_ELECTRON === '1';

(async () => {
  let browser, electronApp, page;
  const errors = [];
  const result = {
    result: 'PASS',
    electron: useElectron,
    packaged: !!process.env.EDITOR_EXE,
    devicePixelRatio: null,
    instanceButtonsAbsent: false,
    liveRoomSettings: false,
    playtestImmediate: false,
    selectionClipboard: false,
    ownershipNavigation: false,
    crossContainerWiring: false,
    resizeObserver: false,
    dprChange: false,
    groupColorShared: false,
    dprPointer: false,
    errors,
  };
  try {
    if (useElectron) {
      const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      electronApp = await _electron.launch({
        executablePath: process.env.EDITOR_EXE || require('electron'),
        args: process.env.EDITOR_EXE
          ? ['--force-device-scale-factor=2']
          : [root, '--force-device-scale-factor=2'],
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
      if (!process.env.CDP_ENDPOINT) {
        await page.setViewportSize({ width: 1480, height: 1000 }).catch(() => {});
        await page.goto(
          'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
        );
      }
    }
    // Force a real 2x device scale factor through CDP (Chromium + Electron).
    let metrics = null,
      dpr = await page.evaluate(() => window.devicePixelRatio);
    if (dpr < 2) {
      const cdp = await page
        .context()
        .newCDPSession(page)
        .catch(() => null);
      metrics = cdp;
      if (cdp)
        await cdp
          .send('Emulation.setDeviceMetricsOverride', {
            width: 1480,
            height: 1000,
            deviceScaleFactor: 2,
            mobile: false,
          })
          .catch(() => {});
      await page.waitForTimeout(250);
      dpr = await page.evaluate(() => window.devicePixelRatio);
    }
    result.devicePixelRatio = dpr;

    const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
    const project = async () => (await snap()).project;
    const org = () => page.evaluate(() => window.__ROOM_LAB__.organization());
    const roomOf = (p, id) =>
      p.courses
        .flatMap((c) => c.rooms.map((r) => ({ course: c, room: r })))
        .find((x) => x.room.id === id);

    await page.locator('#start-new').click();
    await page.locator('#graph').waitFor();
    const p0 = await project();
    const rooms = p0.courses.flatMap((c) => c.rooms.map((r) => ({ id: r.id, name: r.name })));
    assert.ok(p0.courses.length > 1, 'the starter project has several legacy containers');
    const first = rooms[0],
      otherCourse = p0.courses[1],
      foreign = otherCourse.rooms[0];

    // 1. Room page: none of the removed controls exist, no phase, no apply button.
    await page.locator(`[data-strip-room="${first.id}"]`).dblclick();
    await page.locator('#room-canvas').waitFor();
    assert.equal(await page.locator('#room-back, #copy-room, #paste-room').count(), 0);
    assert.equal(await page.locator('#apply-room, .room-phase, .phase-badge').count(), 0);
    const inspectorText = await page.locator('#room-inspector').textContent();
    assert.equal(/应用房间设置/.test(inspectorText), false);
    assert.equal(
      /返回路线图|复制整房|粘贴整房/.test(await page.locator('.room-title').textContent()),
      false,
    );
    assert.equal(await page.locator('.room-thumb-selector').count(), 1, 'thumbnail selector bar');
    result.instanceButtonsAbsent = true;

    // 2. Room properties apply as you type: data updates, focus and zoom stay.
    const zoomText = await page.locator('#room-zoom').textContent();
    const newName = '即时命名-' + Math.floor(Math.random() * 1e5);
    await page.locator('#room-name').fill(newName);
    await page.waitForFunction(
      (id) =>
        window.__ROOM_LAB__
          .snapshot()
          .project.courses.flatMap((c) => c.rooms)
          .some((r) => r.id === id && r.name === document.querySelector('#room-name')?.value),
      first.id,
      { timeout: 5000 },
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'room-name',
      'focus stays in the edited field',
    );
    assert.equal(await page.locator('#room-zoom').textContent(), zoomText, 'canvas zoom unchanged');
    // Half-typed / invalid size never reaches the project.
    const beforeCols = roomOf(await project(), first.id).room.cols;
    await page.locator('#room-cols').fill('');
    await page.waitForTimeout(200);
    assert.equal(roomOf(await project(), first.id).room.cols, beforeCols);
    result.liveRoomSettings = true;

    // Same field edited twice in a row collapses into one undo step: a single
    // Ctrl+Z must return to the value from before the burst, not the first edit.
    const notesBefore = roomOf(await project(), first.id).room.notes || '';
    await page.locator('#room-notes').fill('合并撤销-A');
    await page.waitForTimeout(650);
    await page.locator('#room-notes').fill('合并撤销-B');
    await page.waitForTimeout(650);
    assert.equal(
      roomOf(await project(), first.id).room.notes,
      '合并撤销-B',
      'the second edit is applied',
    );
    await page.locator('#room-notes').blur();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    assert.equal(
      roomOf(await project(), first.id).room.notes || '',
      notesBefore,
      'one Ctrl+Z restores the value from before the burst',
    );
    result.liveUndoMerge = true;

    // 3. Playtest inventory: switching to explicit + ticking an item is immediate.
    await page.locator('#room-playtest-mode').selectOption('explicit');
    const box = page.locator('[data-playtest-item]').first();
    const itemType = await box.getAttribute('data-playtest-item');
    await box.check();
    await page.waitForFunction(
      ({ id, type }) =>
        window.__ROOM_LAB__
          .snapshot()
          .project.courses.flatMap((c) => c.rooms)
          .some(
            (r) => r.id === id && Array.isArray(r.playtestItems) && r.playtestItems.includes(type),
          ),
      { id: first.id, type: itemType },
      { timeout: 5000 },
    );
    result.playtestImmediate = true;

    // 4. Marquee selection → Ctrl+C / Ctrl+V → new IDs, internal refs, undo.
    // The marquee is drawn over interior cells only, so the pasted copy steps
    // one cell diagonally and still fits inside the room.
    const beforeRoom = roomOf(await project(), first.id).room;
    const marqueePaste = async (l, t, r, b) => {
      const box = await page.locator('#room-canvas').boundingBox();
      await page.locator('[data-tool="marquee"]').click();
      await page.mouse.move(box.x + box.width * l, box.y + box.height * t);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * r, box.y + box.height * b, { steps: 14 });
      await page.mouse.up();
      const selected = await snap();
      if (!((selected.state.multiSelection || []).length || selected.state.selection)) return 0;
      await page.keyboard.press('Control+c');
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(250);
      const room = roomOf(await project(), first.id).room,
        oldIds = new Set(
          beforeRoom.objects.concat(beforeRoom.movables, beforeRoom.zones).map((o) => o.id),
        );
      return room.objects.concat(room.movables, room.zones).filter((o) => !oldIds.has(o.id));
    };
    let newItems = await marqueePaste(0.25, 0.25, 0.75, 0.75);
    if (!newItems.length) newItems = await marqueePaste(0.1, 0.1, 0.9, 0.9);
    assert.ok(
      newItems.length > 0,
      'paste created new items: ' + (await page.locator('#status').textContent()),
    );
    const afterRoom = roomOf(await project(), first.id).room;
    assert.equal(new Set(newItems.map((o) => o.id)).size, newItems.length, 'new IDs are unique');
    const oldIds = new Set(
      beforeRoom.objects.concat(beforeRoom.movables, beforeRoom.zones).map((o) => o.id),
    );
    const pastedIds = new Set(newItems.map((o) => o.id));
    for (const item of newItems)
      for (const key of ['padId', 'zoneId', 'attachmentTo'])
        if (item[key])
          assert.ok(
            pastedIds.has(item[key]) || !oldIds.has(item[key]),
            `${key} must be remapped inside the copy or dropped, not point at the old item`,
          );
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    assert.equal(
      roomOf(await project(), first.id).room.objects.length,
      beforeRoom.objects.length,
      'undo removes the pasted copy',
    );
    result.selectionClipboard = true;

    // 5. Ownership in the top bar + thumbnail bar across legacy containers.
    await page.locator('#crumb-project').click();
    await page.locator('#graph').waitFor();
    assert.equal((await snap()).state.planningTab, 'map', '项目 returns to the route map');
    await page.locator('#planning-tab-library').click();
    await page.locator(`[data-room-card="${first.id}"]`).click();
    await page.locator(`[data-room-card="${foreign.id}"]`).click({ modifiers: ['Control'] });
    await page.locator('#group-new').click();
    await page.locator('#group-name-input').fill('跨容器归属');
    await page.locator('#dialog-actions').getByRole('button', { name: '保存' }).click();
    const grouped = await org();
    assert.equal(grouped.groups.length, 1);
    const group = grouped.groups[0];
    await page.locator('#planning-tab-map').click();
    await page.locator(`[data-strip-room="${first.id}"]`).dblclick();
    await page.locator('#room-canvas').waitFor();
    assert.equal((await page.locator('#crumb-owner').textContent()).trim(), group.name);
    assert.equal(
      (await page.locator(`[data-nav-room="${first.id}"] .room-thumb-owner`).textContent()).trim(),
      group.name,
      'thumbnail ownership shows the user group, not the course',
    );
    await page.locator('#crumb-owner').click();
    assert.equal(await page.locator('[data-nav-room]').count(), 2, 'owner click filters the strip');
    assert.equal(await page.locator(`[data-room-filter="group:${group.id}"].active`).count(), 1);
    await page.locator(`[data-nav-room="${foreign.id}"]`).click();
    assert.equal((await snap()).state.roomId, foreign.id);
    assert.equal((await snap()).state.courseId, otherCourse.id, 'crosses the legacy container');
    assert.equal((await page.locator('#crumb-owner').textContent()).trim(), group.name);
    // Ungrouped room → 未分组 label and the all-rooms view.
    await page.locator('[data-room-filter="all"]').click();
    const ungrouped = rooms.find((r) => !group.roomIds.includes(r.id));
    await page.locator(`[data-nav-room="${ungrouped.id}"]`).click();
    assert.equal((await page.locator('#crumb-owner').textContent()).trim(), '未分组');
    await page.locator('#crumb-owner').click();
    assert.equal(await page.locator('[data-nav-room]').count(), rooms.length);
    result.ownershipNavigation = true;

    // 6. Cross-container wire really created through a port drag, then reloaded.
    await page.locator('#crumb-project').click();
    await page.locator('#graph').waitFor();
    assert.equal((await snap()).state.planningTab, 'map');
    const ports = await page.evaluate(() => window.__ROOM_LAB__.wiringPorts());
    const source = ports.places.find((p) => p.roomId === first.id);
    const target = ports.places.find((p) => p.courseId === otherCourse.id);
    assert.ok(source?.exits.length && target?.entries.length, 'both rooms expose ports');
    const contentSize = async () =>
      useElectron
        ? electronApp.evaluate(({ BrowserWindow }) => {
            const [width, height] = BrowserWindow.getAllWindows()[0].getContentSize();
            return { width, height };
          })
        : page.viewportSize();
    const setContent = async (size) => {
      if (useElectron)
        await electronApp.evaluate(
          ({ BrowserWindow }, value) =>
            BrowserWindow.getAllWindows()[0].setContentSize(value.width, value.height),
          size,
        );
      else await page.setViewportSize(size);
      // A fixed Emulation viewport override from the DPR setup does NOT follow
      // BrowserWindow.setContentSize. Keep the emulated viewport in sync so the
      // ResizeObserver still sees a real layout resize instead of a no-op.
      if (metrics)
        await metrics
          .send('Emulation.setDeviceMetricsOverride', {
            width: size.width,
            height: size.height,
            deviceScaleFactor: dpr,
            mobile: false,
          })
          .catch(() => {});
    };
    const graphBox = await page.locator('#graph').boundingBox();
    // The world view is CSS-space: convert through the returned CSS size and the
    // actual CSS box, never by assuming backing pixels equal the layout box.
    assert.ok(ports.cssWidth > 0 && ports.cssHeight > 0, 'hook returns the CSS canvas size');
    assert.equal(ports.backingWidth, Math.round(ports.cssWidth * ports.dpr));
    assert.equal(ports.backingHeight, Math.round(ports.cssHeight * ports.dpr));
    assert.ok(Math.abs(graphBox.width - ports.cssWidth) <= 1.5, 'CSS box matches hook size');
    // Real layout resize: ResizeObserver must re-measure the CSS box and the
    // backing store, and the hook must keep reporting the new CSS size.
    const sizeBefore = await contentSize();
    let resizeObserved = false,
      dprChangeObserved = false;
    try {
      await setContent({
        width: Math.max(900, sizeBefore.width - 260),
        height: Math.max(680, sizeBefore.height - 140),
      });
      await page.waitForFunction(
        (width) => {
          const canvas = document.querySelector('#graph');
          return (
            canvas &&
            Number(canvas.dataset.cssWidth) !== width &&
            Math.abs(canvas.getBoundingClientRect().width - Number(canvas.dataset.cssWidth)) <= 1
          );
        },
        ports.cssWidth,
        { timeout: 5000 },
      );
      const resized = await page.evaluate(() => {
        const canvas = document.querySelector('#graph');
        return {
          cssWidth: Number(canvas.dataset.cssWidth),
          cssHeight: Number(canvas.dataset.cssHeight),
          dpr: Number(canvas.dataset.dpr),
          backingWidth: canvas.width,
          backingHeight: canvas.height,
          rect: canvas.getBoundingClientRect(),
        };
      });
      assert.notEqual(resized.cssWidth, ports.cssWidth, 'resize changed the CSS width');
      assert.equal(resized.backingWidth, Math.round(resized.cssWidth * resized.dpr));
      assert.ok(
        Math.abs(resized.rect.width - resized.cssWidth) <= 1,
        'no bitmap stretch after resize',
      );
      const afterResize = await page.evaluate(() => window.__ROOM_LAB__.wiringPorts());
      assert.equal(afterResize.cssWidth, resized.cssWidth, 'hook follows the resized CSS box');
      resizeObserved = true;
    } finally {
      await setContent(sizeBefore);
    }    // Real DPR change: the canvas is re-prepared at the new ratio while the CSS
    // view transform and port coordinates stay unchanged.
    const cdp = await page
      .context()
      .newCDPSession(page)
      .catch(() => null);
    if (cdp)
      try {
        const viewport = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 3,
          mobile: false,
        });
        await page.waitForFunction(
          () => Number(document.querySelector('#graph')?.dataset.dpr) > 2,
          null,
          { timeout: 5000 },
        );
        const high = await page.evaluate(() => {
          const canvas = document.querySelector('#graph');
          return {
            dpr: Number(canvas.dataset.dpr),
            cssWidth: Number(canvas.dataset.cssWidth),
            backingWidth: canvas.width,
            rectWidth: canvas.getBoundingClientRect().width,
          };
        });
        assert.ok(high.dpr > 2 && high.dpr <= 3, 'graph canvas re-prepared at the new DPR');
        assert.equal(high.backingWidth, Math.round(high.cssWidth * high.dpr));
        assert.ok(Math.abs(high.rectWidth - high.cssWidth) <= 1);
        dprChangeObserved = true;
      } finally {
        const viewport = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        await cdp
          .send('Emulation.setDeviceMetricsOverride', {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 2,
            mobile: false,
          })
          .catch(() => {});
        await page.waitForTimeout(200);
      }
    result.resizeObserver = resizeObserved;
    result.dprChange = dprChangeObserved;
    // Re-read after the real resize/DPR round trip so the drag uses the live
    // CSS box; the hook geometry itself must stay in the same CSS space.
    const livePorts = await page.evaluate(() => window.__ROOM_LAB__.wiringPorts());
    const liveBox = await page.locator('#graph').boundingBox();
    const liveClient = (node) => ({
      x:
        liveBox.x +
        ((livePorts.view.x + node.x * livePorts.view.scale) * liveBox.width) / livePorts.cssWidth,
      y:
        liveBox.y +
        ((livePorts.view.y + node.y * livePorts.view.scale) * liveBox.height) / livePorts.cssHeight,
    });
    const liveSource = livePorts.places.find((p) => p.roomId === first.id),
      liveTarget = livePorts.places.find((p) => p.courseId === otherCourse.id);
    const fromPoint = liveClient(liveSource.exits[0]),
      toPoint = liveClient(liveTarget.entries[0]);
    const sourceKey = first.id + '/' + source.exits[0].id;
    const originOf = (w) => w.from.roomId + '/' + w.from.exitId;
    const linksBefore = await page.evaluate(() => window.__ROOM_LAB__.mapConnections().length);
    const previous = (await page.evaluate(() => window.__ROOM_LAB__.mapConnections())).find(
      (w) => originOf(w) === sourceKey,
    );
    await page.mouse.move(fromPoint.x, fromPoint.y);
    await page.mouse.down();
    await page.mouse.move(toPoint.x, toPoint.y, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const links = await page.evaluate(() => window.__ROOM_LAB__.mapConnections());
    // The dragged exit keeps exactly one wire. When the starter project already
    // wired that exit, dropping the drag onto another room must replace the old
    // wire (total count unchanged); when it was free, a wire is really added.
    const wired = links.find((w) => originOf(w) === sourceKey);
    assert.ok(
      wired,
      'the dragged exit has a wire: ' + (await page.locator('#status').textContent()),
    );
    assert.equal(wired.to.roomId, target.roomId, 'the wire targets the dragged room');
    assert.equal(wired.to.entryId, target.entries[0].id, 'the wire lands on the dragged entry');
    assert.equal(
      links.filter((w) => originOf(w) === sourceKey).length,
      1,
      'one wire per exit: no duplicate origin',
    );
    if (previous)
      assert.ok(
        previous.to.roomId !== wired.to.roomId || previous.to.entryId !== wired.to.entryId,
        'the old wire from that exit was replaced by the new target',
      );
    else assert.ok(links.length > linksBefore, 'a free exit really adds a wire (count grows)');
    assert.equal(wired.source, 'map', 'cross-container wiring lives in the unified map layer');
    const cross = links.find((w) => w.from.roomId === first.id && w.to.roomId === target.roomId);
    assert.ok(cross, 'cross-container wire exists in the unified map layer');
    await page.screenshot({ path: path.join(root, 'test-output/unified-map-wiring.png') });
    // Survives a reload (local draft), and the same rooms still resolve.
    await page.reload();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    const reloadedLinks = await page.evaluate(() => window.__ROOM_LAB__.mapConnections());
    assert.ok(
      reloadedLinks.some((w) => originOf(w) === sourceKey && w.to.roomId === target.roomId),
      'the replaced cross-container wire persisted with its new target',
    );
    result.crossContainerWiring = true;

    // 7. Group colour is shared by map and edit page, and persists.
    await page
      .locator('#planning-tab-map')
      .click()
      .catch(() => {});
    await page.locator('#group-manage').click();
    await page.locator(`[data-group-color="${group.id}"]`).fill('#e7b867');
    await page.locator(`[data-group-color="${group.id}"]`).dispatchEvent('change');
    await page.locator('#dialog-actions button').first().click();
    const accent = await page.evaluate((id) => window.__ROOM_LAB__.mapAccent(id), first.id);
    assert.equal(accent, '#e7b867', 'map uses the custom group colour');
    await page.reload();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    assert.equal((await org()).groups[0].color, '#e7b867', 'custom colour is saved and read back');
    assert.equal(
      await page.evaluate((id) => window.__ROOM_LAB__.mapAccent(id), first.id),
      '#e7b867',
    );
    await page.locator(`[data-strip-room="${first.id}"]`).dblclick();
    await page.locator('#room-canvas').waitFor();
    const cardColor = await page
      .locator(`[data-nav-room="${first.id}"]`)
      .evaluate((el) => el.style.getPropertyValue('--group-color').trim());
    assert.equal(cardColor.toLowerCase(), '#e7b867', 'edit page thumbnail uses the same colour');
    result.groupColorShared = true;

    // 8. 2x DPR: backing store, layout and pointer → cell mapping.
    await page.waitForTimeout(300);
    const dprState = await page.evaluate(() => {
      const canvas = document.querySelector('#room-canvas'),
        wrap = canvas.closest('.canvas-wrap') || canvas.parentElement,
        data = {
          dpr: window.devicePixelRatio,
          datasetDpr: Number(canvas.dataset.dpr),
          cssWidth: Number(canvas.dataset.cssWidth),
          cssHeight: Number(canvas.dataset.cssHeight),
          backingWidth: canvas.width,
          backingHeight: canvas.height,
          rect: canvas.getBoundingClientRect(),
          wrapWidth: wrap.getBoundingClientRect().width,
        };
      return data;
    });
    assert.ok(dprState.dpr >= 2, 'real 2x device pixel ratio');
    assert.equal(dprState.datasetDpr, 2, 'the editor prepares canvases at 2x');
    assert.equal(dprState.backingWidth, Math.round(dprState.cssWidth * dprState.datasetDpr));
    assert.equal(dprState.backingHeight, Math.round(dprState.cssHeight * dprState.datasetDpr));
    assert.ok(
      dprState.rect.width <= dprState.wrapWidth + 2,
      'no giant canvas / no clipping: CSS box stays inside its container',
    );
    // Pointer mapping at 2x: the middle of the canvas must be the middle cell of
    // the room (the fit transform centres it). The old bug mapped client pixels
    // through canvas.width, which at 2x would land far outside the room.
    const room = roomOf(await project(), first.id).room;
    await page.locator('[data-tool="select"]').click();
    await page.waitForTimeout(120);
    const canvasBox = await page.locator('#room-canvas').boundingBox();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2, {
      steps: 4,
    });
    await page.waitForTimeout(150);
    const pointer = await page.locator('#room-pointer').textContent();
    const match = /X\s*(-?\d+)\s*\/\s*Y\s*(-?\d+)/.exec(pointer);
    assert.ok(match, 'pointer readout shows a cell: ' + pointer);
    const cx = Number(match[1]),
      cy = Number(match[2]);
    assert.ok(Math.abs(cx - room.cols / 2) <= 3, `pointer X ${cx} near ${room.cols / 2}`);
    assert.ok(Math.abs(cy - room.rows / 2) <= 3, `pointer Y ${cy} near ${room.rows / 2}`);
    result.dprPointer = true;

    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result));
  } finally {
    if (electronApp) await electronApp.close();
    else if (browser) await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
