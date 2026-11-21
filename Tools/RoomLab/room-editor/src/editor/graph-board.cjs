'use strict';
// Global route map board. One map shows every room of every course at the same
// time; the active course is only highlighted (never filtered out). Geometry
// comes from graph-layout.cjs (card boxes, placements, hit testing, snap, fit)
// and draw.cjs (thumbnail, ports, wires) so the map, the hit area and the ports
// can never drift apart. Authored room.graph coordinates stay per-course; the
// project-level course offsets live in project.layout and are additive only.
const D = require('./draw.cjs'),
  M = require('../project/model.cjs'),
  MapCompat = require('../project/map-compat.cjs'),
  Org = require('../project/room-organization.cjs'),
  OrgUI = require('./room-org-ui.cjs'),
  GraphLayout = require('./graph-layout.cjs'),
  CanvasDpr = require('./canvas-dpr.cjs'),
  Themes = require('../project/themes.cjs'),
  { esc, $, field, area, select, modal } = require('./dom.cjs');
const { clamp } = require('../shared/utils.cjs');
const ZOOM_MIN = 0.001,
  ZOOM_MAX = 4;
// Unified map colouring: a room takes the user's own group colour, everything
// else shares one neutral tone. The legacy per-course theme colour is gone so
// the map never classifies rooms by big course again.
const NEUTRAL_ROOM_COLOR = '#8496a8';
function accentOf(project) {
  const org = Org.ensure(project);
  return (room) => Org.colorFor(org, room.id) || NEUTRAL_ROOM_COLOR;
}
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
// Wires come from the unified map layer: explicit project.map connections and
// legacy course.connections alike, so a wire crossing the old containers is
// drawn exactly like an old one. Ports are projected by GraphLayout.
function wires(project, places, activeCourseId) {
  const byRoom = new Map(places.map((place) => [place.room.id, place])),
    list = [];
  for (const edge of MapCompat.connections(project)) {
    const from = byRoom.get(edge.from.roomId),
      to = byRoom.get(edge.to.roomId);
    if (!from || !to) continue;
    const a = from.ports.exits.find((p) => p.id === edge.from.exitId),
      b = to.ports.entries.find((p) => p.id === edge.to.entryId);
    if (!a || !b) continue;
    const crossCourse = from.courseId !== to.courseId;
    list.push({
      id: edge.id,
      source: edge.source,
      courseId: from.courseId,
      edge,
      from: a,
      to: b,
      crossCourse,
      color: crossCourse ? '#e7b867' : from.courseId === activeCourseId ? '#9fd8cf' : '#6aa9a3',
    });
  }
  return list;
}
function markup(app) {
  return `<div class="graph-layout planning-map"><div class="panel graph-panel"><div class="graph-controls"><span>全部房间</span><div class="actions"><span id="graph-zoom"></span><label class="check" title="拖动房间时对齐房间格网格"><input id="graph-snap" type="checkbox" checked>吸附</label><button id="graph-fit">全部</button><button id="graph-focus-selection" title="聚焦当前分组或所选房间，其他房间仍然显示">聚焦所选</button><button id="graph-reset">100%</button><details class="graph-help"><summary title="操作说明">？</summary><div class="help-body">滚轮缩放 · 中键/空白拖动平移 · 拖动房间排布 · 双击进入 · 从出口拖到任意房间的入口接线。金色★为收藏房间。</div></details></div></div><div class="graph-canvas-wrap"><canvas id="graph" width="1120" height="650" aria-label="项目路线图：全部房间分布"></canvas></div></div><aside class="panel form" id="graph-inspector"></aside></div>`;
}
// The view transform is expressed in CSS/layout pixels. Only the backing store
// is multiplied by the device ratio; the canvas is pinned to the measured CSS
// box so a later layout change can never silently stretch the bitmap (that
// stretch used to offset every drawn port from its hook-reported coordinate).
function measure(canvas) {
  const rect = canvas.getBoundingClientRect(),
    wrap = canvas.closest('.graph-canvas-wrap') || canvas.parentElement,
    width = Math.max(320, Math.round(wrap?.getBoundingClientRect().width || rect.width || 1120)),
    top = rect.top || 0,
    height = Math.max(280, Math.round(window.innerHeight - top - 90));
  return { width, height };
}
function sizeCanvas(canvas, app) {
  const { width, height } = measure(canvas),
    prepared = CanvasDpr.prepare(canvas, width, height, window.devicePixelRatio || 1, {
      fixed: false,
    });
  if (canvas.style) {
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }
  const size = {
    cssWidth: width,
    cssHeight: height,
    dpr: prepared.ratio,
    backingWidth: canvas.width,
    backingHeight: canvas.height,
  };
  if (app) app.state.graphCanvas = size;
  return size;
}
function mount(app) {
  const canvas = $('graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d'),
    project = app.store.project,
    activeCourseId = app.course().id;
  sizeCanvas(canvas, app);
  const cssSize = () => ({
    width:
      Number(canvas.dataset.cssWidth) || Math.round(canvas.getBoundingClientRect().width) || 1120,
    height:
      Number(canvas.dataset.cssHeight) || Math.round(canvas.getBoundingClientRect().height) || 650,
  });
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
  let places = GraphLayout.placements(project, offsets, activeCourseId, accentOf(project)),
    links = wires(project, places, activeCourseId),
    favorites = new Set(Org.ensure(project).favorites);
  const view =
    app.state.graphView ||
    (app.state.graphView = GraphLayout.fitPlaces(places, cssSize().width, cssSize().height));
  const rebuild = () => {
    places = GraphLayout.placements(
      app.store.project,
      offsets,
      activeCourseId,
      accentOf(app.store.project),
    );
    links = wires(app.store.project, places, activeCourseId);
    favorites = new Set(Org.ensure(app.store.project).favorites);
  };
  if (app.state.graphNeedsFit) {
    Object.assign(view, GraphLayout.fitPlaces(places, cssSize().width, cssSize().height));
    app.state.graphNeedsFit = false;
  }
  // A thumbnail click asks the map to locate that room without changing the
  // global scale contract: the shared fit/zoom helpers still own the view.
  if (app.state.graphFocusRoomId) {
    const focus = places.find((place) => place.room.id === app.state.graphFocusRoomId);
    app.state.graphFocusRoomId = null;
    if (focus) {
      const size = cssSize();
      view.scale = Math.max(0.08, view.scale);
      view.x = size.width / 2 - (focus.x + focus.width / 2) * view.scale;
      view.y = size.height / 2 - (focus.y + focus.height / 2) * view.scale;
    }
  }
  let drag = null,
    wire = null,
    pan = null;
  const pixel = (e) => CanvasDpr.pointer(canvas, e.clientX, e.clientY);
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
    // Leaving the map page tears the board down; a late resize/DPR callback must
    // never touch nodes that no longer exist in the document.
    if (!canvas.isConnected || document.getElementById('graph') !== canvas) return;
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
    const zoom = $('graph-zoom');
    if (zoom) zoom.textContent = Math.round(view.scale * 100) + '%';
  };
  $('graph-reset').onclick = () => {
    Object.assign(view, GraphLayout.fitPlaces(places, cssSize().width, cssSize().height, 1));
    draw();
  };
  $('graph-fit').onclick = () => {
    Object.assign(view, GraphLayout.fitPlaces(places, cssSize().width, cssSize().height));
    draw();
  };
  $('graph-focus-selection').onclick = () => {
    const selected =
      app.state.graphSelection?.kind === 'room'
        ? places.find((place) => place.room.id === app.state.graphSelection.id)
        : null;
    const groupId = /^group:(.+)$/.exec(app.state.roomFilter || '')?.[1];
    const groupRoomIds = groupId
      ? new Set(Org.ensure(project).groups.find((group) => group.id === groupId)?.roomIds || [])
      : null;
    const own = selected
      ? [selected]
      : groupRoomIds
        ? places.filter((place) => groupRoomIds.has(place.room.id))
        : places;
    Object.assign(
      view,
      GraphLayout.fitPlaces(own.length ? own : places, cssSize().width, cssSize().height),
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
  // Real layout/DPR handling: the map used to read its size only once at mount,
  // so resizing the window or moving to another DPR left the backing store and
  // the view transform stale. The view stays CSS-space; re-preparing only
  // updates the backing store and the pinned CSS box.
  //
  // prepare() always resets the backing store, which clears the bitmap. So the
  // size is measured first: an unchanged size+dpr returns without touching the
  // canvas, and every real re-prepare is followed by a full redraw.
  const relayout = () => {
    if (!canvas.isConnected || document.getElementById('graph') !== canvas) {
      dispose(app);
      return;
    }
    const next = measure(canvas),
      ratio = CanvasDpr.ratioFor(next.width, next.height, window.devicePixelRatio || 1),
      unchanged =
        Number(canvas.dataset.cssWidth) === next.width &&
        Number(canvas.dataset.cssHeight) === next.height &&
        Number(canvas.dataset.dpr) === ratio;
    // Nothing changed: no reset, no redraw (the canvas still holds its bitmap).
    if (unchanged) return;
    sizeCanvas(canvas, app);
    draw();
  };
  if (app.state.graphResizeObserver) app.state.graphResizeObserver.disconnect();
  if (typeof ResizeObserver === 'function') {
    app.state.graphResizeObserver = new ResizeObserver(relayout);
    app.state.graphResizeObserver.observe(canvas.parentElement || canvas);
  }
  if (app.state.graphResizeHandler)
    window.removeEventListener('resize', app.state.graphResizeHandler);
  app.state.graphResizeHandler = relayout;
  window.addEventListener('resize', relayout);
  const onDpr = () => {
    if (!canvas.isConnected || document.getElementById('graph') !== canvas) {
      dispose(app);
      return;
    }
    sizeCanvas(canvas, app);
    draw();
    watchDpr();
  };
  function watchDpr() {
    if (typeof window.matchMedia !== 'function') return;
    if (app.state.graphDprMedia && app.state.graphDprMedia.removeEventListener)
      app.state.graphDprMedia.removeEventListener('change', onDpr);
    const media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    app.state.graphDprMedia = media;
    app.state.graphDprHandler = onDpr;
    if (media.addEventListener) media.addEventListener('change', onDpr, { once: true });
  }
  watchDpr();
  canvas.onpointerdown = (e) => {
    if (![0, 1, 2].includes(e.button)) return;
    e.preventDefault();
    const groupId = app.state.graphQuickGroupId;
    if (e.button === 2 || (e.button === 0 && groupId)) {
      if (!groupId) return;
      const place = GraphLayout.hitPlace(places, point(e));
      if (!place) return;
      const add = e.button === 0;
      app.store.change(() => {
        const update = add ? Org.assign : Org.unassign;
        app.store.project.roomOrganization = update(
          Org.ensure(app.store.project),
          groupId,
          [place.room.id],
        );
      });
      app.message(add ? '已加入分组，可撤销。' : '已从分组移出，可撤销。');
      draw();
      renderInspector(app);
      return;
    }
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
        moved: false,
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
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4)
        drag.moved = true;
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
        const from = { roomId: started.roomId, exitId: started.exitId },
          to = { roomId: input.place.room.id, entryId: input.node.id },
          before = app.store.snapshot();
        if (!GraphLayout.canConnect(project, from, to)) {
          app.message('不能连接：端口已不存在，请重新选择出口与入口。', true);
          draw();
        } else if (started.courseId === input.place.courseId) {
          // Same legacy container: keep writing the old course.connections so
          // existing exports/runtime data stay canonical.
          const course = GraphLayout.courseOf(project, input.place.courseId);
          M.connect(course, from.roomId, from.exitId, to.roomId, to.entryId);
          app.store.commit(before);
          app.message('房间端口已连接，可撤销。');
        } else {
          // Cross-container wiring goes through the unified map layer.
          app.store.change(() => {
            MapCompat.connect(project, from, to);
          });
          app.message('已跨原课程连接房间端口（统一地图连接），可撤销。');
        }
      } else draw();
    }
    if (drag) {
      const before = drag.before;
      drag = null;
      app.store.commit(before);
    }
  };
  canvas.oncontextmenu = (e) => e.preventDefault();
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
// Leaving the map page must release everything the board attached outside its
// own DOM node (ResizeObserver, window resize, matchMedia DPR watcher). Without
// this, a resize/DPR event after navigating away reached draw() on a detached
// canvas and threw "Cannot set properties of null (setting 'textContent')" from
// the removed #graph-zoom element.
function dispose(app) {
  const state = app?.state;
  if (!state) return;
  if (state.graphResizeObserver) {
    try {
      state.graphResizeObserver.disconnect();
    } catch {}
    state.graphResizeObserver = null;
  }
  if (state.graphResizeHandler) {
    window.removeEventListener('resize', state.graphResizeHandler);
    state.graphResizeHandler = null;
  }
  const media = state.graphDprMedia,
    handler = state.graphDprHandler;
  if (media && handler && media.removeEventListener) {
    try {
      media.removeEventListener('change', handler);
    } catch {}
  }
  state.graphDprMedia = null;
  state.graphDprHandler = null;
  state.graphCanvas = null;
}
function renderInspector(app) {
  app.updateRoomExport();
  const host = $('graph-inspector'),
    project = app.store.project,
    selection = app.state.graphSelection;
  if (!host) return;
  host.classList.toggle('compact', !selection);
  if (!selection) {
    // Named group -> quick panel. No named group -> collapsible per-group lists
    // plus one ungrouped bucket, so the sidebar is useful without a selection.
    const quick = OrgUI.quickGroupMarkup(app);
    host.innerHTML = quick || '<p class="inspector-empty muted">点击房间查看说明与操作；☆ 收藏，分组用于整理。</p>';
    OrgUI.bindQuickGroup(app, host);
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
    host.innerHTML = `<h2>${esc(room.name)}</h2><div class="inspector-fav-row">${OrgUI.starMarkup(app, room.id)}<span class="muted">${room.cols}×${room.rows} · ${room.entries.length} 入 / ${room.exits.length} 出</span></div>${field('名称', 'graph-name', room.name)}${area('备注', 'graph-notes', room.notes)}<div class="inspector-groups"><span class="muted">分组</span>${OrgUI.groupControlMarkup(app, [room.id])}</div><div class="actions"><button id="graph-rename">保存说明</button><button id="graph-edit" class="primary">编辑房间</button><button id="graph-export-room">导出</button><button data-room-clipboard-copy disabled>复制整房</button><button data-room-clipboard-paste disabled>粘贴整房</button><button id="graph-copy">原位复制</button><button id="graph-delete" class="danger">删除</button></div>${OrgUI.quickGroupMarkup(app)}`;
    OrgUI.bindStars(app, host);
    OrgUI.bindGroupControls(app, host);
    OrgUI.bindQuickGroup(app, host);
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
    // Wire details come from the unified map layer, so a legacy course wire and a
    // project-level cross-container wire are edited through the same controls.
    const edge = MapCompat.find(project, selection.id);
    if (!edge) {
      app.state.graphSelection = null;
      renderInspector(app);
      return;
    }
    const fromOwner = MapCompat.roomRef(project, edge.from.roomId),
      toOwner = MapCompat.roomRef(project, edge.to.roomId),
      from = fromOwner?.room,
      to = toOwner?.room,
      cross = !!fromOwner && !!toOwner && fromOwner.courseId !== toOwner.courseId;
    host.innerHTML = `<h2>连接</h2><p class="hint">${esc(from?.name || edge.from.roomId)} → ${esc(to?.name || edge.to.roomId)}${cross ? ' <span class="badge">跨原课程</span>' : ''}</p>${select(
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
        MapCompat.updateVelocity(app.store.project, edge.id, $('wire-velocity').value);
      });
    $('wire-delete').onclick = () =>
      app.store.change(() => {
        MapCompat.disconnect(app.store.project, edge.id);
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
  // Affected wires are counted across both stores: legacy course wires and
  // project-level (possibly cross-container) wires.
  const affected = MapCompat.connections(app.store.project).filter(
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
            const project = app.store.project;
            course.rooms = course.rooms.filter((v) => v.id !== room.id);
            // Both the legacy course store and the project-level map are cleaned.
            MapCompat.forgetRoom(project, room.id);
            // Favourite/group references to a deleted room are dropped; groups
            // and other rooms are untouched.
            project.roomOrganization = Org.forgetRoom(project.roomOrganization, room.id);
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
  dispose,
  renderInspector,
  ensureProjectLayout,
  duplicate,
  remove,
};
