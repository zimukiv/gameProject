'use strict';
// Room library: every room of the project, no course headings or course filter.
// Filters are 全部 / 收藏 / user groups. Cards keep the thumbnail, a truncated
// name (tooltip carries the notes), favourite star, group membership and the
// room actions. The list never reorders the project array; it only filters.
const D = require('./draw.cjs'),
  DPR = require('./canvas-dpr.cjs'),
  M = require('../project/model.cjs'),
  Org = require('../project/room-organization.cjs'),
  GraphLayout = require('./graph-layout.cjs'),
  OrgUI = require('./room-org-ui.cjs'),
  { esc, $, modal, field } = require('./dom.cjs');
function addRoom(app, course) {
  const c = course || app.course();
  app.store.change(() => {
    const r = M.room(
      M.uid('room'),
      '新房间 ' + (c.rooms.length + 1),
      c.defaultSize.cols,
      c.defaultSize.rows,
    );
    r.graph = GraphLayout.vacant(r, c.rooms);
    app.state.graphNeedsFit = true;
    if (require('../project/native-compat.cjs').active(app.store.project, c))
      require('../project/native-compat.cjs').initRoom(r);
    c.rooms.push(r);
    app.state.graphSelection = { kind: 'room', id: r.id, courseId: c.id };
    app.state.roomMulti = [r.id];
  });
}
function entries(app, options = {}) {
  if (options.courseId) {
    const course = app.store.project.courses.find((c) => c.id === options.courseId);
    return course ? course.rooms.map((room) => ({ course, room })) : [];
  }
  const visible = new Set(Org.filterRoomIds(app.store.project, OrgUI.filterValue(app)));
  return app.store.project.courses.flatMap((course) =>
    course.rooms.filter((room) => visible.has(room.id)).map((room) => ({ course, room })),
  );
}
function card(app, course, room, selected) {
  const active =
      selected?.kind === 'room' && selected.id === room.id && !(app.state.roomMulti || []).length,
    multi = (app.state.roomMulti || []).includes(room.id),
    favorite = Org.isFavorite(OrgUI.organization(app), room.id),
    title = room.name + (room.notes ? ' · ' + room.notes : ''),
    // New room-first UI is coloured by the user's group; the legacy course
    // theme colour is only a fallback for ungrouped rooms.
    accent =
      Org.colorFor(Org.ensure(app.store.project), room.id) ||
      require('../project/themes.cjs').theme(course.kind).color;
  return `<article class="card room-card${active ? ' selected' : ''}${multi ? ' multi' : ''}${favorite ? ' favorite' : ''}" data-room-card="${esc(room.id)}" data-course-card="${esc(course.id)}" style="--theme-color:${esc(accent)}" title="${esc(title)}"><div class="room-card-head"><span class="room-card-title" title="${esc(title)}">${esc(room.name)}</span>${OrgUI.starMarkup(app, room.id)}</div><div class="room-thumb"><canvas width="270" height="150" data-mini="${esc(room.id)}"></canvas></div><p class="room-meta">${room.cols}×${room.rows} · ${room.entries.length} 入 / ${room.exits.length} 出</p><div class="actions"><button data-room="${esc(room.id)}" class="primary">编辑房间</button><button data-room-rename="${esc(room.id)}">重命名</button><button data-room-copy="${esc(room.id)}">复制</button><button data-room-export="${esc(room.id)}">导出</button><button data-room-delete="${esc(room.id)}" class="danger">删除</button></div>${OrgUI.groupControlMarkup(app, [room.id])}</article>`;
}
function markup(app, options = {}) {
  const list = entries(app, options),
    selected = app.state.graphSelection;
  return `<div class="room-library-toolbar"><div class="actions"><button id="library-add-room" title="新建的房间加入当前大关">新建房间</button><button data-room-import>导入房间</button><button data-room-clipboard-copy disabled>复制整房</button><button data-room-clipboard-paste disabled>粘贴整房</button></div><span class="muted">${list.length} 间房</span></div>${list.length ? `<div class="cards room-library-grid">${list.map(({ course, room }) => card(app, course, room, selected)).join('')}</div>` : '<p class="room-strip-empty muted">此筛选下没有房间。</p>'}`;
}
function bind(app, host, options = {}) {
  const target = host || $('planning-content');
  if (!target) return;
  target.querySelectorAll('[data-mini]').forEach((canvas) => {
    const owner = GraphLayout.locate(app.store.project, canvas.dataset.mini);
    if (!owner) return;
    // Draw the existing proportional miniature at the real pixel density
    // instead of stretching a 270×150 bitmap on HiDPI screens.
    const box = DPR.prepare(
      canvas,
      Number(canvas.dataset.cssWidth) || 270,
      Number(canvas.dataset.cssHeight) || 150,
      globalThis.devicePixelRatio,
    );
    box.ctx.clearRect(0, 0, box.width, box.height);
    D.miniature(box.ctx, owner.room, 0, 0, box.width, box.height);
  });
  OrgUI.bindStars(app, target);
  OrgUI.bindGroupControls(app, target);
  target
    .querySelectorAll('[data-room]')
    .forEach((b) => (b.onclick = () => enter(app, b.dataset.room)));
  target.querySelectorAll('[data-room-card]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('button, select')) return;
      // A card drag that assigned/reordered ends with a click; ignore it.
      if (performance.now() < (app.state.roomTabClickAfter || 0)) {
        e.preventDefault();
        return;
      }
      const owner = GraphLayout.locate(app.store.project, el.dataset.roomCard);
      if (!owner) return;
      if (e.ctrlKey || e.metaKey) {
        const multi = new Set(app.state.roomMulti || []),
          current = app.state.graphSelection?.kind === 'room' ? app.state.graphSelection.id : null;
        // Starting a multi-selection from a single selected room keeps it, so a
        // ctrl-click adds to the room the user already picked.
        if (!multi.size && current && current !== el.dataset.roomCard) multi.add(current);
        if (multi.has(el.dataset.roomCard)) multi.delete(el.dataset.roomCard);
        else multi.add(el.dataset.roomCard);
        app.state.roomMulti = [...multi];
      } else {
        app.state.roomMulti = [];
      }
      app.state.graphSelection = {
        kind: 'room',
        id: el.dataset.roomCard,
        courseId: owner.course.id,
      };
      app.state.courseId = owner.course.id;
      app.render();
    };
    el.ondblclick = (e) => {
      if (e.target.closest('button, select')) return;
      if (performance.now() < (app.state.roomTabClickAfter || 0)) return;
      enter(app, el.dataset.roomCard);
    };
  });
  target
    .querySelectorAll('[data-room-rename]')
    .forEach((b) => (b.onclick = () => rename(app, b.dataset.roomRename)));
  target.querySelectorAll('[data-room-copy]').forEach(
    (b) =>
      (b.onclick = () => {
        const owner = GraphLayout.locate(app.store.project, b.dataset.roomCopy);
        if (owner) require('./graph-board.cjs').duplicate(app, owner.course, owner.room);
      }),
  );
  target.querySelectorAll('[data-room-export]').forEach(
    (b) =>
      (b.onclick = () => {
        const owner = GraphLayout.locate(app.store.project, b.dataset.roomExport);
        if (owner) app.exportRoom(owner.course.id, owner.room.id);
      }),
  );
  target.querySelectorAll('[data-room-delete]').forEach(
    (b) =>
      (b.onclick = () => {
        const owner = GraphLayout.locate(app.store.project, b.dataset.roomDelete);
        if (owner) require('./graph-board.cjs').remove(app, owner.course, owner.room);
      }),
  );
  target
    .querySelectorAll('[data-room-import]')
    .forEach((b) => (b.onclick = () => $('room-package-file').click()));
  if ($('library-add-room'))
    $('library-add-room').onclick = () =>
      addRoom(
        app,
        app.store.project.courses.find((c) => c.id === options.courseId),
      );
  require('./room-clipboard.cjs').sync(app);
}
function enter(app, roomId) {
  const owner = GraphLayout.locate(app.store.project, roomId);
  if (owner) app.go('room', { courseId: owner.course.id, roomId: owner.room.id });
}
function rename(app, roomId) {
  const owner = GraphLayout.locate(app.store.project, roomId);
  if (!owner) return;
  const room = owner.room,
    save = () => {
      const input = $('room-rename-input'),
        name = input.value.trim();
      if (!name) {
        input.setCustomValidity('请输入房间名称。');
        input.reportValidity();
        return;
      }
      $('dialog').close();
      app.store.change(() => {
        room.name = name;
      });
    };
  modal(
    '重命名房间',
    `<div class="form">${field('房间名称', 'room-rename-input', room.name)}</div>`,
    [{ label: '取消' }, { label: '保存名称', primary: true, close: false, action: save }],
  );
  const input = $('room-rename-input');
  input.oninput = () => input.setCustomValidity('');
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      save();
    }
  };
  input.focus();
  input.select();
}
function render(app, host, options = {}) {
  const target = host || $('planning-content');
  if (!target) return;
  target.innerHTML = markup(app, options);
  bind(app, target, options);
}
module.exports = { addRoom, markup, bind, render, enter, rename, entries };
