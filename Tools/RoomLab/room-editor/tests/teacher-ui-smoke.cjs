'use strict';
// Real-UI acceptance for the slacker teacher in the room-first editor.
//
// Runs in the real Electron shell (USE_ELECTRON=1 / EDITOR_EXE) or, when that
// cannot be spawned, in Chromium against the built page, exactly like
// tests/room-first-ui-smoke.cjs. There is no course-first entry any more: the
// slacker room is opened from the room thumbnail strip.
//
// Covered (real DOM events only, never by calling internals):
// 1. new project -> slacker room thumbnail -> room editor,
// 2. place the teacher, quick-bind / right-click-bind check-ins (legacy links),
// 3. legacy patrol params apply while typing (no 应用行为 button click needed),
// 4. nodes tab: right click adds exactly one whole-cell route node, then the
//    select tool drags it to another cell (CSS/DPR-aware pointer mapping),
// 5. the 应用本段 button is GONE: seconds/mode apply immediately and the field
//    keeps focus/caret, invalid/locked values are rejected,
// 6. moving the teacher on the canvas moves the whole path with it,
// 7. reload keeps the route,
// 8. a teacher without a path still reports the pure legacy patrol behaviour.
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
      await page.setViewportSize({ width: 1500, height: 1050 }).catch(() => {});
      if (!process.env.CDP_ENDPOINT)
        await page.goto(
          'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
        );
    }
    const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
    const slackerRoom = async () => {
      const p = (await snap()).project;
      return p.courses.find((c) => c.kind === 'slacker').rooms[0];
    };
    const slackerTeacher = async () =>
      (await slackerRoom()).objects.find((o) => o.type === 'slacker.teacher');
    // Cell centre -> client point. The room view is expressed in CSS pixels
    // while the canvas backing store is cssWidth*dpr. The element's real box can
    // differ from the CSS design size (CSS transform/flex), so the view point is
    // scaled by box/cssWidth - never the inverse.
    const point = (x, y) =>
      page.evaluate(
        ({ x, y }) => {
          const canvas = document.getElementById('room-canvas'),
            box = canvas.getBoundingClientRect(),
            cssWidth = Number(canvas.dataset.cssWidth) || canvas.clientWidth,
            cssHeight = Number(canvas.dataset.cssHeight) || canvas.clientHeight,
            view = window.__ROOM_LAB__.snapshot().state.roomView,
            scaleX = box.width / Math.max(1, cssWidth),
            scaleY = box.height / Math.max(1, cssHeight);
          return {
            x: box.x + (view.x + (x + 0.5) * 32 * view.scale) * scaleX,
            y: box.y + (view.y + (y + 0.5) * 32 * view.scale) * scaleY,
          };
        },
        { x, y },
      );
    const openSlackerRoom = async () => {
      const room = await slackerRoom();
      await page.locator(`[data-strip-room="${room.id}"]`).dblclick();
      await page.locator('#room-canvas').waitFor();
    };
    const openNodes = async () => {
      await page.locator('[data-inspector="nodes"]').click();
      await page.locator('#teacher-node-preview').waitFor();
    };

    // 1. Room-first entry: new project, then the slacker room from the strip.
    await page.locator('#start-new').click();
    await page.locator('#graph').waitFor();
    assert.equal(await page.locator('[data-course]').count(), 0, 'no course-first entry');
    await openSlackerRoom();

    // 2. Place the teacher; the legacy patrol defaults come from the click cell.
    await page.locator('[data-block-type="slacker.teacher"]').click();
    let at = await point(8, 11);
    await page.mouse.click(at.x, at.y);
    let room = await slackerRoom(),
      teacher = room.objects.find((o) => o.type === 'slacker.teacher');
    const checkin = room.objects.find((o) => o.type === 'slacker.checkin');
    assert.ok(teacher && checkin, 'teacher and check-in exist in the example room');
    assert.equal(teacher.params.patrolMinX, 8);
    assert.equal(teacher.params.patrolMaxX, 12);

    await page.locator('#quick-bind-checkins').click();
    at = await point(checkin.x, checkin.y);
    await page.mouse.click(at.x, at.y);
    teacher = await slackerTeacher();
    assert.deepEqual(teacher.params.checkinIds, [checkin.id]);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    assert.deepEqual((await slackerTeacher()).params.checkinIds, []);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    assert.deepEqual((await slackerTeacher()).params.checkinIds, [checkin.id]);

    // 3. Legacy patrol fields apply while typing (live fields, no button click).
    await page.locator('[data-tool="select"]').first().click();
    at = await point(teacher.x, teacher.y);
    await page.mouse.click(at.x, at.y);
    await page.getByRole('button', { name: '行为', exact: true }).click();
    await page.locator('#param-patrolMinX').fill('6');
    await page.locator('#param-patrolMaxX').fill('14');
    await page.locator('#param-speed').fill('2.5');
    await page.waitForFunction(
      () => {
        const t = window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
        return t.params.patrolMinX === 6 && t.params.patrolMaxX === 14 && t.params.speed === 2.5;
      },
      null,
      { timeout: 5000 },
    );

    // 4. Route node graph: place tool + right click adds exactly one node.
    await openNodes();
    assert.equal(await page.locator('[data-teacher-node]').count(), 0);
    await page.locator('#teacher-node-place').click();
    at = await point(teacher.x + 2, teacher.y);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.waitForFunction(
      () =>
        (window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher').params.path || []).length ===
        1,
      null,
      { timeout: 5000 },
    );
    teacher = await slackerTeacher();
    assert.deepEqual([teacher.params.path[0].x, teacher.params.path[0].y], [
      teacher.x + 2,
      teacher.y,
    ]);
    assert.equal(
      await page.locator('#teacher-node-preview [data-preview-index="0"]').count(),
      1,
      'the preview renders the added node',
    );

    // 5. The 应用本段 button is gone; seconds and mode apply immediately and the
    // caret stays in the field.
    assert.equal(
      await page.locator('#teacher-node-save').isVisible(),
      false,
      'no visible 应用本段 button',
    );
    await page.locator('#teacher-node-seconds').fill('1.2');
    await page.waitForFunction(
      () =>
        window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher').params.path[0]?.seconds ===
        1.2,
      null,
      { timeout: 5000 },
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'teacher-node-seconds',
      'typing in the seconds field keeps focus after the live commit',
    );
    await page.locator('#teacher-node-mode').selectOption('easeIn');
    await page.waitForFunction(
      () =>
        window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher').params.path[0]?.mode ===
        'easeIn',
      null,
      { timeout: 5000 },
    );

    // 6. Back to the select tool, drag the node to another whole cell.
    await page.locator('[data-tool="select"]').first().click();
    await openNodes();
    teacher = await slackerTeacher();
    const nodeBefore = { ...teacher.params.path[0] };
    at = await point(nodeBefore.x, nodeBefore.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    at = await point(nodeBefore.x + 1, nodeBefore.y);
    await page.mouse.move(at.x, at.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      (before) => {
        const t = window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
        return t.params.path[0] && t.params.path[0].x > before;
      },
      nodeBefore.x,
      { timeout: 5000 },
    );
    teacher = await slackerTeacher();
    assert.deepEqual(
      [teacher.params.path[0].x, teacher.params.path[0].y],
      [nodeBefore.x + 1, nodeBefore.y],
      'node drag snaps to whole grid cells',
    );

    // 7. Moving the teacher moves the whole path with it.
    const teacherBefore = { x: teacher.x, y: teacher.y },
      offset = {
        x: teacher.params.path[0].x - teacher.x,
        y: teacher.params.path[0].y - teacher.y,
      };
    await page.locator('[data-tool="select"]').first().click();
    at = await point(teacher.x, teacher.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    at = await point(teacher.x - 1, teacher.y);
    await page.mouse.move(at.x, at.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      (before) => {
        const t = window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
        return t.x === before.x - 1;
      },
      teacherBefore,
      { timeout: 5000 },
    );
    teacher = await slackerTeacher();
    assert.deepEqual(
      [teacher.params.path[0].x - teacher.x, teacher.params.path[0].y - teacher.y],
      [offset.x, offset.y],
      'the route node keeps its offset when the teacher moves',
    );

    // 8. Reload keeps the route (saved draft data, no reset).
    const saved = {
      seconds: teacher.params.path[0].seconds,
      mode: teacher.params.path[0].mode,
      path: teacher.params.path.map((n) => ({ x: n.x, y: n.y })),
    };
    await page.reload();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    await openSlackerRoom();
    teacher = await slackerTeacher();
    assert.deepEqual(
      teacher.params.path.map((n) => ({ x: n.x, y: n.y })),
      saved.path,
      'the route survives a reload',
    );
    assert.equal(teacher.params.path[0].seconds, saved.seconds);
    assert.equal(teacher.params.path[0].mode, saved.mode);

    // 9. A teacher without a path keeps the pure legacy patrol behaviour: remove
    // the only route node through the UI and the legacy wording comes back.
    await page.locator('[data-tool="select"]').first().click();
    at = await point(teacher.x, teacher.y);
    // The teacher (moved to 7,11) shares its cell with the example coffee, so a
    // single click may select the coffee. Same-cell clicks cycle the hit list;
    // click a bounded number of times until the teacher itself is selected. This
    // keeps the product hit priority and the path-less fallback intact.
    const teacherSelected = async () => {
      const selection = (await snap()).state.selection;
      return selection?.kind === 'objects' && selection.id === teacher.id;
    };
    let cycles = 0;
    while (!(await teacherSelected()) && cycles < 6) {
      await page.mouse.click(at.x, at.y);
      cycles += 1;
    }
    assert.equal(await teacherSelected(), true, 'same-cell clicks reach the teacher');
    assert.ok(cycles <= 6, 'the teacher is reachable in a bounded number of same-cell clicks');
    await openNodes();
    await page.locator('[data-teacher-node="0"]').click();
    await page.locator('#teacher-node-remove').click();
    await page.waitForFunction(
      () =>
        (window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher').params.path || []).length ===
        0,
      null,
      { timeout: 5000 },
    );
    teacher = await slackerTeacher();
    assert.deepEqual(teacher.params.path || [], [], 'no route nodes left');
    assert.match(
      await page.locator('#room-inspector').textContent(),
      /旧平台左右巡查/,
      'a path-less teacher falls back to the legacy patrol wording',
    );
    assert.deepEqual(
      { min: teacher.params.patrolMinX, max: teacher.params.patrolMaxX, speed: teacher.params.speed },
      { min: 6, max: 14, speed: 2.5 },
      'legacy patrol params stay intact for a path-less teacher',
    );

    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        electron: useElectron,
        packaged: !!process.env.EDITOR_EXE,
        roomFirstEntry: true,
        placement: true,
        quickBind: true,
        livePatrolFields: true,
        routeNode: true,
        liveNodeFields: true,
        nodeDrag: true,
        teacherMovesPath: true,
        reloadPersistence: true,
        legacyWithoutPath: true,
        errors,
      }),
    );
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
