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
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.waitForFunction(() => window.__ROOM_LAB__);
    await p.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await p.getByRole('button', { name: '房间列表', exact: true }).click();
    await p.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    const snap = () => p.evaluate(() => window.__ROOM_LAB__.snapshot());
    const at = (x, y) =>
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
    await p.locator('[data-block-type="common.small"]').click();
    for (const x of [8, 10, 12]) {
      const q = await at(x, 5);
      await p.mouse.click(q.x, q.y);
    }
    await p.locator('[data-tool="marquee"]').click();
    let a = await at(7, 4),
      b = await at(10, 6);
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 5 });
    await p.mouse.up();
    assert.equal((await snap()).state.multiSelection.length, 2);
    await p.keyboard.down('Shift');
    a = await at(12, 5);
    await p.mouse.click(a.x, a.y);
    assert.equal((await snap()).state.multiSelection.length, 3);
    a = await at(10, 5);
    await p.mouse.click(a.x, a.y, { button: 'right' });
    await p.keyboard.up('Shift');
    assert.equal((await snap()).state.multiSelection.length, 2);
    const v = (await snap()).state.roomView,
      undo = (await snap()).history.undo;
    a = await at(8, 5);
    b = await at(8, 6);
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 5 });
    await p.mouse.up();
    const moved = await snap();
    assert.equal(moved.history.undo, undo + 1);
    assert.equal(
      moved.project.courses[0].rooms[0].objects.filter(
        (o) => o.type === 'common.small' && o.y === 6,
      ).length,
      2,
    );
    assert.deepEqual(moved.state.roomView, v);
    await p.keyboard.press('Delete');
    const deleted = await snap();
    assert.equal(
      deleted.project.courses[0].rooms[0].objects.filter((o) => o.type === 'common.small').length,
      1,
    );
    await p.locator('#undo').click();
    assert.equal(
      (await snap()).project.courses[0].rooms[0].objects.filter((o) => o.type === 'common.small')
        .length,
      3,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        marquee: true,
        shiftLeftAdd: true,
        shiftRightInvert: true,
        groupDragSingleUndo: true,
        batchDeleteUndo: true,
        zoomPreserved: true,
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
