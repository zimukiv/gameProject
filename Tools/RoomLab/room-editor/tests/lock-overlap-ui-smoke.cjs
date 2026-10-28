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
    const p = await app.firstWindow(),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.waitForFunction(() => window.__ROOM_LAB__);
    await p.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await p.getByRole('button', { name: '房间列表', exact: true }).click();
    await p.getByRole('button', { name: '编辑房间', exact: true }).nth(1).click();
    const snap = () => p.evaluate(() => window.__ROOM_LAB__.snapshot()),
      point = (x, y) =>
        p.evaluate(
          ({ x, y }) => {
            const c = document.getElementById('room-canvas'),
              b = c.getBoundingClientRect(),
              v = window.__ROOM_LAB__.snapshot().state.roomView;
            return { x: b.x + v.x + x * 32 * v.scale, y: b.y + v.y + y * 32 * v.scale };
          },
          { x, y },
        );
    const click = async (x, y) => {
      const q = await point(x, y);
      await p.mouse.click(q.x, q.y);
    };
    const drag = async (x, y, xx, yy) => {
      const a = await point(x, y),
        b = await point(xx, yy);
      await p.mouse.move(a.x, a.y);
      await p.mouse.down();
      await p.mouse.move(b.x, b.y, { steps: 7 });
      await p.mouse.up();
    };
    await click(3.5, 14.5);
    const v = (await snap()).state.roomView;
    assert.equal((await snap()).state.selection.kind, 'objects');
    await drag(3.5, 14.5, 4.5, 14.5);
    await drag(4.5, 14.5, 5.5, 14.5);
    let room = (await snap()).project.courses[0].rooms[1];
    assert.equal(room.objects.find((o) => o.type === 'physics.thermal').x, 5);
    assert.equal(room.zones[0].x, 4);
    await p.locator('#object-locked').check();
    await drag(5.5, 14.5, 6.5, 14.5);
    room = (await snap()).project.courses[0].rooms[1];
    assert.equal(room.objects.find((o) => o.type === 'physics.thermal').x, 5);
    await click(9.5, 9.5);
    assert.equal((await snap()).state.selection.kind, 'zones');
    await p.locator('#object-locked').check();
    await drag(4, 8, 2, 6);
    room = (await snap()).project.courses[0].rooms[1];
    assert.deepEqual([room.zones[0].x, room.zones[0].y], [4, 8]);
    assert.deepEqual((await snap()).state.roomView, v);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        lockAndOverlap: true,
        packaged: !!process.env.EDITOR_EXE,
        selectedBlockRemainsSelectedDuringDrag: true,
        thermalZoneNotMoved: true,
        lockedBlockAndZone: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
