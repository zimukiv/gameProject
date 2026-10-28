'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')],
    env,
  });
  try {
    const p = await app.firstWindow();
    await p.waitForFunction(() => window.__ROOM_LAB__);
    await p.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await p.getByRole('button', { name: '房间列表', exact: true }).click();
    await p.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    const snap = () => p.evaluate(() => window.__ROOM_LAB__.snapshot());
    const point = (x, y) =>
      p.evaluate(
        ({ x, y }) => {
          const c = document.getElementById('room-canvas'),
            b = c.getBoundingClientRect(),
            v = window.__ROOM_LAB__.snapshot().state.roomView;
          return {
            x: b.x + v.x + (x + 0.5) * 32 * v.scale,
            y: b.y + v.y + (y + 0.5) * 32 * v.scale,
          };
        },
        { x, y },
      );
    let q = await point(13, 7);
    await p.mouse.move(q.x, q.y);
    await p.mouse.wheel(0, -450);
    await p.waitForTimeout(100);
    await p.mouse.down({ button: 'middle' });
    await p.mouse.move(q.x + 38, q.y + 17, { steps: 3 });
    await p.mouse.up({ button: 'middle' });
    const v = (await snap()).state.roomView;
    const preserved = async () => assert.deepEqual((await snap()).state.roomView, v);
    await p.locator('[data-block-type="common.small"]').click();
    q = await point(13, 7);
    await p.mouse.click(q.x, q.y);
    await preserved();
    await p.locator('[data-tool="select"]').first().click();
    const to = await point(14, 7);
    await p.mouse.move(q.x, q.y);
    await p.mouse.down();
    await p.mouse.move(to.x, to.y, { steps: 4 });
    await p.mouse.up();
    await preserved();
    assert.ok(
      (await snap()).project.courses[0].rooms[0].objects.some(
        (o) => o.type === 'common.small' && o.x === 14 && o.y === 7,
      ),
    );
    await p.locator('[data-tool="erase"]').first().click();
    await p.mouse.click(to.x, to.y);
    await preserved();
    await p.locator('#undo').click();
    await preserved();
    await p.locator('#redo').click();
    await preserved();
    await p.locator('#toggle-inspector').click();
    await preserved();
    await p.locator('#toggle-inspector').click();
    await preserved();
    await p.locator('[data-tool="select"]').first().click();
    q = await point(12, 7);
    await p.mouse.click(q.x, q.y);
    await p.locator('#room-cols').fill('256');
    await p.locator('#room-rows').fill('256');
    await p.locator('#apply-room').click();
    await preserved();
    assert.equal((await snap()).project.courses[0].rooms[0].cols, 256);
    await p.locator('#fit-room').click();
    assert.notDeepEqual((await snap()).state.roomView, v);
    const fitted = (await snap()).state.roomView.scale;
    const canvas = await p.locator('#room-canvas').boundingBox();
    await p.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await p.mouse.wheel(0, 250);
    await p.waitForTimeout(100);
    assert.ok(
      (await snap()).state.roomView.scale < fitted,
      'large-room wheel zoom must not jump back in',
    );
    await p.locator('#play-room').click();
    await p.waitForFunction(() => window.__ROOM_LAB__.snapshot().game?.cols === 256);
    console.log(
      JSON.stringify({
        roomViewPreserved: true,
        place: true,
        drag: true,
        erase: true,
        undoRedo: true,
        inspectorToggle: true,
        largeRoom256: true,
        packaged: !!process.env.EDITOR_EXE,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
