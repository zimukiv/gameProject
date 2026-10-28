'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const exe = process.env.EDITOR_EXE || require('electron'),
    args = process.env.EDITOR_EXE ? [] : [path.resolve(__dirname, '..')];
  const app = await _electron.launch({ executablePath: exe, args, env, timeout: 30000 });
  let page;
  try {
    page = await app.firstWindow();
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    assert.equal(await page.evaluate(() => window.desktopAPI.platform), 'windows');
    const version = require('../package.json').version.split('.').slice(0, 2).join('.');
    assert.ok((await page.locator('.brand small').textContent()).includes('v' + version));
    const root = path.resolve(__dirname, '../test-output/桌面 中文项目'),
      file = path.join(root, 'project.json');
    await fs.mkdir(root, { recursive: true });
    // Native read/write IPC is exercised on disk using a project with an imported image.
    const snap = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project),
      seed = require('../src/assets/seeds.cjs').seeds();
    const saved = await page.evaluate(
      async ({ project, files, file }) =>
        window.desktopAPI.saveProject({ project, files, testPath: file }),
      {
        project: snap,
        files: [...seed.files].map(([path, bytes]) => ({ path, bytes: [...bytes] })),
        file,
      },
    );
    assert.equal(saved.file, file);
    const opened = await page.evaluate(
      async (file) => window.desktopAPI.openProject({ testPath: file }),
      file,
    );
    assert.deepEqual(opened.project, snap);
    assert.equal(opened.files.length, 9);
    const art = path.join(root, '新美术.svg');
    await fs.writeFile(
      art,
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="cyan"/></svg>',
    );
    const picked = await page.evaluate(
      async (file) => window.desktopAPI.importAssets({ testFiles: [file] }),
      art,
    );
    assert.equal(picked[0].name, '新美术.svg');
    const Trace = require('../src/project/play-traces.cjs');
    const traceFile = path.join(root, '试玩路径.json'),
      traceText = Trace.serialize({
        ...snap.courses[0].rooms[0],
        playTraces: [
          Trace.create('桌面路径', [
            { x: 10, y: 20, t: 0 },
            { x: 30, y: 40, t: 1 },
          ]),
        ],
      });
    await page.evaluate(
      async ({ file, text }) =>
        window.desktopAPI.exportTraces({ testPath: file, name: '路径', text }),
      { file: traceFile, text: traceText },
    );
    const loadedTraces = await page.evaluate(
      (file) => window.desktopAPI.importTraces({ testPath: file }),
      traceFile,
    );
    assert.equal(loadedTraces.text, traceText);
    await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    assert.equal(await page.locator('.room-tabs [data-nav-room]').count(), 3);
    assert.equal(await page.locator('.block-palette [data-block-type^="physics."]').count(), 4);
    assert.equal(await page.locator('[data-block-type="common.aiStartHollow"]').count(), 0);
    assert.equal(await page.locator('#room-hints').count(), 1);
    assert.equal(await page.locator('#room-traces').count(), 1);
    await page.locator('#back-course').click();
    await page.getByRole('button', { name: '缩略接线板', exact: true }).click();
    assert.equal(await page.locator('#graph-fit').count(), 1);
    const data = await app.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, {
          stayHidden: true,
        })
      ).toDataURL(),
    );
    await fs.writeFile(
      path.resolve(__dirname, '../test-output/desktop.png'),
      Buffer.from(data.split(',')[1], 'base64'),
    );
    await page.getByRole('button', { name: '从首房试玩', exact: true }).click();
    await page.keyboard.down('KeyD');
    await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game.roomId === 'ice-room', {
      timeout: 10000,
      polling: 'raf',
    });
    await page.keyboard.up('KeyD');
    const canvasSize = await page
      .locator('#play-canvas')
      .evaluate((c) => ({ height: c.height, visible: Math.round(c.clientHeight) }));
    assert.equal(canvasSize.height, canvasSize.visible);
    assert.ok(
      (await page.evaluate(() => window.__ROOM_LAB__.snapshot().game)).events.some(
        (e) => e.type === 'jet',
      ),
    );
    await page.locator('#play-edit').click();
    await page.getByRole('button', { name: '不保存并退出', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        phase: 5,
        result: 'PASS',
        packaged: !!process.env.EDITOR_EXE,
        nativeSave: true,
        nativeOpen: true,
        chinesePaths: true,
        nativeAssetPicker: true,
        rendererNoNode: true,
        desktopPlay: true,
        errors,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
