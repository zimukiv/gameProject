'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const F = require('../src/desktop/project-files.cjs'),
  A = require('../src/project/archive.cjs');
(async () => {
  const file =
      process.env.ROOM_IMPORT_ARCHIVE ||
      process.env.ROOM_IMPORT_FILE ||
      'G:/project null/兼容性检查.json',
    packed = process.env.ROOM_IMPORT_ARCHIVE ? A.unpack(fs.readFileSync(file)) : null,
    loaded = packed
      ? {
          project: packed.project,
          files: [...packed.files].map(([path, bytes]) => ({ path, bytes })),
          missing: [],
        }
      : F.readProject(file);
  assert.deepEqual(loaded.missing, []);
  const zip = path.resolve(__dirname, '../test-output/兼容验收-2.5.0.zip');
  fs.writeFileSync(
    zip,
    A.pack(loaded.project, new Map(loaded.files.map((f) => [f.path, f.bytes]))),
  );
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
    await p.locator('#project-file').setInputFiles(zip);
    await p.waitForFunction(
      () => window.__ROOM_LAB__.snapshot().project.courses[0].rooms.length === 15,
    );
    await p.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await p.getByRole('button', { name: '房间列表', exact: true }).click();
    await p.getByRole('button', { name: '编辑房间', exact: true }).nth(8).click();
    await p.locator('#play-room').click();
    await p.waitForFunction(() => window.__ROOM_LAB__.snapshot().game?.cols === 60);
    let game = await p.evaluate(() => window.__ROOM_LAB__.snapshot().game);
    assert.equal(game.rows, 15);
    assert.ok(Number.isFinite(game.player.x));
    await p.locator('#play-edit').click();
    await p.getByRole('button', { name: '不保存并退出', exact: true }).click();
    // Verify importing v2 jet data exposes direction/force and permits custom values beyond suggestions.
    await p.locator('[data-nav-room]').first().click();
    const jet = loaded.project.courses[0].rooms[0].objects.find((o) => o.type === 'physics.jet');
    const q = await p.evaluate(({ x, y }) => {
      const c = document.getElementById('room-canvas'),
        b = c.getBoundingClientRect(),
        v = window.__ROOM_LAB__.snapshot().state.roomView;
      return { x: b.x + v.x + (x + 0.5) * 32 * v.scale, y: b.y + v.y + (y + 0.5) * 32 * v.scale };
    }, jet);
    await p.locator('[data-tool="select"]').first().click();
    await p.mouse.click(q.x, q.y);
    await p.locator('[data-inspector="behavior"]').click();
    await p.locator('#param-direction').selectOption('left');
    await p.locator('#param-force').fill('3500');
    await p.locator('#apply-behavior').click();
    const changed = await p.evaluate(
      () =>
        window.__ROOM_LAB__
          .snapshot()
          .project.courses[0].rooms[0].objects.find((o) => o.type === 'physics.jet').params,
    );
    assert.equal(changed.force, 3500);
    assert.equal(changed.direction, 'left');
    await p.locator('#play-room').click();
    await p.waitForFunction(() => window.__ROOM_LAB__.snapshot().game?.roomId === 'jet-room');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        imported15Rooms: true,
        source: process.env.ROOM_IMPORT_ARCHIVE ? 'previous-acceptance-archive' : 'user-file',
        packaged: !!process.env.EDITOR_EXE,
        room9Play60x15: true,
        jetDirectionForceUI: true,
        customForce3500: true,
        noPageErrors: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
