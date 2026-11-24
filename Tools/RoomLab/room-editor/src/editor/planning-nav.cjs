'use strict';
// Room-first planning navigation. The primary screen never asks for a course:
// every room of the project is reachable from one horizontal thumbnail strip,
// from the global route map and from the (all-room) library. Courses remain the
// ownership/runtime container, so legacy course management (rename/delete/rules/
// art bindings) is reachable from a collapsible advanced panel and the Tools
// menu, not from the main planning surface.
const Themes = require('../project/themes.cjs'),
  GraphLayout = require('./graph-layout.cjs'),
  OrgUI = require('./room-org-ui.cjs'),
  { esc, $, modal, field } = require('./dom.cjs');
const TABS = [
  ['map', '路线图', 'graph'],
  ['library', '房间库', 'rooms'],
];
function tabs(tab) {
  return `<div class="tabs planning-tabs" role="tablist" aria-label="规划视图">${TABS.map(
    ([id, label, legacy]) =>
      `<button role="tab" id="planning-tab-${id}" data-planning-tab="${id}" data-tab="${legacy}" aria-selected="${tab === id}" class="${tab === id ? 'active' : ''}">${label}</button>`,
  ).join('')}</div>`;
}
function roomsOf(app) {
  return (app.store.project.courses || []).flatMap((course) =>
    course.rooms.map((room) => ({ course, room })),
  );
}
// Thumbnail size keeps each room's real aspect ratio; the canvas is painted at
// 2x for crisp miniature content.
function thumbSize(room) {
  const width = 112,
    height = Math.max(48, Math.min(132, Math.round((width * room.rows) / Math.max(1, room.cols))));
  return { width, height };
}
function stripMarkup(app) {
  const selection = app.state.graphSelection,
    multi = new Set(app.state.roomMulti || []),
    org = OrgUI.organization(app);
  // Keep the organisation order: a named group renders its own roomIds order,
  // not the underlying project/course order.
  const list = OrgUI.orderedRooms(app);
  if (!list.length)
    return `<div class="room-strip-empty muted">此筛选下没有房间；切回「全部」或先给房间分组。</div>`;
  return `<div class="room-strip" role="list" aria-label="房间预览（全部大关）">${list
    .map(({ room }) => {
      const { width, height } = thumbSize(room),
        favorite = org.favorites.includes(room.id),
        selected = selection?.kind === 'room' && selection.id === room.id,
        chosen = multi.has(room.id),
        // Same user-group accent as the route map and the room page bar.
        color = require('../project/room-organization.cjs').colorFor(org, room.id);
      return `<article class="room-strip-item${favorite ? ' favorite' : ''}${selected ? ' selected' : ''}${chosen ? ' multi' : ''}" role="listitem" data-strip-room="${esc(room.id)}" tabindex="0" style="--group-color:${esc(color || '#2a4154')}" title="${esc(room.name)}${room.notes ? ' · ' + esc(room.notes) : ''}" aria-label="${esc(room.name)}${favorite ? '（已收藏）' : ''}"><canvas class="strip-thumb" width="${width * 2}" height="${height * 2}" style="width:${width}px;height:${height}px" data-strip-mini="${esc(room.id)}"></canvas>${OrgUI.starMarkup(app, room.id, 'strip-fav')}<button class="strip-edit" data-strip-edit="${esc(room.id)}" title="编辑房间">✎</button><span class="strip-name">${esc(room.name)}</span></article>`;
    })
    .join('')}</div>`;
}
// Selected-room owner (or the sticky active course) decides where 新建房间 lands.
function addTarget(app) {
  const selected = app.state.graphSelection;
  const owner = selected?.kind === 'room' ? app.roomOwner(selected.id) : null;
  const course = owner?.course || app.course();
  return { course, fromSelection: !!owner };
}
function tools(app) {
  const target = addTarget(app),
    label = `在「${esc(target.course.name)}」新建房间`,
    hint = `${target.fromSelection ? '沿用所选房间' : '沿用当前项目'}的默认规则`;
  return `<div class="actions planning-tools"><button id="add-room" title="${esc(label + '；' + hint)}">新建房间</button><button id="test-course" title="从当前大关首房试玩">试玩</button><button id="project-settings" title="项目名称与备注">项目</button></div>`;
}
function filters(app) {
  return OrgUI.filtersMarkup(app);
}
const ADV_ACTIONS = [
  ['settings', 'course-settings', '大关规则'],
  ['add', 'add-course', '＋ 新建大关'],
  ['rename', 'rename-course', '重命名大关'],
  ['delete', 'delete-course', '删除大关'],
];
// `withIds` is used by the page panel (stable ids for compatibility); the Tools
// modal renders the same actions without creating duplicate ids.
function advancedActions(withIds) {
  return ADV_ACTIONS.map(
    ([action, id, label]) =>
      `<button ${withIds ? `id="${id}"` : ''} data-adv="${action}"${action === 'delete' ? ' class="danger"' : ''}>${label}</button>`,
  ).join('');
}
// The legacy big-course workspace is not reachable from navigation any more.
// `courses` stays the hidden runtime/ownership container for compatibility and
// the old saved files, but the room-first UI no longer offers a course page as
// a navigation step.
function advanced() {
  return '';
}
function contextMenu() {
  return '';
}
function courseTools(app) {
  modal(
    '大关容器（仅数据兼容）',
    `<p class="hint">导航已不再提供大关工作区；房间库与路线图始终显示全部房间。这里只保留大关级规则与增删的兼容入口，日常整理请用房间库、收藏和分组。</p><div class="actions">${advancedActions(false)}</div>`,
    [{ label: '关闭' }],
  );
  bindAdvanced(app, $('dialog-content'));
}
function selectRoom(app, roomId, options = {}) {
  const owner = app.roomOwner(roomId);
  if (!owner) return;
  const multi = new Set(app.state.roomMulti || []);
  if (options.toggle) {
    const current = app.state.graphSelection?.kind === 'room' ? app.state.graphSelection.id : null;
    // Ctrl/⌘-click starts a multi-selection that keeps the currently selected room.
    if (!multi.size && current && current !== roomId) multi.add(current);
    if (multi.has(roomId)) multi.delete(roomId);
    else multi.add(roomId);
  } else if (!options.extend) multi.clear();
  else multi.add(roomId);
  app.state.roomMulti = [...multi];
  app.state.graphSelection = { kind: 'room', id: roomId, courseId: owner.course.id };
  app.state.courseId = owner.course.id;
  // Selecting a thumbnail locates the room on the route map.
  app.state.planningTab = 'map';
  app.state.graphFocusRoomId = roomId;
  app.state.roomView = null;
  app.render();
}
function editRoom(app, roomId) {
  const owner = app.roomOwner(roomId);
  if (owner) app.go('room', { courseId: owner.course.id, roomId: owner.room.id });
}
function bindAdvanced(app, root = $('app')) {
  if (!root) return;
  if ($('add-room'))
    $('add-room').onclick = () => {
      const target = addTarget(app);
      require('./room-library-panel.cjs').addRoom(app, target.course);
    };
  if ($('test-course')) $('test-course').onclick = () => app.startPlay(app.course().rooms[0].id);
  if ($('project-settings'))
    $('project-settings').onclick = () => require('./pages/planning.cjs').projectSettings(app);
  const run = {
    enter: () => app.go('course', { courseId: app.course().id, courseTab: 'graph' }),
    settings: () => app.go('course', { courseTab: 'settings' }),
    bindings: () => app.go('course', { courseTab: 'bindings' }),
    add: () => app.chooseCourse(),
    rename: () => renameCourse(app),
    delete: () => deleteCourse(app),
  };
  for (const button of root.querySelectorAll('[data-adv]'))
    button.onclick = () => run[button.dataset.adv]?.();
}
function renameCourse(app) {
  const course = app.course(),
    save = () => {
      const input = $('course-label'),
        name = input.value.trim();
      if (!name) {
        input.setCustomValidity('请输入大关名称。');
        input.reportValidity();
        return;
      }
      $('dialog').close();
      app.store.change(() => {
        const current = app.store.project.courses.find((candidate) => candidate.id === course.id);
        if (current) current.name = name;
      });
    };
  modal('重命名大关', `<div class="form">${field('大关名称', 'course-label', course.name)}</div>`, [
    { label: '取消' },
    { label: '保存名称', primary: true, close: false, action: save },
  ]);
  const input = $('course-label');
  input.oninput = () => input.setCustomValidity('');
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      save();
    }
  };
  input.focus();
  input.select();
}
function deleteCourse(app) {
  const project = app.store.project,
    course = app.course();
  if (project.courses.length <= 1) {
    app.message('至少保留一个大关。', true);
    return;
  }
  modal(
    '删除大关',
    `<p>删除「${esc(course.name)}」及其 ${course.rooms.length} 间房、${course.connections.length} 条连线？项目素材保留，可用 Ctrl+Z 撤销。</p>`,
    [
      { label: '取消' },
      {
        label: '确认删除大关',
        action: () => {
          const courses = app.store.project.courses;
          if (courses.length <= 1 || !courses.some((candidate) => candidate.id === course.id))
            return;
          if (app.state.courseId === course.id) {
            app.state.courseId = courses.find((candidate) => candidate.id !== course.id).id;
            app.state.roomId = null;
            app.state.graphSelection = null;
          }
          app.store.change((value) => {
            value.courses = value.courses.filter((candidate) => candidate.id !== course.id);
            if (value.layout?.courseOffsets) delete value.layout.courseOffsets[course.id];
            // Group/favourite entries keep only rooms that still exist.
            value.roomOrganization = require('../project/room-organization.cjs').ensure(value);
          });
          app.message('已删除大关，可用 Ctrl+Z 撤销。');
        },
      },
    ],
  );
  $('dialog-actions').lastElementChild.classList.add('danger');
}
function bind(app) {
  const picker = $('room-picker');
  if (picker) {
    const setCollapsed = (collapsed) => {
      if (collapsed === !!app.state.roomPickerCollapsed) return;
      app.state.roomPickerCollapsed = collapsed;
      try {
        localStorage.setItem('roomlab-room-picker-collapsed', String(collapsed));
      } catch {}
      // Re-measure the canvas after releasing/occupying the preview strip's space.
      // The view transform stays in app.state, so folding never resets map zoom.
      app.render();
    };
    // Persist the user's action before the native asynchronous toggle event;
    // an immediate page reload must not lose the newly folded state.
    picker.querySelector('summary').onclick = (event) => {
      event.preventDefault();
      setCollapsed(picker.open);
      $('room-picker')?.querySelector('summary')?.focus({ preventScroll: true });
    };
    picker.ontoggle = () => setCollapsed(!picker.open);
  }
  for (const button of $('app').querySelectorAll('[data-planning-tab]'))
    button.onclick = () => {
      app.state.planningTab = button.dataset.planningTab;
      app.render();
    };
  OrgUI.bindFilters(app, $('app'));
  for (const item of $('app').querySelectorAll('[data-strip-room]')) {
    item.onclick = (event) => {
      if (event.target.closest('[data-fav], [data-strip-edit]')) return;
      if (performance.now() < (app.state.roomTabClickAfter || 0)) {
        event.preventDefault();
        return;
      }
      selectRoom(app, item.dataset.stripRoom, {
        toggle: event.ctrlKey || event.metaKey,
        extend: event.shiftKey,
      });
    };
    item.ondblclick = () => editRoom(app, item.dataset.stripRoom);
    item.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        editRoom(app, item.dataset.stripRoom);
      }
    };
  }
  for (const button of $('app').querySelectorAll('[data-strip-edit]'))
    button.onclick = (event) => {
      event.stopPropagation();
      editRoom(app, button.dataset.stripEdit);
    };
  OrgUI.bindStars(app, $('app'));
  // Drag a card onto a group tab to assign it; inside a group view, dragging
  // one card onto another reorders the group only (project order is untouched).
  OrgUI.bindCardDrag(app, $('app'));
  // Miniature thumbnails: same painter as the map/library, real room contents.
  const Draw = require('./draw.cjs');
  for (const canvas of $('app').querySelectorAll('[data-strip-mini]')) {
    const owner = app.roomOwner(canvas.dataset.stripMini);
    if (owner)
      Draw.miniature(canvas.getContext('2d'), owner.room, 0, 0, canvas.width, canvas.height);
  }
  bindAdvanced(app);
}
module.exports = {
  tabs,
  strip: stripMarkup,
  tools,
  filters,
  advanced,
  contextMenu,
  courseTools,
  bind,
  selectRoom,
  editRoom,
  addTarget,
  roomsOf,
  thumbSize,
  themeOf: (course) => Themes.theme(course.kind),
  locate: GraphLayout.locate,
};
