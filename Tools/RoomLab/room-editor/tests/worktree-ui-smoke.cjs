'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const call = (p, name, data) =>
  p.evaluate(({ name, data }) => window.desktopAPI.cloud(name, data), { name, data });
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
    await p.locator('#open-cloud').click();
    const root = (await call(p, 'status')).current;
    assert.equal(await p.locator('#worktree-forest [role=treeitem]').count(), 1);
    await p.getByText('从当前草稿建立工作树', { exact: true }).click();
    await p.locator('#cloud-tree-name').fill('实验 B');
    await p.locator('#cloud-branch').fill('experiment-b');
    await p.locator('#cloud-fork').click();
    await p.waitForFunction(() =>
      document.querySelector('#worktree-forest')?.textContent.includes('实验 B'),
    );
    const b = (await call(p, 'status')).current;
    await p.getByText('从当前草稿建立工作树', { exact: true }).click();
    await p.locator('#cloud-tree-name').fill('实验 C');
    await p.locator('#cloud-branch').fill('experiment-c');
    await p.locator('#cloud-fork').click();
    await p.waitForFunction(() =>
      document.querySelector('#worktree-forest')?.textContent.includes('实验 C'),
    );
    const c = (await call(p, 'status')).current;
    await p.locator(`[data-tree-handle="${c}"]`).dragTo(p.locator(`[data-tree-card="${root}"]`));
    await p.locator('#worktree-confirm-yes').click();
    await p.waitForFunction(
      ({ id, parent }) =>
        document.querySelector(`[data-tree-card="${id}"]`)?.dataset.parentId === parent,
      { id: c, parent: root },
    );
    await p.locator(`[data-manage-tree="${b}"]`).click();
    await p.locator('#tree-rename').fill('实验 C');
    await p.locator('#tree-rename-save').click();
    assert.ok((await p.locator('#worktree-confirm').textContent()).includes('重复'));
    await p.locator('#worktree-confirm-no').click();
    await p.locator('#tree-delete').click();
    await p.locator('#worktree-confirm-yes').click();
    await p.waitForFunction((id) => !document.querySelector(`[data-tree-card="${id}"]`), b);
    await p.locator('#worktree-trash summary').click();
    await p.locator('[data-recover-tree]').click();
    await p.waitForFunction((id) => !!document.querySelector(`[data-tree-card="${id}"]`), b);
    const project = await p.evaluate(() => window.__ROOM_LAB__.snapshot().project),
      seed = require('../src/assets/seeds.cjs').seeds();
    const folder = path.resolve(__dirname, '../test-output/工作树 关联验收');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, Date.now() + '.json');
    const payload = {
      project,
      files: [...seed.files].map(([path, bytes]) => ({ path, bytes: [...bytes] })),
      testPath: file,
    };
    const saved = await p.evaluate((v) => window.desktopAPI.saveProject(v), payload);
    let status = await call(p, 'status');
    assert.equal(status.trees.find((t) => t.id === status.current).localFile.path, file);
    const before = fs.readFileSync(file);
    const cancelled = await p.evaluate((v) => window.desktopAPI.saveProject(v), {
      ...payload,
      session: saved.session,
      project: { ...project, name: '禁止覆盖' },
      testConfirm: false,
    });
    assert.equal(cancelled, null);
    assert.deepEqual(fs.readFileSync(file), before);
    const missingDir = path.join(folder, '缺少素材');
    fs.mkdirSync(missingDir, { recursive: true });
    const missingFile = path.join(missingDir, 'project.json');
    fs.writeFileSync(missingFile, JSON.stringify(project));
    const missingResult = await p.evaluate(
      (file) => window.desktopAPI.openProject({ testPath: file }),
      missingFile,
    );
    assert.equal(missingResult.missing.length, project.assets.length);
    await p.getByRole('button', { name: '关闭', exact: true }).click();
    await p.locator('#open-cloud').click();
    assert.ok((await p.locator('#worktree-forest').textContent()).includes(file));
    await p.locator(`[data-manage-tree="${c}"]`).click();
    await p.locator(`[data-tree-card="${c}"]`).scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.resolve(__dirname, '../test-output/worktree-management.png') });
    console.log(
      JSON.stringify({
        worktreeUI: true,
        packaged: !!process.env.EDITOR_EXE,
        dragReparent: true,
        duplicatePrompt: true,
        deleteRecover: true,
        fileAssociation: true,
        cancelOverwritePreservesBytes: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
