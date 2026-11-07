'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  G = require('../src/editor/graph-layout.cjs'),
  Registry = require('../src/plugins/registry.cjs');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  { fixture } = require('./helpers/native-fixture.cjs');
(async () => {
  const { p, c, r } = fixture();
  c.rooms.forEach((r) => (r.graph = { x: 0, y: 0 }));
  r.tiles = [];
  r.movables = [];
  r.nativeCampaign.patrols = [];
  r.nativeCampaign.signs = [];
  const pad = Registry.instantiate(p, 'calculus.integral', 'test-integral', 1, 12, c);
  pad.rework = { switch: 'alpha', value: true };
  const derivative = Registry.instantiate(p, 'calculus.derivative', 'test-derivative', 3, 12, c);
  derivative.rework = { switch: 'alpha', value: false };
  r.objects = [pad, derivative];
  r.nativeCampaign.platforms = [
    { id: 'brick-a', x: 6, y: 7, w: 1, h: 1, toX: 10, toY: 8, seconds: 1 },
    { id: 'brick-b', x: 9, y: 7, w: 1, h: 1 },
  ];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'room-integrated-')), 'level.json');
  fs.writeFileSync(file, JSON.stringify(p));
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot()),
      course = async () => (await snap()).project.courses.find((x) => x.id === c.id),
      room = async () => (await course()).rooms[0];
    await page.locator('#project-file').setInputFiles(file);
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.nativeCampaign?.unknown?.preserve === 17,
    );
    await page.locator('[data-enter="' + c.id + '"]').click();
    assert.equal(G.overlaps((await course()).rooms), false);
    assert.deepEqual((await course()).connections, c.connections);
    await page.locator('#graph-undo').click();
    assert.equal(G.overlaps((await course()).rooms), true);
    await page.locator('#graph-redo').click();
    assert.equal(G.overlaps((await course()).rooms), false);
    const graph = await page.locator('#graph').boundingBox();
    assert.ok(
      graph.y + graph.height <= (await page.evaluate(() => window.innerHeight)),
      'Graph fits visible viewport',
    );
    await page.mouse.move(graph.x + graph.width / 2, graph.y + graph.height / 2);
    await page.mouse.wheel(0, 150);
    const state = await snap(),
      v = state.state.graphView,
      card = (await course()).rooms[0],
      center = { x: card.graph.x + 30, y: card.graph.y + 15 };
    const attrs = await page.locator('#graph').evaluate((e) => ({ w: e.width, h: e.height }));
    const pos = (x, y) => [
      graph.x + ((x * v.scale + v.x) * graph.width) / attrs.w,
      graph.y + ((y * v.scale + v.y) * graph.height) / attrs.h,
    ];
    await page.mouse.move(...pos(center.x, center.y));
    await page.mouse.down();
    await page.mouse.move(...pos(center.x - 80, center.y), { steps: 4 });
    await page.mouse.up();
    assert.ok((await course()).rooms[0].graph.x < 0);
    assert.deepEqual((await snap()).state.graphView, v);
    await page.locator('#graph-arrange').click();
    assert.equal(G.overlaps((await course()).rooms), false);
    await page.locator('[data-tab="rooms"]').click();
    await page.locator('[data-room="' + r.id + '"]').click();
    const point = async (x, y) => {
      const b = await page.locator('#room-canvas').boundingBox(),
        v = (await snap()).state.roomView;
      return [b.x + v.x + x * 32 * v.scale, b.y + v.y + y * 32 * v.scale];
    };
    const click = async (x, y, button = 'left') =>
      page.mouse.click(...(await point(x, y)), { button });
    await click(1.5, 12.5);
    await page.locator('#native-quick-bind').waitFor();
    await click(6.5, 7.5, 'right');
    assert.equal((await room()).nativeCampaign.platforms[0].switch, 'alpha');
    await click(6.5, 7.5, 'right');
    assert.equal((await room()).nativeCampaign.platforms[0].switch, undefined);
    await page.mouse.move(...(await point(5.5, 6.5)));
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(...(await point(10.5, 8.5)), { steps: 4 });
    await page.mouse.up({ button: 'right' });
    assert.ok((await room()).nativeCampaign.platforms.every((b) => b.switch === 'alpha'));
    await click(3.5, 12.5);
    assert.equal((await room()).objects[1].rework.value, false);
    await click(9.5, 7.5, 'right');
    assert.equal((await room()).nativeCampaign.platforms[1].switch, undefined);
    await click(6.5, 7.5);
    assert.equal(await page.locator('#room-inspector h2').innerText(), '机关砖');
    await click(13.5, 6.5, 'right');
    assert.equal((await room()).nativeCampaign.platforms[0].toX, 13.5);
    await page.locator('#native-node-place').click();
    await click(14.5, 6.5);
    assert.equal((await snap()).state.tool, 'select');
    assert.equal((await room()).nativeCampaign.platforms[0].toX, 14.5);
    await page.locator('.block-card[data-tool="movable"]').click();
    await click(18.5, 7.5);
    assert.equal((await room()).nativeCampaign.platforms.length, 3);
    assert.equal((await room()).movables.length, 0);
    if (process.env.NATIVE_PROJECT) {
      await page.locator('#project-file').setInputFiles(process.env.NATIVE_PROJECT);
      await page.waitForFunction(
        () => window.__ROOM_LAB__.snapshot().project.courses.flatMap((c) => c.rooms).length === 32,
      );
      const current = (await snap()).project;
      for (const course of current.courses) {
        await page.locator('[data-enter="' + course.id + '"]').click();
        await page.locator('[data-tab="graph"]').click();
        const loaded = (await snap()).project.courses.find((c) => c.id === course.id);
        assert.equal(G.overlaps(loaded.rooms), false);
        assert.deepEqual(loaded.connections, course.connections);
        if (process.env.GRAPH_SCREENSHOT && course.kind === 'calculus')
          await page.screenshot({ path: process.env.GRAPH_SCREENSHOT });
        await page.locator('#crumb-project').click();
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS integrated calculus binding / batch toggle / two-state nodes / native placement / graph arrange undo center negative drag zoom',
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
