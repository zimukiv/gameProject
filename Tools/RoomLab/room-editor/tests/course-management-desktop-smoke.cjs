'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  { pack } = require('../src/project/archive.cjs'),
  M = require('../src/project/model.cjs');

async function launch(run) {
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
    page.on('pageerror', (error) => errors.push(error.message));
    await page.locator('#start-import').waitFor();
    assert.equal(await page.locator('#save-project').isVisible(), false);
    await run(page, () => page.evaluate(() => window.__ROOM_LAB__.snapshot()), app);
    assert.deepEqual(errors, []);
  } finally {
    await app.close().catch(() => {});
  }
}

(async () => {
  await launch(async (p, snap) => {
    await p.locator('#start-new').click();
    const before = (await snap()).project;
    assert.deepEqual(
      before.courses.map((c) => c.rooms.length),
      [3, 3, 3],
    );
    assert.notEqual(before.id, M.themedExample().id);
    assert.equal(await p.locator('#start-new').count(), 0);
    await p.locator('[data-course="calculus"]').click({ button: 'right' });
    await p.locator('#rename-course').click();
    await p.locator('#course-label').fill('  ');
    await p.getByRole('button', { name: '保存名称' }).click();
    assert.equal(await p.locator('#dialog').isVisible(), true);
    await p.locator('#course-label').fill('微积分作业');
    await p.locator('#course-label').press('Enter');
    assert.deepEqual((await snap()).project.courses[1], {
      ...before.courses[1],
      name: '微积分作业',
    });
    await p.reload();
    await p.locator('[data-course="calculus"]').waitFor();
    assert.match(await p.locator('[data-course="calculus"] h2').textContent(), /微积分作业/);
    assert.equal(await p.locator('#start-import').count(), 0);
    await p.locator('#add-course').click();
    await p.locator('[data-new-course-kind="calculus"]').click();
    const fourth = (await snap()).project.courses.at(-1);
    assert.equal(fourth.rooms.length, 3);
    assert.equal(fourth.connections.length, 2);
    const tools = p.locator('[aria-controls="menu-tools"]');
    await tools.click();
    await p.locator('#open-assets').click();
    assert.equal(await p.locator('#asset-filter').inputValue(), fourth.id);
    await p.locator('[data-asset-group="mechanism"]').click();
    await p.locator('[data-asset-sub="calculus.integral"]').waitFor();
    assert.equal(await p.locator('[data-asset-sub="physics.jet"]').count(), 0);
    await p.locator('[data-asset-sub="calculus.integral"]').click();
    assert.match(await p.locator('.asset-card').textContent(), /积分/);
    await tools.click();
    await p.locator('#open-definitions').click();
    assert.equal(await p.locator('#definition-course').inputValue(), fourth.id);
    assert.equal(await p.locator('[data-definition="physics.jet"]').count(), 0);
    await p.locator('[data-definition="calculus.integral"]').click();
    await p.locator('#definition-name').fill('第四大关专用积分板');
    await p.locator('#param-cooldown').fill('2.2');
    await p.locator('[data-definition-slot="idle"]').selectOption('seed-calculus-integral');
    await p.locator('#save-definition').click();
    await p.locator('#definition-course').selectOption('calculus');
    assert.notEqual(await p.locator('#definition-name').inputValue(), '第四大关专用积分板');
    const after = (await snap()).project;
    assert.equal(after.courses[1].blockDefaults, undefined);
    assert.equal(after.courses.at(-1).blockDefaults['calculus.integral'].params.cooldown, 2.2);
    await p.locator('#home').click();
    await p.locator(`[data-enter="${fourth.id}"]`).click();
    await p.locator('[data-tab="rooms"]').click();
    await p.locator('[data-room]').first().click();
    await p.locator('[data-block-type="calculus.integral"]').click();
    const box = await p.locator('#room-canvas').boundingBox(),
      view = (await snap()).state.roomView;
    await p.mouse.click(
      box.x + view.x + 3.5 * 32 * view.scale,
      box.y + view.y + 6.5 * 32 * view.scale,
    );
    const placed = (await snap()).project.courses.at(-1).rooms[0].objects.at(-1);
    assert.equal(placed.name, '第四大关专用积分板');
    assert.equal(placed.params.cooldown, 2.2);
    assert.equal(placed.assetOverrides.idle, 'seed-calculus-integral');
    await p.locator('#home').click();
    await p.locator('#add-course').click();
    await p.locator('#course-with-examples').uncheck();
    await p.locator('[data-new-course-kind="slacker"]').click();
    assert.equal(await p.locator('#dialog').isVisible(), false);
    const blank = (await snap()).project.courses.at(-1).rooms;
    assert.equal(blank.length, 1);
    assert.deepEqual(blank[0].objects, []);
  });
  await launch(async (p, snap, app) => {
    const project = M.example();
    const source = require('../src/assets/seeds.cjs')
      .seeds({ allThemes: true })
      .assets.find((a) => a.id === 'seed-calculus-integral');
    project.assets = [source];
    await p.evaluate(
      (data) => localStorage.setItem('ddl-room-lab-v2', JSON.stringify(data)),
      project,
    );
    await p.reload();
    await p.locator('#add-course').click();
    await p.locator('[data-new-course-kind="calculus"]').click();
    assert.deepEqual(
      (await snap()).project.courses.map((c) => c.kind),
      ['physics', 'calculus'],
    );
    const closed = app.waitForEvent('close', { timeout: 10000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closed;
  });
  await launch(async (p, snap) => {
    await p.locator('#project-file').setInputFiles({
      name: 'legacy-physics.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(pack(M.example(), new Map())),
    });
    await p.locator('[data-course="physics"]').waitFor();
    assert.deepEqual(
      (await snap()).project.courses.map((c) => c.kind),
      ['physics'],
    );
    await p.reload();
    await p.locator('[data-course="physics"]').waitFor();
    assert.deepEqual((await snap()).project.assets, []);
    assert.equal(await p.locator('#start-import').count(), 0);
  });
  console.log(
    'PASS: startup choices, project restore/import, course rename, templates, scoped assets and placed defaults',
  );
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
