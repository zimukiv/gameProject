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
    await p.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    const paths = () =>
      p.evaluate(() => window.__ROOM_LAB__.snapshot().project.courses[0].rooms[0].playTraces || []);
    async function play(ms = 240) {
      await p.locator('#play-room').click();
      await p.keyboard.down('KeyD');
      await p.waitForTimeout(ms);
      await p.keyboard.up('KeyD');
    }
    async function exit(save, name) {
      await p.locator('#play-edit').click();
      await p.getByText('是否保存这次试玩路径？', { exact: true }).waitFor();
      if (save) {
        assert.ok((await p.locator('[data-exit-life]').count()) > 0);
        await p.getByRole('button', { name: '保存路径并退出', exact: true }).click();
      } else await p.getByRole('button', { name: '不保存并退出', exact: true }).click();
      await p.locator('#play-room').waitFor();
    }
    await play();
    assert.equal((await paths()).length, 0);
    await exit(true, '第一局');
    const first = await paths();
    assert.equal(first.length, 1);
    await play();
    await exit(false);
    assert.deepEqual(await paths(), first);
    await play(180);
    await exit(true, '第三局');
    let all = await paths();
    assert.equal(all.length, 2);
    assert.deepEqual(all[0], first[0]);
    assert.equal(all[1].name, '1');
    assert.notEqual(all[1].sessionId, first[0].sessionId);
    assert.equal(all[1].points[0].t, 0);
    await play();
    await p.locator('#play-retry').click();
    await p.keyboard.down('KeyD');
    await p.waitForTimeout(200);
    await p.keyboard.up('KeyD');
    await p.locator('#play-edit').click();
    await p.locator('[data-exit-life="1"]').uncheck();
    await p.getByRole('button', { name: '保存路径并退出', exact: true }).click();
    await p.locator('#play-room').waitFor();
    all = await paths();
    assert.equal(all.length, 3);
    assert.equal(all[2].name, '2');
    assert.ok(all.slice(2).every((t) => t.points[0].t === 0));
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        traceExitUI: true,
        packaged: !!process.env.EDITOR_EXE,
        promptEveryExit: true,
        discardPreservesOld: true,
        separateSessions: true,
        retriesSeparate: true,
        noAutoSave: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
