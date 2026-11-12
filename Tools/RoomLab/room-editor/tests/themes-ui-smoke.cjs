'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  // The sandbox blocks Playwright's --remote-debugging-pipe, so the harness can
  // attach to an already-running headless Edge over CDP (CDP_ENDPOINT).
  const browser = process.env.CDP_ENDPOINT
      ? await chromium.connectOverCDP(process.env.CDP_ENDPOINT)
      : await chromium.launch({ headless: true, channel: 'msedge' }),
    context = browser.contexts()[0] || (await browser.newContext()),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
  const menu = (name) => page.locator('[data-menu-trigger]', { hasText: name });
  async function leavePlay() {
    await page.locator('#home').click();
    const skip = page.getByRole('button', { name: '不保存并退出', exact: true });
    if (await skip.count()) await skip.click();
  }
  try {
    await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => {});
    await page.goto(
      'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
    );
    await page.waitForFunction(() => window.__ROOM_LAB__);
    await page.locator('#start-new').click();

    // Three theme courses on the default home page, with visible order + colour.
    assert.deepEqual(
      await page.locator('[data-kind]').evaluateAll((nodes) => nodes.map((n) => n.dataset.kind)),
      ['physics', 'calculus', 'slacker'],
    );
    assert.match(await page.locator('[data-course="calculus"] .theme-badge').textContent(), /2/);
    assert.match(await page.locator('[data-course="slacker"] .theme-badge').textContent(), /3/);
    assert.match(
      await page
        .locator('[data-course="calculus"] .course-card, [data-course="calculus"]')
        .first()
        .getAttribute('style'),
      /--theme-color/,
    );

    // Direct save + cloud stay visible; other actions live in colloquial menus.
    assert.equal(await page.locator('#save-project').isVisible(), true);
    assert.equal(await page.locator('#open-cloud').isVisible(), true);
    assert.equal(await page.locator('#open-definitions').isVisible(), false);
    await menu('工具').click();
    assert.equal(await page.locator('#open-definitions').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#open-definitions').isVisible(), false);

    // Keyboard access: Enter opens, arrows move focus, Esc closes and restores focus.
    await menu('项目').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#open-project').isVisible(), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-project');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#open-project').isVisible(), false);
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')),
      'menu-project',
    );
    await menu('项目').click();
    await page.mouse.click(700, 500);
    assert.equal(await page.locator('#open-project').isVisible(), false);

    // Ctrl+S keeps working while the 项目 menu is collapsed.
    await page.keyboard.press('Control+KeyS');
    await page.waitForFunction(
      () => document.querySelector('#status')?.textContent.includes('浏览器草稿已保存'),
      { timeout: 5000 },
    );

    // New courses can be created per theme without touching the existing ones.
    const before = (await snap()).project.courses;
    await page.locator('#add-course').click();
    assert.equal(await page.locator('[data-new-course-kind]').count(), 3);
    await page.locator('[data-new-course-kind="slacker"]').click();
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().project.courses.length === 4);
    const projects = (await snap()).project.courses;
    assert.equal(projects[3].kind, 'slacker');
    assert.deepEqual(projects.slice(0, 3), before);
    await leavePlay();

    // Every theme starter room exposes the unified mechanism palette and remains playable.
    const unifiedTools = [
      'physics.jet',
      'physics.ice',
      'physics.thermal',
      'physics.rail',
      'calculus.integral',
      'calculus.derivative',
      'slacker.checkin',
      'slacker.awake',
    ];
    const expectations = {
      physics: { tools: unifiedTools, absent: [], events: [] },
      calculus: {
        tools: unifiedTools,
        absent: [],
        events: ['calculus-integral', 'calculus-derivative'],
        won: true,
      },
      slacker: {
        tools: unifiedTools,
        absent: [],
        events: ['checkin', 'awake'],
        won: true,
      },
    };
    for (const [kind, want] of Object.entries(expectations)) {
      await page.locator('#home').click();
      await page.locator(`[data-course="${kind}"] [data-enter]`).click();
      await page.getByRole('button', { name: '房间列表', exact: true }).click();
      await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
      for (const type of want.tools) {
        assert.equal(await page.locator(`[data-block-type="${type}"]`).count(), 1, kind + ' tool');
        assert.equal(
          await page.locator(`[data-block-type="${type}"] img`).count(),
          1,
          kind + ' artwork / ' + type,
        );
      }
      for (const type of want.absent)
        assert.equal(await page.locator(`[data-block-type="${type}"]`).count(), 0, kind + ' leak');
      assert.equal(await page.locator('[data-tool="movable"]').count(), 1, kind + ' movable');
      assert.equal(await page.locator('[data-tool="zone"]').count(), 1, kind + ' thermal zone');
      await page.locator('#play-room').click();
      await page.keyboard.down('KeyD');
      await page.waitForFunction(
        ({ kind, won }) => {
          const g = window.__ROOM_LAB__.snapshot().game;
          if (!g) return false;
          return won ? g.mode === 'won' : g.player.x > 120;
        },
        { kind, won: !!want.won },
        { timeout: 20000, polling: 'raf' },
      );
      await page.keyboard.up('KeyD');
      const game = (await snap()).game;
      assert.equal(game.deaths, 0, kind + ' deaths');
      for (const event of want.events)
        assert.ok(
          game.events.some((e) => e.type === event),
          kind + ' missing event ' + event,
        );
      await leavePlay();
    }

    await page.locator('[data-enter="calculus"]').click();
    await page.locator('#add-room').click();
    const empty = (await snap()).project.courses.find((c) => c.id === 'calculus').rooms.at(-1);
    assert.equal(empty.entries.length, 1);
    for (const field of ['tiles', 'objects', 'movables', 'zones', 'exits'])
      assert.deepEqual(empty[field], [], field);
    await page.locator('#home').click();
    const beforeDelete = (await snap()).project;
    const courseMenu = () => page.locator('[data-course="calculus"]').click({ button: 'right' });
    await courseMenu();
    await page.locator('#delete-course').click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual((await snap()).project, beforeDelete);
    await courseMenu();
    await page.locator('#delete-course').click();
    await page.getByRole('button', { name: '确认删除大关', exact: true }).click();
    assert.equal(
      (await snap()).project.courses.some((c) => c.id === 'calculus'),
      false,
    );
    assert.deepEqual((await snap()).project.assets, beforeDelete.assets);
    await page.keyboard.press('Control+KeyZ');
    assert.deepEqual((await snap()).project, beforeDelete);

    // Narrow screens keep the collapsed top bar inside the viewport.
    await page.setViewportSize({ width: 700, height: 900 });
    await page.locator('#home').click();
    await menu('项目').click();
    assert.equal(await page.locator('#new-project').isVisible(), true);
    const box = await page.locator('#menu-project').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 701, 'menu panel inside viewport');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        themes: true,
        themeTools: true,
        playable: ['physics', 'calculus', 'slacker'],
        menuKeyboard: true,
        ctrlS: true,
        narrowScreen: true,
        emptyRoom: true,
        courseDeleteUndo: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
