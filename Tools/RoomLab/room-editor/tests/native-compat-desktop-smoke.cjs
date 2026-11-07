'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { fixture } = require('./helpers/native-fixture.cjs');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-editor-check-')),
    file = path.join(dir, 'project.json'),
    { p, c, r } = fixture();
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
    await page.locator('#project-file').setInputFiles(file);
    await page.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.nativeCampaign?.unknown?.preserve === 17,
    );
    await page.locator('[data-enter="' + c.id + '"]').click();
    await page.locator('[data-tab="rooms"]').click();
    await page.locator('[data-room="' + r.id + '"]').click();
    const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot()),
      room = async () =>
        (await snap()).project.courses.find((x) => x.id === c.id).rooms.find((x) => x.id === r.id);
    const point = async (x, y) => {
      const b = await page.locator('#room-canvas').boundingBox(),
        v = (await snap()).state.roomView;
      return [b.x + v.x + x * 32 * v.scale, b.y + v.y + y * 32 * v.scale];
    };
    const toolbar = await page.locator('.native-toolbar').boundingBox(),
      heading = await page.locator('.canvas-heading').boundingBox(),
      editorCanvas = await page.locator('#room-canvas').boundingBox();
    assert.ok(toolbar.height >= 40 && toolbar.y + toolbar.height <= heading.y + 1);
    assert.ok(heading.y + heading.height <= editorCanvas.y + 1);
    const click = async (x, y) => page.mouse.click(...(await point(x, y)));
    await click(3.7, 3.5);
    await page.locator('#native-apply').waitFor();
    assert.equal((await snap()).state.selection.kind, 'platforms');
    const before = (await room()).nativeCampaign.platforms[0],
      v = (await snap()).state.roomView;
    await page.mouse.move(...(await point(3.7, 3.5)));
    await page.mouse.down();
    await page.mouse.move(...(await point(4.7, 4.5)), { steps: 4 });
    await page.mouse.up();
    const moved = (await room()).nativeCampaign.platforms[0];
    assert.equal(moved.x, before.x + 1);
    assert.equal(moved.toX, before.toX + 1);
    assert.deepEqual((await snap()).state.roomView, v);
    await page.locator('#undo').click();
    assert.deepEqual((await room()).nativeCampaign.platforms[0], before);
    await click(3.7, 3.5);
    await page.locator('#native-w').fill('3');
    await page.locator('#native-apply').click();
    assert.equal((await room()).nativeCampaign.platforms[0].w, 3);
    await page.mouse.move(...(await point(6.5, 5.5)));
    await page.mouse.down();
    await page.mouse.move(...(await point(7.5, 6.5)), { steps: 4 });
    await page.mouse.up();
    assert.equal((await room()).nativeCampaign.platforms[0].toX, 7);
    await page.locator('#native-copy').click();
    assert.equal((await room()).nativeCampaign.platforms.length, 2);
    await page.locator('#native-delete').click();
    assert.equal((await room()).nativeCampaign.platforms.length, 1);
    await click(1.5, 2.55);
    assert.equal((await snap()).state.selection.kind, 'patrols');
    await page.mouse.move(...(await point(5.5, 2.55)));
    await page.mouse.down();
    await page.mouse.move(...(await point(6.5, 2.55)), { steps: 4 });
    await page.mouse.up();
    assert.equal((await room()).nativeCampaign.patrols[0].nodes[1].x, 6.5);
    await page.locator('#np-add').click();
    assert.equal((await room()).nativeCampaign.patrols[0].nodes.length, 3);
    await page.locator('[data-tool="native-signs"]').click();
    await click(10.5, 5.5);
    await page.locator('#native-text').fill('兼容标记');
    await page.locator('#native-apply').click();
    assert.equal((await room()).nativeCampaign.signs.at(-1).text, '兼容标记');
    await page.locator('#room-settings').click();
    await page.getByText('测试版 · 房间规则与短提示', { exact: true }).click();
    await page.locator('#nm-arrivalHint').fill('先看看纸桥');
    await page.locator('#nm-save').click();
    assert.equal((await room()).nativeCampaign.arrivalHint, '先看看纸桥');
    await page.locator('#play-room').click();
    await page.getByText('测试版关卡 · 试玩限制', { exact: true }).waitFor();
    assert.equal((await snap()).game, null);
    await page.getByRole('button', { name: '返回编辑', exact: true }).click();
    if (process.env.NATIVE_PROJECT) {
      await page.locator('#project-file').setInputFiles(process.env.NATIVE_PROJECT);
      await page.waitForFunction(
        () => window.__ROOM_LAB__.snapshot().project.courses.flatMap((c) => c.rooms).length === 32,
      );
      const state = await snap();
      assert.equal(state.project.courses.flatMap((c) => c.rooms).length, 32);
      assert.equal(
        state.project.courses
          .flatMap((c) => c.rooms)
          .reduce((n, r) => n + (r.nativeCampaign?.platforms?.length || 0), 0),
        JSON.parse(fs.readFileSync(process.env.NATIVE_PROJECT, 'utf8'))
          .courses.flatMap((c) => c.rooms)
          .reduce((n, r) => n + (r.nativeCampaign?.platforms?.length || 0), 0),
      );
      for (const course of state.project.courses) {
        await page.locator('[data-enter="' + course.id + '"]').click();
        await page.locator('[data-tab="rooms"]').click();
        await page.locator('[data-room]').first().click();
        if (require('../src/project/native-compat.cjs').active(state.project, course))
          await page.locator('#native-band').waitFor();
        else assert.equal(await page.locator('#native-band').count(), 0);
        if (process.env.NATIVE_SCREENSHOT && course.kind === 'calculus')
          await page.screenshot({ path: process.env.NATIVE_SCREENSHOT });
        await page.locator('#back-course').click();
        await page.locator('#crumb-project').click();
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      'NATIVE_COMPAT_DESKTOP_PASS platform move/endpoint/resize/undo/copy, patrol drag, sign, hints, preview guard',
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
