'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  M = require('../src/project/model.cjs'),
  { Engine } = require('../src/runtime/engine.cjs'),
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
      return project.courses.find((course) => course.kind === 'physics').rooms[0];
    };
    const point = async (x, y) => {
      const box = await page.locator('#room-canvas').boundingBox(),
        view = (await snapshot()).state.roomView;
      return [
        box.x + view.x + (x + 0.5) * 32 * view.scale,
        box.y + view.y + (y + 0.5) * 32 * view.scale,
      ];
    };

    await page.locator('#start-new').click();
    await page.locator('[data-enter="physics"]').click();
    await page.locator('[data-tab="rooms"]').click();
    await page.locator('[data-room]').first().click();
    const card = page.locator('.block-card[data-block-type="common.assignmentSubmit"]');
    await card.waitFor();
    assert.match(await card.innerText(), /提交作业/);
    assert.equal(await card.locator('img').count(), 1);
    await card.click();
    await page.mouse.click(...(await point(7, 8)));
    const placed = (await room()).objects.at(-1);
    assert.equal(placed.type, 'common.assignmentSubmit');
    assert.equal(placed.name, '提交作业');
    assert.equal(placed.trigger.mode, 'foot');
    assert.equal(placed.params.once, true);
    assert.match(await page.locator('#room-inspector').innerText(), /提交作业/);
    const behavior = electronApp
      ? await electronApp.evaluate(({ app }) => {
          const root = app.getAppPath(),
            require = process.getBuiltinModule('module').createRequire(root + '/package.json'),
            Engine = require(root + '/src/runtime/engine.cjs').Engine,
            M = require(root + '/src/project/model.cjs'),
            p = M.example(),
            r = p.courses[0].rooms[0],
            o = M.object('submit-behavior', 'common.assignmentSubmit', 2, 12);
          o.collision = false;
          r.aiPolicy = 'inherit';
          r.objects = [o];
          const g = new Engine(p);
          Object.assign(g.player, { x: 67, y: 386, vx: 0, vy: 0, grounded: false });
          Object.assign(g.ai, { active: true, id: 'chase' });
          g.courseState.aiActive = true;
          g.update(1 / 120);
          return { score: g.score, aiActive: g.ai.active, courseAI: g.courseState.aiActive };
        })
      : (() => {
          const p = M.example(),
            r = p.courses[0].rooms[0],
            o = M.object('submit-behavior', 'common.assignmentSubmit', 2, 12);
          o.collision = false;
          r.aiPolicy = 'inherit';
          r.objects = [o];
          const g = new Engine(p);
          Object.assign(g.player, { x: 67, y: 386, vx: 0, vy: 0, grounded: false });
          Object.assign(g.ai, { active: true, id: 'chase' });
          g.courseState.aiActive = true;
          g.update(1 / 120);
          return { score: g.score, aiActive: g.ai.active, courseAI: g.courseState.aiActive };
        })();
    assert.deepEqual(behavior, { score: 50000, aiActive: false, courseAI: false });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        palette: true,
        placed: { id: placed.id, type: placed.type, name: placed.name },
        behavior,
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
