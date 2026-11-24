'use strict';
// Desktop acceptance for minute autosave. Runs against the dev Electron or a
// packaged EXE (EDITOR_EXE) with ROOM_EDITOR_TEST=1, which gives the app a
// throw-away userData profile: no real saves, no cloud writes and no dialogs.
// The 60 s interval is replaced by window.__ROOM_LAB__.autosaveTick() so the
// test never waits a real minute.
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  { seeds } = require('../src/assets/seeds.cjs');

(async () => {
  const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const root = path.resolve(__dirname, '..'),
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'roomlab-autosave-exe-')),
    file = path.join(dir, '自动保存验收.json'),
    seed = seeds({ allThemes: true });
  const app = await _electron.launch({
    executablePath: process.env.EDITOR_EXE || require('electron'),
    args: process.env.EDITOR_EXE ? [] : [root],
    env,
    timeout: 30000,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => !!window.__ROOM_LAB__);
    await page.locator('#start-new').click();
    await page.locator('#graph').waitFor();
    const project = await page.evaluate(() => window.__ROOM_LAB__.snapshot().project);
    // Associate the project with a temporary file the way 打开项目/保存项目 would.
    const saved = await page.evaluate(
      ({ project, files, file }) =>
        window.desktopAPI.saveProject({ project, files, testPath: file }),
      {
        project,
        files: [...seed.files].map(([assetPath, bytes]) => ({
          path: assetPath,
          bytes: [...bytes],
        })),
        file,
      },
    );
    assert.equal(saved.file, file);
    const cloudBefore = await page.evaluate(() => window.desktopAPI.cloud('status'));
    // An edit through the real UI; the route/tab/selection/view must survive autosave.
    await page.locator('#project-settings').click();
    await page.locator('#project-notes').fill('自动保存写入的备注');
    await page.locator('#dialog-actions .primary').click();
    // ResizeObserver measurements can settle after the settings dialog closes;
    // they are DOM geometry, not authored view/selection/navigation state.
    const stableState = (state) => {
      const { graphCanvas, ...stable } = state;
      return stable;
    };
    const stateBefore = stableState(
      await page.evaluate(() => window.__ROOM_LAB__.snapshot().state),
    );
    const result = await page.evaluate(() => window.__ROOM_LAB__.autosaveTick());
    assert.equal(result.mode, 'file');
    assert.equal(result.ok, true);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).notes, '自动保存写入的备注');
    const status = page.locator('#autosave-status');
    assert.equal(await status.isVisible(), true);
    assert.match(await status.textContent(), /^自动保存 \d{2}:\d{2}:\d{2}$/);
    assert.match(await status.getAttribute('title'), /已写入项目文件/);
    assert.match(await status.getAttribute('title'), /位置：/);
    const stateAfter = stableState(await page.evaluate(() => window.__ROOM_LAB__.snapshot().state));
    assert.deepEqual(stateAfter, stateBefore, 'autosave keeps route, tab, selection and zoom');
    assert.equal(await page.locator('#graph').count(), 1);
    const cloudAfter = await page.evaluate(() => window.desktopAPI.cloud('status'));
    assert.equal(cloudAfter.history.length, cloudBefore.history.length, 'no cloud revision');
    assert.deepEqual(
      cloudAfter.trees.map((tree) => tree.readRevision),
      cloudBefore.trees.map((tree) => tree.readRevision),
      'no cloud parent change',
    );
    // A second tick without changes must not write again.
    assert.equal(await page.evaluate(() => window.__ROOM_LAB__.autosaveTick()), null);
    // External edit: autosave warns and keeps a recovery snapshot instead of overwriting.
    const external = JSON.parse(await fs.readFile(file, 'utf8'));
    external.notes = '其他程序写入的内容';
    await fs.writeFile(file, JSON.stringify(external, null, 2), 'utf8');
    await page.locator('#project-settings').click();
    await page.locator('#project-notes').fill('冲突期间继续编辑');
    await page.locator('#dialog-actions .primary').click();
    const conflict = await page.evaluate(() => window.__ROOM_LAB__.autosaveTick());
    assert.equal(conflict.mode, 'recovery');
    assert.equal(conflict.conflict, true);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).notes, '其他程序写入的内容');
    assert.ok(conflict.file && (await fs.stat(conflict.file)).isFile());
    assert.match(await status.textContent(), /需手动处理/);
    const cloudConflict = await page.evaluate(() => window.desktopAPI.cloud('status'));
    assert.equal(cloudConflict.history.length, cloudBefore.history.length);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        autosaveFile: true,
        statusVisible: true,
        uiPreserved: true,
        noCloudWrite: true,
        conflictRecovery: true,
        noRepeatWrite: true,
        packaged: !!process.env.EDITOR_EXE,
        errors,
      }),
    );
  } finally {
    await app.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
