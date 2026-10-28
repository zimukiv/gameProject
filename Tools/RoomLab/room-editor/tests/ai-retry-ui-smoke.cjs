'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  { chromium, _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  M = require('../src/project/model.cjs'),
  A = require('../src/project/archive.cjs');
(async () => {
  let browser;
  if (!process.env.EDITOR_EXE)
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const solid of [true, false]) {
      const p = M.example(),
        r = p.courses[0].rooms[0],
        seed = require('../src/assets/seeds.cjs').seeds();
      p.name = 'AI retry ' + solid;
      p.assets = seed.assets;
      p.courses[0].artBindings = seed.bindings;
      r.aiPolicy = 'inherit';
      r.objects = [M.object('retry-ai', 'common.aiStart', 4, solid ? 14 : 13)];
      r.objects[0].collision = solid;
      r.objects[0].resetPolicy = 'preserve';
      const file = path.resolve(__dirname, '../test-output/ai-retry-' + solid + '.zip');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, A.pack(p, seed.files));
      let app, page;
      if (process.env.EDITOR_EXE) {
        const env = { ...process.env, ROOM_EDITOR_TEST: '1' };
        delete env.ELECTRON_RUN_AS_NODE;
        app = await _electron.launch({ executablePath: process.env.EDITOR_EXE, args: [], env });
        page = await app.firstWindow();
      } else {
        page = await browser.newPage();
        await page.goto(
          'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
        );
      }
      try {
        await page.waitForFunction(() => window.__ROOM_LAB__);
        await page.locator('#project-file').setInputFiles(file);
        await page.waitForFunction(
          (name) => window.__ROOM_LAB__.snapshot().project.name === name,
          p.name,
        );
        await page.getByRole('button', { name: '进入大关 →', exact: true }).click();
        await page.getByRole('button', { name: '从首房试玩', exact: true }).click();
        for (let life = 0; life < 3; life++) {
          assert.equal(
            (await page.evaluate(() => window.__ROOM_LAB__.snapshot())).game.ai.active,
            false,
          );
          await page.keyboard.down('KeyD');
          await page.waitForFunction(() => window.__ROOM_LAB__.snapshot().game.ai.active, {
            timeout: 5000,
          });
          await page.keyboard.up('KeyD');
          if (life < 2) {
            await page.keyboard.press('KeyR');
            await page.waitForFunction(
              (deaths) => window.__ROOM_LAB__.snapshot().game.deaths === deaths,
              life + 1,
            );
          }
        }
      } finally {
        if (app) await app.close();
        else await page.close();
      }
    }
    console.log(
      JSON.stringify({
        aiRetryUI: true,
        packaged: !!process.env.EDITOR_EXE,
        solidAndHollow: true,
        threeLivesEach: true,
        preservePolicy: true,
      }),
    );
  } finally {
    await browser?.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
