'use strict';
const { $, esc } = require('./dom.cjs');
const RoomDetails = require('./cloud-room-details.cjs');
function layout(state) {
  const meta = new Map((state.graph?.metadata || []).map((r) => [r.id, r])),
    deleted = new Set([...meta.values()].filter((r) => r.deletedAt).map((r) => r.id));
  const nodes = new Map(
    (state.revisions || [])
      .filter((r) => !deleted.has(r.id))
      .map((r) => [
        r.id,
        {
          ...r,
          sourceParent: r.parent,
          parent: meta.has(r.id) ? meta.get(r.id).parentId : r.parent || null,
          branches: [],
        },
      ]),
  );
  for (const b of state.branches || [])
    if (b.head && !deleted.has(b.head)) {
      if (!nodes.has(b.head))
        nodes.set(b.head, {
          id: b.head,
          parent: meta.get(b.head)?.parentId || null,
          missing: true,
          branches: [],
        });
      nodes.get(b.head).branches.push(b.name);
    }
  for (const n of [...nodes.values()]) {
    if (deleted.has(n.parent)) n.parent = null;
    if (n.parent && !nodes.has(n.parent))
      nodes.set(n.parent, { id: n.parent, parent: null, missing: true, branches: [] });
  }
  for (const n of nodes.values()) {
    const seen = new Set([n.id]);
    for (let p = n.parent; p && nodes.has(p); p = nodes.get(p).parent) {
      if (seen.has(p)) {
        n.parent = null;
        break;
      }
      seen.add(p);
    }
  }
  const children = new Map();
  for (const n of nodes.values()) {
    if (!children.has(n.parent)) children.set(n.parent, []);
    children.get(n.parent).push(n);
  }
  let row = 0;
  function place(n, depth) {
    const kids = children.get(n.id) || [],
      start = row;
    if (kids.length) kids.forEach((k) => place(k, depth + 1));
    else row++;
    n.x = 24 + depth * 258;
    n.y = 24 + (kids.length ? (start + row - 1) / 2 : row - 1) * 124;
  }
  (children.get(null) || []).forEach((n) => place(n, 0));
  return {
    nodes: [...nodes.values()],
    width: Math.max(520, ...[...nodes.values()].map((n) => n.x + 246)),
    height: Math.max(270, row * 124 + 40),
  };
}
function render() {
  return `<section class="cloud-section" id="cloud-preview"><h3>② 云端工作树预览与切换</h3><div class="button-row"><button id="cloud-remote">刷新节点图</button><button id="cloud-graph-fit">适应全部</button><button id="cloud-clear-selection">取消选择</button><button id="cloud-open-manager">浏览器中管理关系 / 删除节点</button></div><div class="cloud-graph-layout"><div id="cloud-graph-stage" tabindex="0" aria-label="云端工作树节点图"></div><aside id="cloud-node-detail">刷新节点图后选择版本。</aside></div><p class="muted">滚轮缩放 · 拖动空白平移。此处只预览和切换；未选择节点时，保存同步从上次读取版本建立子节点。</p></section>`;
}
function bind(controller, { refresh, checkout, upload, importRooms }) {
  controller.graphProjects ||= new Map();
  controller.graphProjectPending ||= new Map();
  controller.graphProjectErrors ||= new Map();
  controller.graphRoomPicks ||= new Map();
  const initialView = !controller.graphView;
  const host = $('cloud-graph-stage'),
    detail = $('cloud-node-detail');
  let graph = layout(controller.remoteState || {}),
    drag = null;
  const current = () =>
    controller.status?.trees.find((t) => t.id === controller.status.current)?.readRevision;
  const state = () => controller.graphView || (controller.graphView = { x: 14, y: 14, scale: 1 });
  const active = () => host.isConnected && $('cloud-graph-stage') === host;
  function loadProject(id) {
    if (
      controller.graphProjects.has(id) ||
      controller.graphProjectPending.has(id) ||
      controller.graphProjectErrors.has(id)
    )
      return;
    const epoch = controller.graphWorkspaceEpoch || 0;
    const promise = controller.api.cloud('inspectRevision', { id });
    controller.graphProjectPending.set(id, promise);
    promise
      .then((data) => {
        if ((controller.graphWorkspaceEpoch || 0) === epoch)
          controller.graphProjects.set(id, data.project);
      })
      .catch((e) => {
        if ((controller.graphWorkspaceEpoch || 0) === epoch)
          controller.graphProjectErrors.set(id, e.message);
      })
      .finally(() => {
        if (controller.graphProjectPending.get(id) === promise)
          controller.graphProjectPending.delete(id);
        if (active()) {
          draw();
          prefetch();
        }
      });
  }
  function prefetch() {
    if (!active() || !controller.remoteState) return;
    for (const n of graph.nodes.slice(0, 6))
      if (controller.graphProjectPending.size < 2 && !n.summary?.projectName) loadProject(n.id);
  }
  function details() {
    const n = graph.nodes.find((n) => n.id === controller.graphSelected);
    if (!n) {
      detail.innerHTML = `<h4>尚未选择云端节点</h4><p>当前读取来源：<code>${esc(current()?.slice(0, 12) || '根版本')}</code></p><p>默认上传到该来源下方；可选中其他已有节点。</p>`;
      return;
    }
    const project = controller.graphProjects.get(n.id),
      picks = controller.graphRoomPicks.get(n.id) || new Set();
    controller.graphRoomPicks.set(n.id, picks);
    detail.innerHTML = RoomDetails.render(
      n,
      project,
      picks,
      current(),
      controller.graphProjectErrors.get(n.id),
    );
    $('cloud-node-checkout').onclick = () => checkout(n.id);
    $('cloud-node-upload').onclick = () => upload(n.id);
    $('cloud-node-import').onclick = () => importRooms(n.id, [...picks]);
    if (project) RoomDetails.bind(project, picks, () => {});
    else loadProject(n.id);
    if ($('cloud-project-retry'))
      $('cloud-project-retry').onclick = () => {
        controller.graphProjectErrors.delete(n.id);
        loadProject(n.id);
        details();
      };
  }
  function draw() {
    graph = layout(controller.remoteState || {});
    const v = state();
    if (!controller.remoteState) {
      host.innerHTML = '<p class="cloud-graph-empty">连接云端后点击刷新节点图。</p>';
      details();
      return;
    }
    if (!graph.nodes.length) {
      host.innerHTML = '<p class="cloud-graph-empty">云端尚无版本。保存同步可创建根节点。</p>';
      details();
      return;
    }
    host.innerHTML = `<svg role="img" aria-label="云端节点关系"><g transform="translate(${v.x},${v.y}) scale(${v.scale})">${graph.nodes
      .filter((n) => n.parent)
      .map((n) => {
        const p = graph.nodes.find((p) => p.id === n.parent);
        return p
          ? `<path d="M${p.x + 218},${p.y + 44} C${p.x + 240},${p.y + 44} ${n.x - 22},${n.y + 44} ${n.x},${n.y + 44}"/>`
          : '';
      })
      .join(
        '',
      )}${graph.nodes.map((n) => `<g data-cloud-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.message || '未命名版本')}" aria-pressed="${n.id === controller.graphSelected}" class="cloud-graph-node ${n.id === controller.graphSelected ? 'selected' : ''} ${n.id === current() ? 'current' : ''}" transform="translate(${n.x},${n.y})"><title>${esc(n.message || '')}</title><rect width="218" height="88" rx="8"/><circle cx="0" cy="44" r="4"/><circle cx="218" cy="44" r="4"/><text x="12" y="22">${n.id === current() ? '● 当前读取版本' : n.id === controller.graphSelected ? '● 已选择' : '已保存版本'}</text><text x="12" y="47">${esc((n.message || '未命名版本').slice(0, 14))}</text><text x="12" y="70">${esc((controller.graphProjects.get(n.id)?.courses.reduce((sum, c) => sum + c.rooms.length, 0) ?? n.summary?.roomCount ?? '—') + ' 房间 · ' + n.id.slice(0, 8))}</text></g>`).join('')}</g></svg>`;
    for (const el of host.querySelectorAll('[data-cloud-node]')) {
      const select = () => {
        controller.graphSelected = el.dataset.cloudNode;
        draw();
      };
      el.onclick = select;
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      };
    }
    details();
  }
  function fit() {
    const s = Math.max(
      0.04,
      Math.min(1, (host.clientWidth - 36) / graph.width, (host.clientHeight - 36) / graph.height),
    );
    controller.graphView = {
      scale: s,
      x: (host.clientWidth - graph.width * s) / 2,
      y: (host.clientHeight - graph.height * s) / 2,
    };
    draw();
  }
  host.onwheel = (e) => {
    e.preventDefault();
    const b = host.getBoundingClientRect(),
      v = state(),
      x = e.clientX - b.left,
      y = e.clientY - b.top,
      s = Math.max(0.04, Math.min(2.5, v.scale * Math.exp(-e.deltaY * 0.0015)));
    controller.graphView = {
      scale: s,
      x: x - ((x - v.x) * s) / v.scale,
      y: y - ((y - v.y) * s) / v.scale,
    };
    draw();
  };
  host.onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest('[data-cloud-node]')) return;
    drag = { x: e.clientX, y: e.clientY, view: { ...state() } };
    host.setPointerCapture(e.pointerId);
  };
  host.onpointermove = (e) => {
    if (drag) {
      controller.graphView = {
        ...drag.view,
        x: drag.view.x + e.clientX - drag.x,
        y: drag.view.y + e.clientY - drag.y,
      };
      draw();
    }
  };
  host.onpointerup = host.onpointercancel = () => {
    drag = null;
  };
  $('cloud-remote').onclick = refresh;
  $('cloud-graph-fit').onclick = fit;
  $('cloud-clear-selection').onclick = () => {
    controller.graphSelected = null;
    draw();
  };
  draw();
  prefetch();
  if (initialView) requestAnimationFrame(fit);
  return {
    draw: () => {
      draw();
      prefetch();
    },
    fit,
  };
}
module.exports = { layout, render, bind };
