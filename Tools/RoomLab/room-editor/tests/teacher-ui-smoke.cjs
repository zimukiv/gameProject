'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({ viewport: { width: 1500, height: 1050 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const snap = () => page.evaluate(() => window.__ROOM_LAB__.snapshot());
  const point = (x, y) =>
    page.evaluate(
      ({ x, y }) => {
        const canvas = document.getElementById('room-canvas'),
          box = canvas.getBoundingClientRect(),
          view = window.__ROOM_LAB__.snapshot().state.roomView;
        return {
          x: box.x + view.x + (x + 0.5) * 32 * view.scale,
          y: box.y + view.y + (y + 0.5) * 32 * view.scale,
        };
      },
      { x, y },
    );
  try {
    await page.goto(
      'file:///' + path.resolve(__dirname, '../build/index.html').replace(/\\/g, '/'),
    );
    await page.waitForFunction(() => window.__ROOM_LAB__);
    await page.locator('#start-new').click();
    await page.locator('[data-course="slacker"] [data-enter]').click();
    await page.getByRole('button', { name: '房间列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑房间', exact: true }).first().click();
    await page.locator('[data-block-type="slacker.teacher"]').click();
    let at = await point(8, 11);
    await page.mouse.click(at.x, at.y);
    let project = (await snap()).project,
      room = project.courses.find((c) => c.kind === 'slacker').rooms[0],
      teacher = room.objects.find((o) => o.type === 'slacker.teacher'),
      checkin = room.objects.find((o) => o.type === 'slacker.checkin');
    assert.ok(teacher && checkin);
    assert.equal(teacher.params.patrolMinX, 8);
    assert.equal(teacher.params.patrolMaxX, 12);

    await page.locator('#quick-bind-checkins').click();
    at = await point(checkin.x, checkin.y);
    await page.mouse.click(at.x, at.y);
    teacher = (await snap()).project.courses
      .find((c) => c.kind === 'slacker')
      .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
    assert.deepEqual(teacher.params.checkinIds, [checkin.id]);

    await page.mouse.click(at.x, at.y, { button: 'right' });
    teacher = (await snap()).project.courses
      .find((c) => c.kind === 'slacker')
      .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
    assert.deepEqual(teacher.params.checkinIds, []);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    teacher = (await snap()).project.courses
      .find((c) => c.kind === 'slacker')
      .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
    assert.deepEqual(teacher.params.checkinIds, [checkin.id]);

    await page.locator('[data-tool="select"]').first().click();
    at = await point(teacher.x, teacher.y);
    await page.mouse.click(at.x, at.y);
    await page.getByRole('button', { name: '行为', exact: true }).click();
    await page.locator('#param-patrolMinX').fill('6');
    await page.locator('#param-patrolMinX').press('Tab');
    await page.locator('#param-patrolMaxX').fill('14');
    await page.locator('#param-patrolMaxX').press('Tab');
    await page.locator('#param-speed').fill('2.5');
    await page.locator('#param-speed').press('Tab');
    await page.waitForFunction(
      () =>
        window.__ROOM_LAB__.snapshot().project.courses
          .find((c) => c.kind === 'slacker')
          .rooms[0].objects.find((o) => o.type === 'slacker.teacher').params.speed === 2.5,
    );
    teacher = (await snap()).project.courses
      .find((c) => c.kind === 'slacker')
      .rooms[0].objects.find((o) => o.type === 'slacker.teacher');
    assert.deepEqual(
      { min: teacher.params.patrolMinX, max: teacher.params.patrolMaxX, speed: teacher.params.speed },
      { min: 6, max: 14, speed: 2.5 },
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        placement: true,
        quickBind: true,
        rightClickBind: true,
        patrolSettings: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
