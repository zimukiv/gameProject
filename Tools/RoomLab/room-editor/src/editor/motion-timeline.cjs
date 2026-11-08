'use strict';
const Preview = require('../project/motion-preview.cjs');
const Motion = require('../project/brick-motion.cjs');
const { esc } = require('./dom.cjs');
function refs(app) {
  const s = app.state;
  return s.multiSelection.length ? s.multiSelection : s.selection ? [s.selection] : [];
}
function context(app, room) {
  const routes = Preview.collect(room, refs(app));
  const key = JSON.stringify([
    room.id,
    refs(app),
    routes.map((r) => [r.id, r.item.x, r.item.y, r.path]),
  ]);
  return { routes, key };
}
function install(app, room, host) {
  const { routes, key } = context(app, room);
  if (!routes.length) {
    app.state.motionPreview = null;
    return;
  }
  if (app.state.motionPreview?.key !== key)
    app.state.motionPreview = { key, time: 0, enabled: false, reverse: false };
  const state = app.state.motionPreview;
  const max = Math.max(...routes.map((r) => Motion.duration(r.path)), 0);
  state.time = Math.min(state.time, max);
  host.insertAdjacentHTML(
    'beforeend',
    `<section class="motion-timeline"><h3>机关演算轴 · ${routes.length} 块</h3>
    <p class="hint">各砖同时开始，短路径到达后停留。彩色半透明方块为演算位置，不改变存档；不模拟角色碰撞和触发时序。</p>
    <label class="check"><input id="motion-preview-enabled" data-live-field="1" type="checkbox" ${state.enabled ? 'checked' : ''}>显示演算位置</label>
    <select id="motion-preview-direction" data-live-field="1" aria-label="演算方向"><option value="forward" ${!state.reverse ? 'selected' : ''}>起点 → 末端</option><option value="reverse" ${state.reverse ? 'selected' : ''}>末端 → 起点</option></select>
    <input id="motion-preview-range" data-live-field="1" type="range" min="0" max="${max}" step="0.001" value="${state.time}" aria-label="拖动演算时间">
    <label>时间（秒）<input id="motion-preview-time" data-live-field="1" type="number" min="0" max="${max}" step="0.01" value="${state.time}"></label>
    <div class="motion-time-stops">${Preview.stops(routes, state.reverse)
      .map(
        ([t, names]) =>
          `<button data-motion-time="${t}" title="${esc(names.join('；'))}">${t} s<small>${esc(names.length === 1 ? names[0] : names.length + ' 个节点')}</small></button>`,
      )
      .join('')}</div>
    <div class="motion-route-legend">${routes.map((r, i) => `<small style="color:${r.color}">${i + 1}号砖：${esc(r.item.name || r.item.label || r.item.x + ', ' + r.item.y)} · ${Number(Motion.duration(r.path).toFixed(6))} s</small>`).join('')}</div>
    </section>`,
  );
  const section = host.querySelector('.motion-timeline'),
    find = (id) => section.querySelector('#' + id);
  const refresh = () => {
    section
      .querySelectorAll('[data-motion-time]')
      .forEach((b) =>
        b.classList.toggle('active', Math.abs(Number(b.dataset.motionTime) - state.time) < 1e-7),
      );
    app.currentDraw?.();
  };
  const set = (value) => {
    if (!Number.isFinite(value)) return;
    state.time = Math.max(0, Math.min(max, value));
    state.enabled = true;
    find('motion-preview-range').value = state.time;
    find('motion-preview-time').value = state.time;
    find('motion-preview-enabled').checked = true;
    refresh();
  };
  find('motion-preview-range').oninput = (e) => set(e.target.valueAsNumber);
  find('motion-preview-time').oninput = (e) => {
    if (e.target.value !== '') set(e.target.valueAsNumber);
  };
  find('motion-preview-enabled').onchange = (e) => {
    state.enabled = e.target.checked;
    refresh();
  };
  find('motion-preview-direction').onchange = (e) => {
    state.reverse = e.target.value === 'reverse';
    state.enabled = true;
    section.remove();
    install(app, room, host);
    app.currentDraw?.();
  };
  section
    .querySelectorAll('[data-motion-time]')
    .forEach((b) => (b.onclick = () => set(Number(b.dataset.motionTime))));
  refresh();
}
function draw(app, room, ctx, view) {
  const state = app.state.motionPreview;
  if (!state?.enabled) return;
  const { routes, key } = context(app, room);
  if (state.key !== key) return;
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  const box = (item, point, color, label) => {
    const x = point.x * 32,
      y = point.y * 32,
      w = (item.w || 1) * 32,
      h = (item.h || 1) * 32;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.38;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeRect(x, y, w, h);
    ctx.font = `${12 / view.scale}px sans-serif`;
    ctx.fillText(label, x + 3 / view.scale, y + 14 / view.scale);
  };
  routes.forEach((route, i) => {
    const point = Preview.sample(route, state.time, state.reverse);
    box(route.item, point, route.color, String(i + 1));
    for (const item of [...room.tiles, ...room.objects].filter(
      (o) => o.attachmentTo === route.item.id,
    ))
      box(
        item,
        { x: item.x + point.x - route.item.x, y: item.y + point.y - route.item.y },
        route.color,
        item.type === 'common.spike' ? '^' : '',
      );
  });
  ctx.restore();
}
module.exports = { install, draw };
