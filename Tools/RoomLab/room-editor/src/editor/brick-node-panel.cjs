'use strict';
const Motion = require('../project/brick-motion.cjs'),
  { label } = require('../project/rail-nodes.cjs'),
  { $, esc, field, select } = require('./dom.cjs');

function render(app, brick, room, host, setTool) {
  const path = Motion.nodes(brick),
    state = app.state,
    members = Motion.groupMembers(room, brick),
    locked =
      members.some((member) => member.locked) ||
      require('../project/block-groups.cjs')
        .members(room, brick)
        .some(({ item }) => item.locked);
  if (state.brickNodeOwner !== brick.id) {
    state.brickNodeOwner = brick.id;
    state.brickNodeIndex = 0;
  }
  const index = Math.min(state.brickNodeIndex || 0, path.length - 1),
    node = path[index],
    color = Motion.colorFor(room, brick.padId);
  const number = (name, id, value, max, min = 0, step = 1) =>
    field(name, id, value, { type: 'number', min, max, step });
  host.innerHTML = `<section class="rail-node-panel"><div class="node-panel-heading"><strong>机关砖节点图</strong><span>${path.length} / ${Motion.maxNodes}</span></div>
    <svg id="brick-node-preview" viewBox="0 0 220 142" width="100%" role="img" aria-label="机关砖路线缩略图" style="background:#0c1724"></svg>
    <p class="hint">0 为砖的起点。移动砖时整条轨迹跟随。每个节点设置从上一点到这里的运动。</p>
    <button id="brick-node-place" class="apply">在画布添加节点</button>
    <div class="rail-node-list">${path.map((n, i) => `<button data-brick-node="${i}" class="${i === index ? 'active' : ''}"><b>${label(i + 1)}</b><span>${n.x}, ${n.y}</span><small>${n.seconds} 秒</small></button>`).join('')}</div>
    ${
      node
        ? `<div class="row">${number('列 X', 'brick-node-x', node.x, room.cols - 1)}${number('行 Y', 'brick-node-y', node.y, room.rows - 1)}</div>
      ${number('本段用时（秒）', 'brick-node-seconds', node.seconds, 60, 0.05, 0.05)}
      ${select('本段运动', 'brick-node-mode', node.mode, Motion.modes)}
      <button id="brick-node-save" class="primary apply">应用本段</button>
      <div class="node-actions"><button id="brick-node-up">↑ 提前</button><button id="brick-node-down">↓ 后移</button><button id="brick-node-remove" class="danger">删除</button></div>`
        : ''
    }</section>`;
  const svg = $('brick-node-preview');
  app.nodePanelRefresh = () => {
    const all = [brick, ...Motion.nodes(brick)],
      minX = Math.min(...all.map((n) => n.x)),
      minY = Math.min(...all.map((n) => n.y)),
      width = Math.max(...all.map((n) => n.x)) - minX,
      height = Math.max(...all.map((n) => n.y)) - minY,
      scale = Math.min(180 / Math.max(width, 1), 102 / Math.max(height, 1)),
      points = all.map((n) => ({
        x: 110 + (n.x - minX - width / 2) * scale,
        y: 71 + (n.y - minY - height / 2) * scale,
      }));
    const markup =
      `<polyline points="${points.map((p) => p.x + ',' + p.y).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>` +
      points
        .map(
          (p, i) =>
            `<g data-preview-index="${i - 1}"><circle cx="${p.x}" cy="${p.y}" r="11" fill="#0c1724" stroke="${color}" stroke-width="${i === index + 1 ? 3 : 1}"/><text x="${p.x}" y="${p.y + 4}" fill="${color}" font-size="10" text-anchor="middle">${esc(label(i))}</text></g>`,
        )
        .join('');
    if (svg.dataset.preview !== markup) {
      svg.dataset.preview = markup;
      svg.innerHTML = markup;
    }
  };
  app.nodePanelRefresh();
  const choose = (i) => {
    state.brickNodeIndex = i;
    app.render();
  };
  svg.onclick = (event) => {
    const group = event.target.closest('[data-preview-index]');
    if (group && Number(group.dataset.previewIndex) >= 0)
      choose(Number(group.dataset.previewIndex));
  };
  host
    .querySelectorAll('[data-brick-node]')
    .forEach((b) => (b.onclick = () => choose(Number(b.dataset.brickNode))));
  $('brick-node-place').disabled = locked || path.length >= Motion.maxNodes;
  $('brick-node-place').onclick = () => setTool('brick-path');
  if (!node) return;
  $('brick-node-save').disabled = locked;
  $('brick-node-up').disabled = locked || index === 0;
  $('brick-node-down').disabled = locked || index === path.length - 1;
  $('brick-node-remove').disabled = locked;
  function edit(next, selected) {
    if (locked) return;
    state.brickNodeIndex = selected;
    let applied;
    app.store.change(() => {
      applied = Motion.applyGroupPath(room, members, brick, next);
    });
    if (!applied) app.message('本次编辑会让组内机关砖的节点越界。', true);
  }
  $('brick-node-save').onclick = () => {
    const value = {
      x: $('brick-node-x').valueAsNumber,
      y: $('brick-node-y').valueAsNumber,
      seconds: $('brick-node-seconds').valueAsNumber,
      mode: $('brick-node-mode').value,
    };
    if (!Motion.validNode(value) || !Motion.inRoom(value, room.cols, room.rows)) {
      app.message('节点必须在房间内，用时为 0.05 至 60 秒。', true);
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
  $('brick-node-up').onclick = () => reorder(index - 1);
  $('brick-node-down').onclick = () => reorder(index + 1);
  $('brick-node-remove').onclick = () =>
    edit(
      path.filter((_, i) => i !== index),
      Math.max(0, index - 1),
    );
}
module.exports = { render };
