'use strict';
const Nodes = require('../project/rail-nodes.cjs'),
  { clamp } = require('../shared/utils.cjs');
const { esc, $, field } = require('./dom.cjs');
function render(app, owner, room, host, setTool) {
  const s = app.state,
    path = owner.params.path || [];
  if (!path.some((n) => n.id === s.railNodeId)) s.railNodeId = path[0]?.id || null;
  const current = () => path.find((n) => n.id === s.railNodeId),
    selected = current(),
    index = path.indexOf(selected);
  host.innerHTML = `<section class="rail-node-panel"><div class="node-panel-heading"><strong>装置子节点</strong><span>${path.length} / 64</span></div><canvas id="rail-node-preview" width="220" height="142" aria-label="节点顺序与相对位置预览"></canvas><p class="hint">线条方向为 0 → I → II；方框为装置。新放置装置的 0 节点默认在方块中心，后续节点按罗马数字排序。可点击缩略图或列表选择节点。</p><div class="node-actions"><button id="rail-node-add">＋ 新增节点</button><button id="rail-node-place">画布加点</button></div><div class="rail-node-list">${path.map((n, i) => `<button data-node-id="${esc(n.id)}" class="${n.id === s.railNodeId ? 'active' : ''}"><b>${Nodes.label(i)}</b><span>节点 ${i}</span><small>Δ ${Number((n.x - owner.x).toFixed(2))}, ${Number((n.y - owner.y).toFixed(2))}</small></button>`).join('') || '<p class="hint">尚无节点，至少两个节点才能加速。</p>'}</div>${selected ? `<div class="node-coordinate-heading">${Nodes.label(index)} · 精确坐标</div><div class="row">${field('X（格）', 'rail-node-x', selected.x, { type: 'number', min: 0, max: room.cols, step: 0.01 })}${field('Y（格）', 'rail-node-y', selected.y, { type: 'number', min: 0, max: room.rows, step: 0.01 })}</div><p id="rail-node-relative" class="hint"></p><button id="rail-node-apply" class="apply primary">应用节点坐标</button><div class="node-actions"><button id="rail-node-up">↑ 提前</button><button id="rail-node-down">↓ 后移</button><button id="rail-node-delete" class="danger">删除</button></div>` : ''}<p class="hint">画布拖动默认吸附 0.5 格；按住 Alt 精细移动。移动装置时，所有子节点一起移动。</p></section>`;
  const change = (fn) => {
    if (owner.locked) {
      app.message('装置位置已锁定，请先取消锁定。', true);
      return;
    }
    try {
      app.store.change(fn);
    } catch (e) {
      app.message(e.message, true);
    }
  };
  const choose = (id) => {
    s.railNodeId = id;
    app.render();
  };
  host
    .querySelectorAll('[data-node-id]')
    .forEach((b) => (b.onclick = () => choose(b.dataset.nodeId)));
  $('rail-node-add').disabled = path.length >= 64;
  $('rail-node-add').onclick = () =>
    change(() => {
      const last = path.at(-1),
        n = Nodes.add(owner, {
          x: clamp(last ? last.x + 3 : owner.x + 0.5, 0, room.cols),
          y: clamp(last?.y ?? owner.y, 0, room.rows),
        });
      s.railNodeId = n.id;
    });
  $('rail-node-place').onclick = () => setTool('path');
  if (selected) {
    $('rail-node-up').disabled = index === 0;
    $('rail-node-down').disabled = index === path.length - 1;
    $('rail-node-up').onclick = () => change(() => Nodes.reorder(owner, selected.id, -1));
    $('rail-node-down').onclick = () => change(() => Nodes.reorder(owner, selected.id, 1));
    $('rail-node-delete').onclick = () =>
      change(() => {
        Nodes.remove(owner, selected.id);
        s.railNodeId = owner.params.path[Math.min(index, owner.params.path.length - 1)]?.id || null;
      });
    $('rail-node-apply').onclick = () => {
      const x = Number($('rail-node-x').value),
        y = Number($('rail-node-y').value);
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > room.cols ||
        y < 0 ||
        y > room.rows
      ) {
        app.message('节点坐标需在房间范围内', true);
        return;
      }
      change(() => Nodes.move(owner, selected.id, { x, y }, room));
    };
  }
  const canvas = $('rail-node-preview'),
    ctx = canvas.getContext('2d');
  let points = [],
    lastPosition = null;
  app.nodePanelRefresh = () => {
    const list = owner.params.path || [],
      anchor = { x: owner.x + 0.5, y: owner.y + 0.5 },
      all = [anchor, ...list],
      minX = Math.min(...all.map((n) => n.x)) - 1,
      maxX = Math.max(...all.map((n) => n.x)) + 1,
      minY = Math.min(...all.map((n) => n.y)) - 1,
      maxY = Math.max(...all.map((n) => n.y)) + 1,
      scale = Math.min(186 / (maxX - minX), 108 / (maxY - minY)),
      left = (220 - (maxX - minX) * scale) / 2,
      top = (142 - (maxY - minY) * scale) / 2,
      project = (n) => ({ x: left + (n.x - minX) * scale, y: top + (n.y - minY) * scale });
    ctx.fillStyle = '#0c1724';
    ctx.fillRect(0, 0, 220, 142);
    ctx.strokeStyle = '#31495e';
    ctx.lineWidth = 1;
    for (let x = 10; x < 220; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 142);
      ctx.stroke();
    }
    const device = project(anchor);
    ctx.fillStyle = '#63c9cd';
    ctx.fillRect(device.x - 6, device.y - 6, 12, 12);
    points = list.map((n) => ({ ...project(n), id: n.id }));
    ctx.strokeStyle = '#e7bf79';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        x = (a.x + b.x) / 2,
        y = (a.y + b.y) / 2,
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.beginPath();
      ctx.moveTo(x - 6 * Math.cos(angle - 0.5), y - 6 * Math.sin(angle - 0.5));
      ctx.lineTo(x, y);
      ctx.lineTo(x - 6 * Math.cos(angle + 0.5), y - 6 * Math.sin(angle + 0.5));
      ctx.stroke();
    }
    points.forEach((p, i) => {
      ctx.fillStyle = p.id === s.railNodeId ? '#f1c87c' : '#192e41';
      ctx.strokeStyle = '#edc27d';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = '11px Consolas,monospace';
      ctx.fillStyle = p.id === s.railNodeId ? '#172231' : '#f1d69e';
      ctx.textAlign = 'center';
      ctx.fillText(Nodes.label(i), p.x, p.y + 4);
    });
    ctx.strokeStyle = '#63c9cd';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(device.x - 15, device.y - 15, 30, 30);
    ctx.fillStyle = '#8de8e1';
    ctx.font = '10px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('装置', device.x, Math.min(136, device.y + 28));
    const n = current();
    if (n) {
      if (
        !lastPosition ||
        lastPosition.id !== n.id ||
        lastPosition.x !== n.x ||
        lastPosition.y !== n.y
      )
        for (const [key, value] of [
          ['rail-node-x', n.x],
          ['rail-node-y', n.y],
        ])
          if ($(key) && document.activeElement !== $(key)) $(key).value = value;
      lastPosition = { id: n.id, x: n.x, y: n.y };
      if ($('rail-node-relative'))
        $('rail-node-relative').textContent =
          `相对装置：ΔX ${Number((n.x - owner.x).toFixed(2))} / ΔY ${Number((n.y - owner.y).toFixed(2))}`;
    }
  };
  canvas.onclick = (e) => {
    const b = canvas.getBoundingClientRect(),
      p = { x: ((e.clientX - b.left) / b.width) * 220, y: ((e.clientY - b.top) / b.height) * 142 },
      hit = points
        .slice()
        .reverse()
        .find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= 14);
    if (hit) choose(hit.id);
  };
  app.nodePanelRefresh();
}
module.exports = { render };
