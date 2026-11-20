'use strict';
const Route = require('../project/teacher-route.cjs'),
  { esc, $, field, select } = require('./dom.cjs');
function render(app, teacher, room, host, setTool) {
  const path = Route.nodes(teacher),
    state = app.state,
    locked = !!teacher.locked;
  if (state.teacherNodeOwner !== teacher.id) {
    state.teacherNodeOwner = teacher.id;
    state.teacherNodeIndex = 0;
  }
  const index = Math.min(state.teacherNodeIndex || 0, Math.max(0, path.length - 1)),
    node = path[index];
  host.innerHTML = `<section class="rail-node-panel"><div class="node-panel-heading"><strong>老师路线节点图</strong><span>${path.length} / ${Route.maxNodes}</span></div>
    <svg id="teacher-node-preview" viewBox="0 0 220 142" width="100%" role="img" aria-label="老师路线缩略图" style="background:#0c1724"></svg>
    <p class="hint">0 节点固定在老师身上，移动老师时整条路线跟随。每个节点可设置整格位置、从上一点到这里的用时与运动方式。</p>
    <button id="teacher-node-place" class="apply">在画布添加节点</button>
    <div class="rail-node-list">${path
      .map(
        (n, i) =>
          `<button data-teacher-node="${i}" class="${i === index ? 'active' : ''}"><b>${Route.label(i + 1)}</b><span>${n.x}, ${n.y}</span><small>${n.seconds} 秒</small></button>`,
      )
      .join('') || '<p class="hint">还没有路线节点，老师沿用旧平台左右巡查。</p>'}</div>
    ${
      node
        ? `<div class="row">${field('列 X', 'teacher-node-x', node.x, { type: 'number', min: 0, max: room.cols - 1 })}${field('行 Y', 'teacher-node-y', node.y, { type: 'number', min: 0, max: room.rows - 1 })}</div>
      ${field('本段用时（秒）', 'teacher-node-seconds', node.seconds, { type: 'number', min: 0.05, max: 60, step: 0.05 })}
      ${select('本段运动', 'teacher-node-mode', node.mode, Route.modes)}
      <button id="teacher-node-save" class="primary apply" hidden>应用本段</button>
      <div class="node-actions"><button id="teacher-node-up">↑ 提前</button><button id="teacher-node-down">↓ 后移</button><button id="teacher-node-remove" class="danger">删除</button></div>`
        : ''
    }
    ${select('路线循环方式', 'teacher-path-loop', Route.loopMode(teacher), Route.loops)}</section>`;
  const svg = $('teacher-node-preview');
  app.nodePanelRefresh = () => {
    const pts = Route.points(teacher),
      minX = Math.min(...pts.map((n) => n.x)),
      minY = Math.min(...pts.map((n) => n.y)),
      width = Math.max(...pts.map((n) => n.x)) - minX,
      height = Math.max(...pts.map((n) => n.y)) - minY,
      scale = Math.min(180 / Math.max(width, 1), 102 / Math.max(height, 1)),
      projected = pts.map((n) => ({
        x: 110 + (n.x - minX - width / 2) * scale,
        y: 71 + (n.y - minY - height / 2) * scale,
      }));
    const markup =
      `<polyline points="${projected.map((p) => p.x + ',' + p.y).join(' ')}" fill="none" stroke="#edc27d" stroke-width="2"/>` +
      projected
        .map(
          (p, i) =>
            `<g data-preview-index="${i - 1}"><circle cx="${p.x}" cy="${p.y}" r="11" fill="#0c1724" stroke="#edc27d" stroke-width="${i === index + 1 ? 3 : 1}"/><text x="${p.x}" y="${p.y + 4}" fill="#edc27d" font-size="10" text-anchor="middle">${esc(Route.label(i))}</text></g>`,
        )
        .join('');
    if (svg.dataset.preview !== markup) {
      svg.dataset.preview = markup;
      svg.innerHTML = markup;
    }
  };
  app.nodePanelRefresh();
  const choose = (i) => {
    state.teacherNodeIndex = i;
    state.inspectorTab = 'nodes';
    app.render();
  };
  svg.onclick = (event) => {
    const group = event.target.closest('[data-preview-index]');
    if (group && Number(group.dataset.previewIndex) >= 0)
      choose(Number(group.dataset.previewIndex));
  };
  host
    .querySelectorAll('[data-teacher-node]')
    .forEach((b) => (b.onclick = () => choose(Number(b.dataset.teacherNode))));
  const place = $('teacher-node-place');
  place.disabled = locked || path.length >= Route.maxNodes;
  place.onclick = () => setTool('teacher-path');
  const edit = (next, selected) => {
    if (locked) return;
    state.teacherNodeIndex = selected;
    try {
      app.store.change(() => Route.apply(teacher, next));
    } catch (e) {
      app.message(e.message, true);
    }
  };
  $('teacher-path-loop').onchange = (e) => {
    app.store.change(() => {
      teacher.params.pathLoop = e.target.value;
    });
  };
  if (!node) return;
  $('teacher-node-save').disabled = locked;
  $('teacher-node-up').disabled = locked || index === 0;
  $('teacher-node-down').disabled = locked || index === path.length - 1;
  $('teacher-node-remove').disabled = locked;
  $('teacher-node-save').onclick = () => {
    const value = {
      ...node,
      x: $('teacher-node-x').valueAsNumber,
      y: $('teacher-node-y').valueAsNumber,
      seconds: $('teacher-node-seconds').valueAsNumber,
      mode: $('teacher-node-mode').value,
    };
    if (!Route.validNode(value) || !Route.inRoom(value, room.cols, room.rows)) {
      app.message('节点必须整格在房间内，用时 0.05 至 60 秒。', true);
      return;
    }
    edit(
      path.map((n, i) => (i === index ? value : n)),
      index,
    );
  };
  const reorder = (to) => {
    const next = path.slice();
    [next[index], next[to]] = [next[to], next[index]];
    edit(next, to);
  };
  $('teacher-node-up').onclick = () => reorder(index - 1);
  $('teacher-node-down').onclick = () => reorder(index + 1);
  $('teacher-node-remove').onclick = () =>
    edit(
      path.filter((_, i) => i !== index),
      Math.max(0, index - 1),
    );
}
module.exports = { render };
