'use strict';
// Room page navigation: a thumbnail selector bar plus a plain ownership label.
// It reuses the home page's organisation filters (全部 / 收藏 / 分组) and the same
// miniature renderer, so switching rooms inside the editor is the same gesture
// as on the map. No text tab list or room dropdown is used any more.
//
// Ownership in the top bar is the current *custom group* of the room (not the
// legacy course container): a room can belong to several groups and the label can
// be switched between them; an ungrouped room reads 未分组 and its label jumps
// back to the all-rooms view. Clicking the label filters the thumbnail bar in
// place (the editor stays open) instead of switching to a course page.
const Org = require('../project/room-organization.cjs');
const Layout = require('./graph-layout.cjs');
const OrgUI = require('./room-org-ui.cjs');
const DPR = require('./canvas-dpr.cjs');
const D = require('./draw.cjs');
const { esc } = require('./dom.cjs');

const THUMB_WIDTH = 132,
  THUMB_HEIGHT = 74;
const UNGROUPED = '未分组';
// Folding the room thumbnail bar is a pure editor preference: it must never
// touch the project, the cloud protocol or the home page's own picker key.
// It is its own key so the two fold switches remember independent states.
const COLLAPSE_KEY = 'roomlab-room-strip-collapsed';
// Dragging the bottom edge of the thumbnail strip resizes its row. Like the
// fold switch this is an editor preference in localStorage; it never touches
// the project, the cloud protocol or the home page picker. null = auto height.
const STRIP_HEIGHT_KEY = 'roomlab-room-strip-height',
  MIN_STRIP_HEIGHT = 64,
  MAX_STRIP_HEIGHT = 420;
function clampStripHeight(value) {
  if (value === null || value === undefined || value === '') return null;
  const height = Math.round(Number(value));
  if (!Number.isFinite(height)) return null;
  return Math.max(MIN_STRIP_HEIGHT, Math.min(MAX_STRIP_HEIGHT, height));
}
function stripHeight(app) {
  if (app.state.roomStripHeight !== undefined) return app.state.roomStripHeight;
  try {
    app.state.roomStripHeight = clampStripHeight(localStorage.getItem(STRIP_HEIGHT_KEY));
  } catch {
    app.state.roomStripHeight = null;
  }
  return app.state.roomStripHeight;
}
function persistStripHeight(app, value) {
  const height = clampStripHeight(value);
  app.state.roomStripHeight = height;
  try {
    if (height === null) localStorage.removeItem(STRIP_HEIGHT_KEY);
    else localStorage.setItem(STRIP_HEIGHT_KEY, String(height));
  } catch {}
  return height;
}
function stripCollapsed(app) {
  if (app.state.roomStripCollapsed === undefined) {
    try {
      app.state.roomStripCollapsed = localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      app.state.roomStripCollapsed = false;
    }
  }
  return !!app.state.roomStripCollapsed;
}
function persistStripCollapsed(app, collapsed) {
  app.state.roomStripCollapsed = !!collapsed;
  try {
    localStorage.setItem(COLLAPSE_KEY, String(!!collapsed));
  } catch {}
}
// Expand without re-rendering: callers (top-bar ownership filter, group cycle)
// are about to render once anyway. Keeps the canvas view untouched.
function expandStrip(app) {
  if (stripCollapsed(app)) persistStripCollapsed(app, false);
}
function toggleStrip(app) {
  persistStripCollapsed(app, !stripCollapsed(app));
  app.render();
}

function context(project, roomId, state = {}) {
  const all = project.courses.flatMap((course) => course.rooms.map((room) => ({ course, room })));
  const groups = Org.ensure(project).groups;
  const memberships = groups.filter((group) => group.roomIds.includes(roomId));
  const preferred =
    state.roomGroupId === undefined
      ? String(state.roomFilter || '').replace(/^group:/, '')
      : state.roomGroupId;
  const group =
    preferred === null
      ? null
      : memberships.find((item) => item.id === preferred) || memberships[0] || null;
  const byId = new Map(all.map((item) => [item.room.id, item]));
  return {
    all,
    groups,
    memberships,
    group,
    rooms: group ? group.roomIds.map((id) => byId.get(id)).filter(Boolean) : all,
  };
}
function locate(project, roomId) {
  return Layout.locate(project, roomId);
}
function navigate(app, roomId, groupId) {
  const owner = locate(app.store.project, roomId);
  if (!owner) return;
  app.go('room', {
    courseId: owner.course.id,
    roomId,
    ...(groupId !== undefined ? { roomGroupId: groupId } : {}),
  });
}
// The ownership shown in the top bar and on each thumbnail is the current user
// group (multiple groups can be cycled) or 未分组 for rooms without one.
function ownerGroup(app, roomId = app.state.roomId) {
  return context(app.store.project, roomId, app.state).group;
}
function ownerLabel(app) {
  const current = locate(app.store.project, app.state.roomId);
  if (!current) return esc(UNGROUPED);
  const group = ownerGroup(app);
  return esc(group ? group.name : UNGROUPED);
}
function groupNameOf(app, roomId) {
  const group = ownerGroup(app, roomId);
  return group ? group.name : UNGROUPED;
}
// Clicking the ownership label filters the thumbnail bar to that group (or back
// to all rooms when the room is ungrouped). Rooms in several groups expose a
// cycle control so the label can hop between them.
function filterForRoom(app, roomId) {
  const group = ownerGroup(app, roomId);
  return group ? 'group:' + group.id : 'all';
}
function applyOwnerFilter(app, roomId) {
  app.state.roomFilter = filterForRoom(app, roomId);
  app.state.graphSelection = null;
  app.state.roomMulti = [];
  // A top-bar click re-filters the thumbnail bar; if it is folded, open it so
  // the navigation change is visible instead of silently hidden.
  expandStrip(app);
  app.render();
}
function cycleOwnerGroup(app) {
  const current = locate(app.store.project, app.state.roomId);
  if (!current) return;
  const all = context(app.store.project, app.state.roomId, app.state);
  if (all.memberships.length < 2) {
    applyOwnerFilter(app, app.state.roomId);
    return;
  }
  const index = all.memberships.findIndex((group) => group.id === all.group?.id),
    next = all.memberships[(index + 1) % all.memberships.length];
  app.state.roomGroupId = next.id;
  app.state.roomFilter = 'group:' + next.id;
  app.state.graphSelection = null;
  app.state.roomMulti = [];
  expandStrip(app);
  app.render();
}
// Top bar: project / owning group / room name. 项目 always returns to the route
// map; the owning group filters the thumbnail selector below.
function breadcrumbs(app) {
  const current = locate(app.store.project, app.state.roomId);
  if (!current) return '<button id="crumb-project">项目</button>';
  const memberships = ownerGroup(app)
      ? context(app.store.project, app.state.roomId, app.state).memberships
      : [],
    cycle =
      memberships.length > 1
        ? `<button id="crumb-owner-next" class="crumb-owner-cycle" title="切换房间所在分组视图（共 ${memberships.length} 个）" aria-label="切换分组">⇄</button>`
        : '';
  return `<button id="crumb-project" title="返回路线图">项目</button><span>/</span><button id="crumb-owner" class="crumb-owner${memberships.length ? '' : ' ungrouped'}" data-owner-group="${esc(memberships.length ? ownerGroup(app)?.id || '' : '')}" title="${memberships.length ? '筛选此分组的房间缩略图' : '显示全部房间缩略图'}">${ownerLabel(app)}</button>${cycle}<span>/</span><span class="room-current-name">${esc(current.room.name)}</span>`;
}
function bindBreadcrumbs(app) {
  const owner = require('./dom.cjs').$('crumb-owner');
  if (owner) owner.onclick = () => applyOwnerFilter(app, app.state.roomId);
  const next = require('./dom.cjs').$('crumb-owner-next');
  if (next) next.onclick = () => cycleOwnerGroup(app);
}
// Thumbnail selector bar. Filter chips come from the shared organisation UI so
// favourites/groups are exactly the same objects as on the home page.
function strip(app) {
  // A group filter renders `group.roomIds` order; filtering the project arrays
  // would silently restore project order and hide the group's own sequence.
  const visible = OrgUI.orderedRooms(app);
  const collapsed = stripCollapsed(app),
    height = stripHeight(app),
    org = Org.ensure(app.store.project),
    cards = visible
      .map(({ course, room }) => {
        const active = room.id === app.state.roomId,
          favorite = Org.isFavorite(org, room.id),
          color = Org.colorFor(org, room.id),
          title = room.name + (room.notes ? ' · ' + room.notes : ''),
          // Footer shows user grouping (multiple groups joined) instead of the
          // legacy course container.
          owner =
            Org.groupsContaining(org, room.id)
              .map((group) => group.name)
              .join(' · ') || UNGROUPED;
        return `<button class="room-thumb-card${active ? ' active' : ''}${favorite ? ' favorite' : ''}" data-nav-room="${esc(room.id)}" data-course="${esc(course.id)}" aria-current="${active ? 'page' : 'false'}" style="--group-color:${esc(color || '#2a4154')}" title="${esc(title)}"><canvas data-thumb="${esc(room.id)}"></canvas><span class="room-thumb-name">${esc(room.name)}</span><span class="room-thumb-owner" title="分组：${esc(owner)}">${esc(owner)}</span></button>`;
      })
      .join('');
  // Only the space-hungry thumbnail row folds away; the "房间选择 N / 展开收起"
  // entry and the compact filter chips stay reachable while folded, so room
  // filtering never becomes a dead end.
  const resize = collapsed
    ? ''
    : `<div class="room-strip-resize" id="room-strip-resize" role="separator" aria-orientation="horizontal" aria-label="拖动调整房间缩略图栏高度" aria-valuemin="${MIN_STRIP_HEIGHT}" aria-valuemax="${MAX_STRIP_HEIGHT}"${height ? ` aria-valuenow="${height}"` : ''} tabindex="0" title="上下拖动调整缩略图栏高度；双击恢复自动高度"></div>`;
  return `<div class="room-thumb-selector${collapsed ? ' collapsed' : ''}"${height ? ` style="--room-strip-height:${height}px"` : ''} aria-label="房间缩略图选择栏"><div class="room-strip-head"><button id="room-strip-toggle" class="room-strip-toggle" aria-expanded="${!collapsed}" aria-controls="room-thumb-strip" title="${collapsed ? '展开房间缩略图栏' : '收起房间缩略图栏，释放画布高度'}"><span class="room-strip-count">房间选择 ${visible.length}</span><span class="room-strip-caret" aria-hidden="true">${collapsed ? '▸ 展开' : '▾ 收起'}</span></button></div>${OrgUI.filtersMarkup(app)}<div class="room-thumb-strip" id="room-thumb-strip">${cards || '<p class="room-strip-empty muted">此筛选下没有房间。</p>'}</div>${resize}</div>`;
}
function paintThumbnails(app, host) {
  if (!host) return;
  for (const canvas of host.querySelectorAll('[data-thumb]')) {
    const owner = locate(app.store.project, canvas.dataset.thumb);
    if (!owner) continue;
    const { ctx, width, height } = DPR.prepare(
      canvas,
      THUMB_WIDTH,
      THUMB_HEIGHT,
      globalThis.devicePixelRatio,
    );
    ctx.clearRect(0, 0, width, height);
    D.miniature(ctx, owner.room, 0, 0, width, height);
    const groupCanvas = canvas.parentElement,
      color = Org.colorFor(Org.ensure(app.store.project), canvas.dataset.thumb);
    if (groupCanvas && color) groupCanvas.style.setProperty('--group-color', color);
  }
}
// Pointer drag on the bottom edge of the strip. The row height follows the
// pointer live through a CSS variable (the canvas re-measures on the next
// frame), and only the final height is persisted, so dragging stays cheap and
// never rewrites the project.
function bindStripResize(app, host) {
  const handle = host?.querySelector('#room-strip-resize');
  if (!handle) return;
  const row = () => host.querySelector('.room-thumb-strip');
  const apply = (height) => {
    if (height === null) host.style.removeProperty('--room-strip-height');
    else host.style.setProperty('--room-strip-height', height + 'px');
    if (height === null) handle.removeAttribute('aria-valuenow');
    else handle.setAttribute('aria-valuenow', String(height));
  };
  const current = () =>
    stripHeight(app) ??
    Math.round(row()?.getBoundingClientRect().height || 0) ??
    MIN_STRIP_HEIGHT;
  let drag = null;
  const move = (event) => {
    if (!drag) return;
    event.preventDefault();
    apply(clampStripHeight(drag.start + (event.clientY - drag.y)));
  };
  const finish = (event) => {
    if (!drag) return;
    const height = clampStripHeight(drag.start + (event.clientY - drag.y));
    apply(height);
    persistStripHeight(app, height);
    drag = null;
    handle.classList.remove('dragging');
    if (handle.hasPointerCapture?.(event.pointerId))
      handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { y: event.clientY, start: Math.max(MIN_STRIP_HEIGHT, current()) };
    handle.classList.add('dragging');
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  // Keyboard resizing keeps the separator reachable without a pointer.
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const base = current();
    const next =
      event.key === 'Home'
        ? MIN_STRIP_HEIGHT
        : event.key === 'End'
          ? MAX_STRIP_HEIGHT
          : base + (event.key === 'ArrowDown' ? 12 : -12);
    apply(persistStripHeight(app, next));
  });
  // Double click (or double tap) restores the automatic thumbnail height.
  handle.addEventListener('dblclick', () => {
    persistStripHeight(app, null);
    apply(null);
  });
}
function bindStrip(app) {
  const host = document.querySelector('.room-thumb-selector');
  if (!host) return;
  const toggle = host.querySelector('#room-strip-toggle');
  if (toggle) toggle.onclick = () => toggleStrip(app);
  bindStripResize(app, host);
  OrgUI.bindFilters(app, host);
  for (const button of host.querySelectorAll('[data-nav-room]'))
    button.onclick = () => {
      // A completed drag must not also navigate to the room it ended on.
      if (performance.now() < (app.state.roomTabClickAfter || 0)) return;
      if (button.dataset.navRoom === app.state.roomId) {
        app.state.roomFilter = app.state.roomFilter || 'all';
        app.render();
        return;
      }
      navigate(app, button.dataset.navRoom);
    };
  // Room thumbnails use the same organisation drag binder as the planning and
  // library cards: dropping on a named group tab assigns the room; dropping on
  // another card inside a group filter reorders that group's own list only.
  OrgUI.bindCardDrag(app, host);
  // Folded thumbnails live inside display:none; skip painting that work and
  // repaint on the expand render instead.
  if (!stripCollapsed(app)) paintThumbnails(app, host);
}
// Kept as aliases: other pages and older tests call tabs()/bindTabs().
const tabs = strip;
function bindTabs(app) {
  bindStrip(app);
}
// Reorder inside a group only: project room arrays keep their own order, so a
// group can show a rhythm that differs from the project sequence.
function moveInGroup(project, groupId, id, target, after) {
  project.roomOrganization = Org.moveWithinGroup(Org.ensure(project), groupId, id, target, after);
}
module.exports = {
  context,
  navigate,
  ownerGroup,
  ownerLabel,
  groupNameOf,
  filterForRoom,
  applyOwnerFilter,
  cycleOwnerGroup,
  breadcrumbs,
  bindBreadcrumbs,
  strip,
  stripCollapsed,
  bindStrip,
  bindStripResize,
  paintThumbnails,
  toggleStrip,
  expandStrip,
  stripHeight,
  persistStripHeight,
  clampStripHeight,
  COLLAPSE_KEY,
  STRIP_HEIGHT_KEY,
  MIN_STRIP_HEIGHT,
  MAX_STRIP_HEIGHT,
  tabs,
  bindTabs,
  moveInGroup,
  UNGROUPED,
  THUMB_WIDTH,
  THUMB_HEIGHT,
};
