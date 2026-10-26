'use strict';
const Limits = require('../../project/room-limits.cjs');
const D = require('../draw.cjs'),
  M = require('../../project/model.cjs'),
  { esc, $, field, area, select, modal } = require('../dom.cjs');
const { clamp } = require('../../shared/utils.cjs');
const GraphLayout = require('../graph-layout.cjs');
function addRoom(app, c) {
  app.store.change(() => {
    const r = M.room(
      M.uid('room'),
      '新房间 ' + (c.rooms.length + 1),
      c.defaultSize.cols,
      c.defaultSize.rows,
    );
    M.floor(r, 0, r.cols - 1, r.rows - 3);
    r.graph = {
      x: 40 + (c.rooms.length % 3) * (GraphLayout.card(r).width + 30),
      y: 90 + Math.floor(c.rooms.length / 3) * (GraphLayout.card(r).height + 35),
    };
    r.exits = [
      { id: M.uid('exit'), name: '出口', notes: '', x: r.cols - 2, y: r.rows - 5, w: 1, h: 2 },
    ];
    c.rooms.push(r);
  });
}
function render(app) {
  const c = app.course(),
    tab = app.state.courseTab || 'graph';
  $('app').innerHTML =
    `<div class="page-title"><div><h1>${esc(c.name)}</h1><p class="muted">${esc(c.notes)} · AI ID：${esc(c.aiId || '未指定')}</p></div><div class="actions"><button id="add-room">新建房间</button><button id="test-course" class="primary">从首房试玩</button></div></div><div class="tabs">${[
      ['graph', '缩略接线板'],
      ['rooms', '房间列表'],
      ['settings', '大关规则'],
      ['bindings', '本关美术绑定'],
    ]
      .map(
        ([id, name]) =>
          `<button data-tab="${id}" class="${tab === id ? 'active' : ''}">${name}</button>`,
      )
      .join('')}</div><div id="course-content"></div>`;
  $('add-room').onclick = () => addRoom(app, c);
  $('test-course').onclick = () => app.startPlay(c.rooms[0].id);
  $('app')
    .querySelectorAll('[data-tab]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          app.state.courseTab = b.dataset.tab;
          app.render();
        }),
    );
  if (tab === 'graph') graph(app, c);
  else if (tab === 'rooms') rooms(app, c);
  else if (tab === 'settings') settings(app, c);
  else app.renderBindings(c, $('course-content'));
}
function rooms(app, c) {
  $('course-content').innerHTML =
    `<div class="cards">${c.rooms.map((r) => `<article class="card room-card"><canvas width="270" height="150" data-mini="${esc(r.id)}"></canvas><h2>${esc(r.name)}</h2><p>${r.cols}×${r.rows} · ${esc(r.phase)} · ${r.entries.length} 个入口 / ${r.exits.length} 个出口</p><p>${esc(r.notes || '无备注')}</p><button data-room="${esc(r.id)}">编辑房间</button></article>`).join('')}</div>`;
  $('app')
    .querySelectorAll('[data-mini]')
    .forEach((canvas) =>
      D.miniature(
        canvas.getContext('2d'),
        c.rooms.find((r) => r.id === canvas.dataset.mini),
        0,
        0,
        270,
        150,
      ),
    );
  $('app')
    .querySelectorAll('[data-room]')
    .forEach((b) => (b.onclick = () => app.go('room', { roomId: b.dataset.room })));
}
function settings(app, c) {
  $('course-content').innerHTML =
    `<div class="panel form" style="max-width:650px">${field('大关名称', 'course-name', c.name)}${area('大关备注', 'course-notes', c.notes)}${field('默认 AI ID（不配置技能）', 'course-ai', c.aiId)}<div class="row">${field('新房间默认列数', 'course-cols', c.defaultSize.cols, { type: 'number', min: 6, max: Limits.MAX_COLS })}${field('新房间默认行数', 'course-rows', c.defaultSize.rows, { type: 'number', min: 5, max: Limits.MAX_ROWS })}</div><p class="hint">默认尺寸只影响以后创建的房间。首冲落地恢复，并计入每周期三次上限；付费库存不因落地补满。</p><button id="save-course" class="primary apply">应用大关设置</button></div>`;
  $('save-course').onclick = () => {
    const cols = Number($('course-cols').value),
      rows = Number($('course-rows').value);
    if (!Limits.valid(cols, rows)) {
      app.message(Limits.description, true);
      return;
    }
    app.store.change(() => {
      c.name = $('course-name').value.trim() || c.name;
      c.notes = $('course-notes').value;
      c.aiId = $('course-ai').value.trim();
      c.defaultSize = { cols, rows };
    });
  };
}
function graph(app, c) {
  const selected = app.state.graphSelection;
  $('course-content').innerHTML =
    `<div class="graph-layout"><div class="panel graph-panel"><div class="graph-controls"><span>缩略接线板</span><div class="actions"><span id="graph-zoom"></span><button id="graph-fit">查看全部</button><button id="graph-reset">100%</button></div></div><canvas id="graph" width="1120" height="650"></canvas><div class="graph-help">滚轮缩放 · 中键平移 · 双击进入房间。绿色为入口、橙色为出口，位置对应缩略图里的实际位置；悬停查看名称，从出口拉线到入口。</div></div><aside class="panel form" id="graph-inspector"></aside></div>`;
  const canvas = $('graph'),
    ctx = canvas.getContext('2d');
  canvas.width = 1120;
  canvas.height = 650;
  if (app.state.graphViewCourse !== c.id) {
    app.state.graphView = { x: 0, y: 0, scale: 1 };
    app.state.graphViewCourse = c.id;
  }
  const view = app.state.graphView;
  let drag = null,
    wire = null,
    pan = null;
  const pixel = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  const point = (e) => {
    const p = pixel(e);
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
  };
  const port = (p, kind) => {
    for (const r of c.rooms)
      for (const node of D.graphPorts(r)[kind])
        if (Math.hypot(node.x - p.x, node.y - p.y) < 9 / view.scale) return node;
    return null;
  };
  const node = (p) =>
    c.rooms
      .slice()
      .reverse()
      .find(
        (r) =>
          p.x > r.graph.x &&
          p.x < r.graph.x + GraphLayout.card(r).width &&
          p.y > r.graph.y &&
          p.y < r.graph.y + GraphLayout.card(r).height,
      );
  const draw = () => {
    D.drawGraph(ctx, app.store.project, c, app.state.graphSelection, wire, view);
    $('graph-zoom').textContent = Math.round(view.scale * 100) + '%';
  };
  $('graph-reset').onclick = () => {
    Object.assign(view, { x: 0, y: 0, scale: 1 });
    draw();
  };
  $('graph-fit').onclick = () => {
    const minX = Math.min(...c.rooms.map((r) => r.graph.x)) - 25,
      minY = Math.min(...c.rooms.map((r) => r.graph.y)) - 25,
      maxX = Math.max(...c.rooms.map((r) => r.graph.x + GraphLayout.card(r).width)) + 25,
      maxY = Math.max(...c.rooms.map((r) => r.graph.y + GraphLayout.card(r).height)) + 25;
    view.scale = clamp(
      Math.min(canvas.width / (maxX - minX), canvas.height / (maxY - minY)),
      0.01,
      3,
    );
    view.x = (canvas.width - (maxX - minX) * view.scale) / 2 - minX * view.scale;
    view.y = (canvas.height - (maxY - minY) * view.scale) / 2 - minY * view.scale;
    draw();
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const p = pixel(e),
      world = point(e);
    view.scale = clamp(view.scale * Math.exp(-e.deltaY * 0.0015), 0.01, 3);
    view.x = p.x - world.x * view.scale;
    view.y = p.y - world.y * view.scale;
    draw();
  };
  draw();
  renderGraphInspector(app, c);
  canvas.onpointerdown = (e) => {
    if (![0, 1].includes(e.button)) return;
    e.preventDefault();
    if (e.button === 1) {
      pan = { point: pixel(e), x: view.x, y: view.y };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      return;
    }
    const p = point(e),
      out = port(p, 'exits');
    canvas.setPointerCapture(e.pointerId);
    if (out) {
      wire = { roomId: out.roomId, exitId: out.id, x: out.x, y: out.y, to: p };
      return;
    }
    const r = node(p);
    const selectNode = () => {
      app.state.graphSelection = { kind: 'room', id: r.id };
      drag = { r, start: p, origin: { ...r.graph }, before: app.store.snapshot() };
      draw();
      renderGraphInspector(app, c);
    };
    if (r && p.y < r.graph.y + GraphLayout.TITLE_HEIGHT) {
      selectNode();
      return;
    }
    for (const edge of c.connections) {
      const a = c.rooms.find((r) => r.id === edge.from.roomId),
        b = c.rooms.find((r) => r.id === edge.to.roomId),
        from = D.graphPorts(a).exits.find((v) => v.id === edge.from.exitId),
        to = D.graphPorts(b).entries.find((v) => v.id === edge.to.entryId);
      if (!from || !to) continue;
      const curve = D.graphCurve(c, from, to);
      for (let n = 0; n <= 30; n++) {
        const t = n / 30,
          u = 1 - t,
          x =
            u * u * u * from.x +
            3 * u * u * t * curve.c1.x +
            3 * u * t * t * curve.c2.x +
            t * t * t * to.x,
          y =
            u * u * u * from.y +
            3 * u * u * t * curve.c1.y +
            3 * u * t * t * curve.c2.y +
            t * t * t * to.y;
        if (Math.hypot(x - p.x, y - p.y) < 10) {
          app.state.graphSelection = { kind: 'wire', id: edge.id };
          draw();
          renderGraphInspector(app, c);
          return;
        }
      }
    }
    if (r) {
      selectNode();
      return;
    }
    app.state.graphSelection = null;
    draw();
    renderGraphInspector(app, c);
  };
  canvas.onpointermove = (e) => {
    if (pan) {
      const p = pixel(e);
      view.x = pan.x + p.x - pan.point.x;
      view.y = pan.y + p.y - pan.point.y;
      draw();
      return;
    }
    const p = point(e);
    const hovered = port(p, 'exits') || port(p, 'entries');
    canvas.title = hovered ? hovered.label : '';
    if (wire) {
      wire.to = p;
      draw();
    }
    if (drag) {
      drag.r.graph = {
        x: Math.max(8, drag.origin.x + p.x - drag.start.x),
        y: Math.max(8, drag.origin.y + p.y - drag.start.y),
      };
      draw();
    }
  };
  canvas.onpointerup = (e) => {
    if (pan) {
      pan = null;
      canvas.style.cursor = 'default';
      return;
    }
    if (wire) {
      const input = port(point(e), 'entries');
      if (input) {
        const before = app.store.snapshot();
        M.connect(c, wire.roomId, wire.exitId, input.roomId, input.id);
        wire = null;
        app.store.commit(before);
        app.message('房间端口已连接，可撤销。');
      } else {
        wire = null;
        draw();
      }
    }
    if (drag) {
      const before = drag.before;
      drag = null;
      app.store.commit(before);
    }
  };
  canvas.onpointercancel = canvas.onlostpointercapture = () => {
    wire = null;
    pan = null;
    canvas.style.cursor = 'default';
    if (drag) {
      const before = drag.before;
      drag = null;
      app.store.commit(before);
    } else draw();
  };
  canvas.ondblclick = (e) => {
    const r = node(point(e));
    if (r) app.go('room', { roomId: r.id });
  };
}
function renderGraphInspector(app, c) {
  app.updateRoomExport();
  const host = $('graph-inspector'),
    s = app.state.graphSelection;
  if (!s) {
    host.innerHTML =
      '<h2>房间通行关系</h2><p class="hint">点击缩略节点查看名称和备注。每个出口接一个入口；循环路线与多个出口共用入口均可设计。</p>';
    return;
  }
  if (s.kind === 'room') {
    const r = c.rooms.find((r) => r.id === s.id);
    if (!r) return;
    host.innerHTML = `<h2>房间节点</h2>${field('名称', 'graph-name', r.name)}${area('备注', 'graph-notes', r.notes)}<p class="hint">${r.cols}×${r.rows} · 节点位置不改变房间内部坐标。</p><div class="actions"><button id="graph-rename">保存说明</button><button id="graph-edit" class="primary">编辑房间</button><button id="graph-copy">复制房间</button><button id="graph-delete" class="danger">删除房间</button></div>`;
    $('graph-rename').onclick = () =>
      app.store.change(() => {
        r.name = $('graph-name').value.trim() || r.name;
        r.notes = $('graph-notes').value;
      });
    $('graph-edit').onclick = () => app.go('room', { roomId: r.id });
    const exportButton = document.createElement('button');
    exportButton.id = 'graph-export-room';
    exportButton.textContent = '导出此房间（含素材）';
    exportButton.onclick = () => app.exportRoom(c.id, r.id);
    $('graph-edit').after(exportButton);
    $('graph-copy').onclick = () =>
      app.store.change(() => {
        c.rooms.push(M.duplicateRoom(c, r.id));
      });
    $('graph-delete').onclick = () => {
      if (c.rooms.length === 1) {
        app.message('至少保留一个房间。', true);
        return;
      }
      const affected = c.connections.filter((w) => w.from.roomId === r.id || w.to.roomId === r.id);
      modal(
        '删除房间',
        `将删除 ${esc(r.name)}，并移除 ${affected.length} 条关联连线。操作可撤销。`,
        [
          { label: '取消' },
          {
            label: '删除并移除连线',
            primary: true,
            action: () =>
              app.store.change(() => {
                c.rooms = c.rooms.filter((v) => v.id !== r.id);
                c.connections = c.connections.filter(
                  (w) => w.from.roomId !== r.id && w.to.roomId !== r.id,
                );
                app.state.graphSelection = null;
              }),
          },
        ],
      );
    };
  } else {
    const edge = c.connections.find((w) => w.id === s.id);
    if (!edge) return;
    host.innerHTML = `<h2>连接设置</h2><p>${esc(edge.from.roomId)} → ${esc(edge.to.roomId)}</p>${select(
      '抵达入口时速度',
      'wire-velocity',
      edge.velocity,
      [
        ['reset', '归零'],
        ['keep', '保留速度'],
      ],
    )}<p class="hint">入口位置决定抵达点。名称变化不会断开连接。</p><div class="actions"><button id="wire-save">应用</button><button id="wire-delete" class="danger">删除连线</button></div>`;
    $('wire-save').onclick = () =>
      app.store.change(() => {
        edge.velocity = $('wire-velocity').value;
      });
    $('wire-delete').onclick = () =>
      app.store.change(() => {
        c.connections = c.connections.filter((v) => v.id !== edge.id);
        app.state.graphSelection = null;
      });
  }
}
module.exports = { render };
