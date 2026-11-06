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
    const page = await app.firstWindow(),
      errors = [],
      snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('#start-new').click();
    await page.locator('[data-enter="calculus"]').click();
    await page.locator('[data-tab="rooms"]').click();
    await page.locator('[data-room]').first().click();
    assert.equal(await page.locator('#room-env').count(), 0);
    await page.locator('#apply-room').click();
    const point = async (x, y) => {
      const box = await page.locator('#room-canvas').boundingBox(),
        view = (await snap()).state.roomView;
      return [
        box.x + view.x + (x + 0.5) * 32 * view.scale,
        box.y + view.y + (y + 0.5) * 32 * view.scale,
      ];
    };
    const click = async (x, y) => page.mouse.click(...(await point(x, y)));
    const room = async () =>
      (await snap()).project.courses.find((c) => c.kind === 'calculus').rooms[0];
    await page.locator('.block-card[data-tool="movable"]').click();
    await click(7, 8);
    await page.locator('#brick-node-preview').waitFor();
    await page.keyboard.press('KeyZ');
    await page.locator('#brick-node-place').click();
    await click(8, 8);
    assert.equal((await snap()).state.tool, 'select');
    await page.locator('#brick-node-seconds').fill('0.7');
    await page.locator('#brick-node-mode').selectOption('easeIn');
    await page.locator('#brick-node-save').click();
    await page.mouse.click(...(await point(9, 9)), { button: 'right' });
    assert.equal((await snap()).state.tool, 'select');
    await page.locator('#brick-node-seconds').fill('1.2');
    await page.locator('#brick-node-mode').selectOption('easeOut');
    await page.locator('#brick-node-save').click();
    await page.mouse.move(...(await point(9, 9)));
    await page.mouse.down();
    await page.mouse.move(...(await point(10, 9)), { steps: 3 });
    await page.mouse.up();
    await page.locator('[data-tool="select"]').click();
    await click(5, 14);
    await page.locator('[data-inspector="behavior"]').click();
    assert.equal(await page.locator('#param-range').count(), 0);
    await page.mouse.click(...(await point(7, 8)), { button: 'right' });
    const authored = (await room()).movables.at(-1);
    assert.equal(authored.padId, 'calculus-room-integral');
    assert.deepEqual(authored.motionPath, [
      { x: 8, y: 8, seconds: 0.7, mode: 'easeIn' },
      { x: 10, y: 9, seconds: 1.2, mode: 'easeOut' },
    ]);
    await page.mouse.click(...(await point(7, 8)), { button: 'right' });
    assert.equal((await room()).movables.at(-1).padId, '');
    await page.locator('#undo').click();
    assert.deepEqual((await room()).movables.at(-1), authored);
    await page.locator('.block-card[data-tool="movable"]').click();
    await click(6, 8);
    await click(7, 7);
    await page.keyboard.press('KeyZ');
    await click(7, 8);
    await page.keyboard.down('Shift');
    await click(6, 8);
    await click(7, 7);
    await page.keyboard.up('Shift');
    await page.locator('#group-pad').selectOption('calculus-room-integral');
    await page.locator('#group-bricks').click();
    const members = async () => (await room()).movables.slice(-3);
    const grouped = await members();
    assert.equal(new Set(grouped.map((b) => b.brickGroup)).size, 1);
    assert.ok(grouped.every((b) => b.brickGroup && b.padId === 'calculus-room-integral'));
    assert.equal((await snap()).state.selection.id, authored.id);
    assert.match(await page.locator('#room-inspector').textContent(), /代表砖/);
    assert.equal(grouped[1].motionPath[0].x, authored.motionPath[0].x - 1);
    await page.locator('[data-brick-node="0"]').click();
    await page.locator('#brick-node-seconds').fill('0.9');
    await page.locator('#brick-node-save').click();
    assert.ok((await members()).every((b) => b.motionPath[0].seconds === 0.9));
    await page.locator('[data-inspector="base"]').click();
    const beforeMove = await members();
    await page.mouse.move(...(await point(6, 8)));
    await page.mouse.down();
    await page.mouse.move(...(await point(6, 6)), { steps: 4 });
    await page.mouse.up();
    const moved = await members();
    for (const [i, member] of moved.entries()) {
      assert.equal(member.y, beforeMove[i].y - 2);
      assert.deepEqual(
        member.motionPath,
        beforeMove[i].motionPath.map((n) => ({ ...n, y: n.y - 2 })),
      );
    }
    await page.locator('#ungroup-bricks').click();
    assert.ok(
      (await members()).every((b) => !b.brickGroup && b.padId === 'calculus-room-integral'),
    );
    await click(5, 14);
    const bindBox = async () => {
      await page.mouse.move(...(await point(6, 5)));
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(...(await point(7, 6)), { steps: 4 });
      await page.mouse.up({ button: 'right' });
    };
    await bindBox();
    assert.ok((await members()).every((b) => !b.padId));
    await bindBox();
    assert.ok((await members()).every((b) => b.padId === 'calculus-room-integral'));
    await page.locator('#room-help').click();
    assert.match(await page.locator('#dialog-content').textContent(), /积分或求导板/);
    await page.getByRole('button', { name: '知道了' }).click();
    await page.locator('#home').click();
    for (const [kind, visible] of [
      ['slacker', false],
      ['physics', true],
    ]) {
      await page.locator(`[data-enter="${kind}"]`).click();
      await page.locator('[data-tab="rooms"]').click();
      await page.locator('[data-room]').first().click();
      assert.equal(await page.locator('#room-env').isVisible(), visible);
      await page.locator('#room-help').click();
      assert.match(
        await page.locator('#dialog-content').textContent(),
        kind === 'physics' ? /选中电磁炮/ : /签到板或清醒板/,
      );
      assert.doesNotMatch(await page.locator('#dialog-content').textContent(), /积分或求导板/);
      await page.getByRole('button', { name: '知道了' }).click();
      await page.locator('#home').click();
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: one-shot nodes, quick binding, group path editing/movement/dissolution and themed temperature controls',
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
