'use strict';
// Global route map board. One map shows every room of every course at the same
// time; the active course is only highlighted (never filtered out). Geometry
// comes from graph-layout.cjs (card boxes, placements, hit testing, snap, fit)
// and draw.cjs (thumbnail, ports, wires) so the map, the hit area and the ports
// can never drift apart. Authored room.graph coordinates stay per-course; the
// project-level course offsets live in project.layout and are additive only.
const D = require('./draw.cjs'),
  M = require('../project/model.cjs'),
  Org = require('../project/room-organization.cjs'),
  OrgUI = require('./room-org-ui.cjs'),
  GraphLayout = require('./graph-layout.cjs'),
  Themes = require('../project/themes.cjs'),
  { esc, $, field, area, select, modal } = require('./dom.cjs');
const { clamp } = require('../shared/utils.cjs');
const ZOOM_MIN = 0.001,
  ZOOM_MAX = 4;
// Fill missing authored positions (undoable) and persist derived course offsets
// (not undoable: they only describe the global view, never authored data).
function ensureProjectLayout(app) {
  const project = app.store.project;
  let filled = false;
  // Only clone for the undo transaction when a room really lacks coordinates.
  const missing = project.courses.some((course) =>
    course.rooms.some((room) => !GraphLayout.hasPosition(room)),
  );
  if (missing) {
    const before = app.store.snapshot();
    for (const course of project.courses) {
      const positions = GraphLayout.ensurePositions(course.rooms);
      if (!Object.keys(positions).length) continue;
      filled = true;
      for (const room of course.rooms) if (positions[room.id]) room.graph = positions[room.id];
    }
    if (filled) {
      app.store.commit(before);
      app.state.graphNeedsFit = true;
      app.message('已补齐缺失的房间位置；已有排布保持原样，可撤销。');
    }
  }
  const { offsets, changed } = GraphLayout.ensureOffsets(project);
  app.state.courseOffsets = offsets;
  if (changed) {
    // View-only normalization: persist so the map is stable, but do not flag an
    // unsaved edit (offsets never change authored coordinates or project data).
    project.layout = { ...(project.layout || {}), version: 1, courseOffsets: offsets };
    app.store.persist();
  }
  return filled;
}
function wires(project, places, activeCourseId) {
  const byKey = new Map(places.map((place) => [place.key, place])),
    list = [];
  for (const course of project.courses)
    for (const edge of course.connections || []) {
      const from = byKey.get(GraphLayout.placeKey(course.id, edge.from.roomId)),
        to = byKey.get(GraphLayout.placeKey(course.id, edge.to.roomId));
      if (!from || !to) continue;
      const a = from.ports.exits.find((p) => p.id === edge.from.exitId),
        b = to.ports.entries.find((p) => p.id === edge.to.entryId);
      if (!a || !b) continue;
      list.push({
        id: edge.id,
        courseId: course.id,
        edge,
        from: a,
        to: b,
        color: course.id === activeCourseId ? '#9fd8cf' : '#6aa9a3',
      });
    }
  return list;
}
function markup(app) {
  const course = app.course();
  return `<div class="graph-layout planning-map"><div class="panel graph-panel"><div class="graph-controls"><span>全部房间</span><div class="actions"><span id="graph-zoom"></span><label class="check" title="拖动房间时对齐房间格网格"><input id="graph-snap" type="checkbox" checked>吸附</label><button id="graph-fit">全部</button><button id="graph-focus-course" title="缩放到当前大关「${esc(course.name)}」，其他房间仍然显示">当前大关</button><button id="graph-reset">100%</button><details class="graph-help"><summary title="操作说明">？</summary><div class="help-body">滚轮缩放 · 中键/空白拖动平移 · 拖动房间排布 · 双击进入 · 从出口拖到同一大关的入口接线。金色★为收藏房间。</div></details></div></div><div class="graph-canvas-wrap"><canvas id="graph" width="1120" height="650" aria-label="项目路线图：全部房间分布"></canvas></div></div><aside class="panel form" id="graph-inspector"></aside></div>`;
}
function sizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect(),
    width = Math.max(320, Math.round(rect.width || 1120)),
    top = rect.top || 0,
    height = Math.max(280, Math.round(window.innerHeight - top - 90));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}
function mount(app) {
  const canvas = $('graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d'),
    project = app.store.project,
    activeCourseId = app.course().id;
  sizeCanvas(canvas);
  const actions = $('graph-fit').parentElement;
  for (const [id, label, fn] of [
    [
      'graph-arrange',
      '整理排布',
      () => {
        app.state.graphNeedsFit = true;
        app.store.change(() => {
          for (const course of project.courses) {
            const positions = GraphLayout.arrange(course);
            for (const room of course.rooms) room.graph = positions[room.id];
          }
          // Let the offsets be derived again for the freshly packed courses.
          if (project.layout) project.layout = { ...project.layout, courseOffsets: {} };
        });
      },
    ],
    ['graph-undo', '撤销', () => app.store.undo()],
    ['graph-redo', '重做', () => app.store.redo()],
  ]) {
    if ($(id)) continue;
    const button = document.createElement('button');
    button.id = id;
    button.textContent = label;
    button.onclick = fn;
    actions.append(button);
  }
  if (app.state.graphSnap === undefined) app.state.graphSnap = true;
  const snapEnabled = () => app.state.graphSnap !== false;
  $('graph-snap').checked = snapEnabled();
  $('graph-snap').onchange = (e) => {
    app.state.graphSnap = e.target.checked;
    app.message(app.state.graphSnap ? '拖动房间将吸附到网格。' : '已关闭网格吸附，可自由摆放。');
  };
  const offsets = app.state.courseOffsets || GraphLayout.ensureOffsets(project).offsets;
  let places = GraphLayout.placements(project, offsets, activeCourseId),
    links = wires(project, places, activeCourseId),
    favorites = new Set(Org.ensure(project).favorites);
  const view =
    app.state.graphView ||
    (app.state.graphView = GraphLayout.fitPlaces(places, canvas.width, canvas.height));
  const rebuild = () => {
    places = GraphLayout.placements(app.store.project, offsets, activeCourseId);
    links = wires(app.store.project, places, activeCourseId);
    favorites = new Set(Org.ensure(app.store.project).favorites);
  };
  if (app.state.graphNeedsFit) {
    Object.assign(view, GraphLayout.fitPlaces(places, canvas.width, canvas.height));
    app.state.graphNeedsFit = false;
  }
  // A thumbnail click asks the map to locate that room without changing the
  // global scale contract: the shared fit/zoom helpers still own the view.
  if (app.state.graphFocusRoomId) {
    const focus = places.find((place) => place.room.id === app.state.graphFocusRoomId);
    app.state.graphFocusRoomId = null;
    if (focus) {
      view.scale = Math.max(0.08, view.scale);
      view.x = canvas.width / 2 - (focus.x + focus.width / 2) * view.scale;
      view.y = canvas.height / 2 - (focus.y + focus.height / 2) * view.scale;
    }
  }
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
  // Ports come straight from the shared placement geometry, so a marker is
  // always grabbable exactly where it is painted.
  const portAt = (p, kind) => {
    for (let i = places.length - 1; i >= 0; i--)
      for (const node of places[i].ports[kind])
        if (Math.hypot(node.x - p.x, node.y - p.y) < 9 / view.scale)
          return { place: places[i], node };
    return null;
  };
  const draw = () => {
    rebuild();
    D.drawGraph(
      ctx,
      places,
      links,
      app.state.graphSelection,
      wire,
      view,
      activeCourseId,
      favorites,
    );
    $('graph-zoom').textContent = Math.round(view.scale * 100) + '%';
  };
  $('graph-reset').onclick = () => {
    Object.assign(view, GraphLayout.fitPlaces(places, canvas.width, canvas.height, 1));
    draw();
  };
  $('graph-fit').onclick = () => {
    Object.assign(view, GraphLayout.fitPlaces(places, canvas.width, canvas.height));
    draw();
  };
  $('graph-focus-course').onclick = () => {
    const own = places.filter((place) => place.courseId === activeCourseId);
    Object.assign(
      view,
      GraphLayout.fitPlaces(own.length ? own : places, canvas.width, canvas.height),
    );
    draw();
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const p = pixel(e),
      world = point(e);
    view.scale = clamp(view.scale * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
    view.x = p.x - world.x * view.scale;
    view.y = p.y - world.y * view.scale;
    draw();
  };
  draw();
  renderInspector(app);
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
      out = portAt(p, 'exits');
    canvas.setPointerCapture(e.pointerId);
    if (out) {
      wire = {
        courseId: out.place.courseId,
        roomId: out.node.roomId,
        exitId: out.node.id,
        x: out.node.x,
        y: out.node.y,
        to: p,
      };
      return;
    }
    for (const link of links) {
      const curve = D.graphCurve(link, link.from, link.to);
      let onWire = false;
      for (let n = 0; n <= 30 && !onWire; n++) {
        const t = n / 30,
          u = 1 - t,
          x =
            u * u * u * link.from.x +
            3 * u * u * t * curve.c1.x +
            3 * u * t * t * curve.c2.x +
            t * t * t * link.to.x,
          y =
            u * u * u * link.from.y +
            3 * u * u * t * curve.c1.y +
            3 * u * t * t * curve.c2.y +
            t * t * t * link.to.y;
        onWire = Math.hypot(x - p.x, y - p.y) < 10;
      }
      if (onWire) {
        app.state.graphSelection = { kind: 'wire', id: link.id, courseId: link.courseId };
        draw();
        renderInspector(app);
        return;
      }
    }
    const place = GraphLayout.hitPlace(places, p);
    if (place) {
      app.state.graphSelection = { kind: 'room', id: place.room.id, courseId: place.courseId };
      drag = {
        place,
        start: p,
        origin: { x: place.room.graph?.x || 0, y: place.room.graph?.y || 0 },
        before: app.store.snapshot(),
      };
      draw();
      renderInspector(app);
      return;
    }
    app.state.graphSelection = null;
    pan = { point: pixel(e), x: view.x, y: view.y };
    canvas.style.cursor = 'grabbing';
    draw();
    renderInspector(app);
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
    const hovered = portAt(p, 'exits') || portAt(p, 'entries');
    canvas.title = hovered ? hovered.node.label : '';
    if (wire) {
      wire.to = p;
      draw();
    }
    if (drag) {
      const global = {
          x: GraphLayout.snap(
            drag.place.offset.x + drag.origin.x + p.x - drag.start.x,
            snapEnabled(),
          ),
          y: GraphLayout.snap(
            drag.place.offset.y + drag.origin.y + p.y - drag.start.y,
            snapEnabled(),
          ),
        },
        // Authored coordinates stay in the owner course's space.
        local = GraphLayout.toLocal(drag.place, global.x, global.y);
      drag.place.room.graph = { x: local.x, y: local.y };
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
      const input = portAt(point(e), 'entries');
      const started = wire;
      wire = null;
      if (input) {
        const from = { courseId: started.courseId, roomId: started.roomId },
          to = { courseId: input.place.courseId, roomId: input.place.room.id };
        if (!GraphLayout.canConnect(project, from, to)) {
          app.message('不能跨大关接线：出口只能连接到同一大关内的入口。', true);
          draw();
        } else {
          const course = GraphLayout.courseOf(project, to.courseId),
            before = app.store.snapshot();
          M.connect(course, from.roomId, started.exitId, to.roomId, input.node.id);
          app.store.commit(before);
          app.message('房间端口已连接，可撤销。');
        }
      } else draw();
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
    const place = GraphLayout.hitPlace(places, point(e));
    if (place) app.go('room', { courseId: place.courseId, roomId: place.room.id });
  };
}
function renderInspector(app) {
  app.updateRoomExport();
  const host = $('graph-inspector'),
    project = app.store.project,
    selection = app.state.graphSelection;
  if (!host) return;
  host.classList.toggle('compact', !selection);
  if (!selection) {
    // No huge empty sidebar: a one-line prompt instead of a course breakdown.
    host.innerHTML =
      '<p class="inspector-empty muted">点击房间查看说明与操作；☆ 收藏，分组用于整理，可与大关无关。</p>';
    return;
  }
  if (selection.kind === 'room') {
    const owner = GraphLayout.locate(project, selection.id);
    if (!owner) {
      app.state.graphSelection = null;
      renderInspector(app);
      return;
    }
    const { course, room } = owner;
    host.innerHTML = `<h2>${esc(room.name)}</h2><div class="inspector-fav-row">${OrgUI.starMarkup(app, room.id)}<span class="muted">${room.cols}×${room.rows} · ${room.entries.length} 入 / ${room.exits.length} 出</span></div>${field('名称', 'graph-name', room.name)}${area('备注', 'graph-notes', room.notes)}<div class="inspector-groups"><span class="muted">分组</span>${OrgUI.groupControlMarkup(app, [room.id])}</div><div class="actions"><button id="graph-rename">保存说明</button><button id="graph-edit" class="primary">编辑房间</button><button id="graph-export-room">导出</button><button data-room-clipboard-copy disabled>复制整房</button><button data-room-clipboard-paste disabled>粘贴整房</button><button id="graph-copy">原位复制</button><button id="graph-delete" class="danger">删除</button></div>`;
    OrgUI.bindStars(app, host);
    OrgUI.bindGroupControls(app, host);
    $('graph-rename').onclick = () =>
      app.store.change(() => {
        room.name = $('graph-name').value.trim() || room.name;
        room.notes = $('graph-notes').value;
      });
    $('graph-edit').onclick = () => app.go('room', { courseId: course.id, roomId: room.id });
    $('graph-export-room').onclick = () => app.exportRoom(course.id, room.id);
    $('graph-copy').onclick = () => duplicate(app, course, room);
    $('graph-delete').onclick = () => remove(app, course, room);
    require('./room-clipboard.cjs').sync(app);
  } else {
    const course = GraphLayout.courseOf(project, selection.courseId),
      edge = course?.connections.find((w) => w.id === selection.id);
    if (!course || !edge) {
      app.state.graphSelection = null;
      renderInspector(app);
      return;
    }
    const from = course.rooms.find((r) => r.id === edge.from.roomId),
      to = course.rooms.find((r) => r.id === edge.to.roomId);
    host.innerHTML = `<h2>连接</h2><p class="hint">${esc(from?.name || edge.from.roomId)} → ${esc(to?.name || edge.to.roomId)}</p>${select(
      '抵达速度',
      'wire-velocity',
      edge.velocity,
      [
        ['reset', '归零'],
        ['keep', '保留'],
      ],
    )}<div class="actions"><button id="wire-save">应用</button><button id="wire-delete" class="danger">删除连线</button></div>`;
    $('wire-save').onclick = () =>
      app.store.change(() => {
        edge.velocity = $('wire-velocity').value;
      });
    $('wire-delete').onclick = () =>
      app.store.change(() => {
        course.connections = course.connections.filter((v) => v.id !== edge.id);
        app.state.graphSelection = null;
      });
  }
}
function duplicate(app, course, room) {
  const N = require('../project/native-compat.cjs');
  const copy = (independent = false) =>
    app.store.change(() => {
      const next = M.duplicateRoom(course, room.id);
      if (independent) {
        const occupied = new Set(course.nativeCampaign.signals),
          map = {};
        for (const rule of N.rules(next))
          for (const name of [
            rule.signal,
            rule.visibleSignal,
            ...Object.keys(rule.signals || {}),
          ].filter(Boolean))
            if (!map[name]) {
              let candidate = name.slice(0, 36) + '-副本',
                i = 2;
              while (occupied.has(candidate)) candidate = name.slice(0, 36) + '-副本' + i++;
              map[name] = candidate;
              occupied.add(candidate);
            }
        for (const rule of N.rules(next)) {
          for (const key of ['signal', 'visibleSignal'])
            if (map[rule[key]]) rule[key] = map[rule[key]];
          if (rule.signals)
            rule.signals = Object.fromEntries(
              Object.entries(rule.signals).map(([k, v]) => [map[k] || k, v]),
            );
        }
        if (course.nativeCampaign.signals.length + Object.keys(map).length > 32) {
          app.message('独立信号将超过32项，请先调整已有信号，或选择复用原信号。', true);
          return;
        }
        course.nativeCampaign.signals.push(...Object.values(map));
      }
      next.graph = GraphLayout.vacant(next, course.rooms);
      app.state.graphNeedsFit = true;
      course.rooms.push(next);
      app.state.graphSelection = { kind: 'room', id: next.id, courseId: course.id };
    });
  if (
    N.active(app.store.project, course) &&
    N.rules(room).some((x) => x.signal || x.visibleSignal || Object.keys(x.signals || {}).length)
  )
    modal(
      '复制房间 · 跨房信号',
      '<p>复用会继续控制原房间；独立会创建新信号，外部控制来源需要重新绑定。两种操作均可撤销。</p>',
      [
        { label: '取消' },
        { label: '复用原信号', action: () => copy() },
        { label: '创建独立信号', action: () => copy(true) },
      ],
    );
  else copy();
}
function remove(app, course, room) {
  if (course.rooms.length === 1) {
    app.message('至少保留一个房间。', true);
    return;
  }
  const affected = course.connections.filter(
    (w) => w.from.roomId === room.id || w.to.roomId === room.id,
  );
  modal(
    '删除房间',
    `将删除 ${esc(room.name)}，并移除 ${affected.length} 条关联连线。操作可撤销。`,
    [
      { label: '取消' },
      {
        label: '删除并移除连线',
        primary: true,
        action: () =>
          app.store.change(() => {
            course.rooms = course.rooms.filter((v) => v.id !== room.id);
            course.connections = course.connections.filter(
              (w) => w.from.roomId !== room.id && w.to.roomId !== room.id,
            );
            // Favourite/group references to a deleted room are dropped; groups
            // and other rooms are untouched.
            app.store.project.roomOrganization = Org.forgetRoom(
              app.store.project.roomOrganization,
              room.id,
            );
            app.state.graphSelection = null;
            app.state.roomMulti = (app.state.roomMulti || []).filter((id) => id !== room.id);
          }),
      },
    ],
  );
}
module.exports = {
  markup,
  mount,
  renderInspector,
  ensureProjectLayout,
  duplicate,
  remove,
};
