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
  const filter = OrgUI.filterValue(app),
    ids = new Set(Org.filterRoomIds(app.store.project, filter)),
    visible = app.store.project.courses.flatMap((course) =>
      course.rooms.filter((room) => ids.has(room.id)).map((room) => ({ course, room })),
    );
  const collapsed = stripCollapsed(app),
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
  return `<div class="room-thumb-selector${collapsed ? ' collapsed' : ''}" aria-label="房间缩略图选择栏"><div class="room-strip-head"><button id="room-strip-toggle" class="room-strip-toggle" aria-expanded="${!collapsed}" aria-controls="room-thumb-strip" title="${collapsed ? '展开房间缩略图栏' : '收起房间缩略图栏，释放画布高度'}"><span class="room-strip-count">房间选择 ${visible.length}</span><span class="room-strip-caret" aria-hidden="true">${collapsed ? '▸ 展开' : '▾ 收起'}</span></button></div>${OrgUI.filtersMarkup(app)}<div class="room-thumb-strip" id="room-thumb-strip">${cards || '<p class="room-strip-empty muted">此筛选下没有房间。</p>'}</div></div>`;
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
function bindStrip(app) {
  const host = document.querySelector('.room-thumb-selector');
  if (!host) return;
  const toggle = host.querySelector('#room-strip-toggle');
  if (toggle) toggle.onclick = () => toggleStrip(app);
  OrgUI.bindFilters(app, host);
  for (const button of host.querySelectorAll('[data-nav-room]'))
    button.onclick = () => {
      if (button.dataset.navRoom === app.state.roomId) {
        app.state.roomFilter = app.state.roomFilter || 'all';
        app.render();
        return;
      }
      navigate(app, button.dataset.navRoom);
    };
  // Inside a group filter the thumbnails can be dragged to reorder the group,
  // exactly like the old tab list did (rooms stay in their project arrays).
  const groupId = String(OrgUI.filterValue(app)).replace(/^group:/, ''),
    inGroup = Org.groupOf(Org.ensure(app.store.project), groupId);
  if (inGroup) {
    const stripHost = host.querySelector('.room-thumb-strip');
    if (stripHost)
      require('./room-tab-order.cjs').bind(app, null, stripHost, {
        title: '按住拖动调整组内顺序',
        move: (id, target, after) => moveInGroup(app.store.project, inGroup.id, id, target, after),
      });
  }
  // Folded thumbnails live inside display:none; skip painting that work and
  // repaint on the expand render instead.
  if (!stripCollapsed(app)) paintThumbnails(app, host);
}
// Kept as aliases: other pages and older tests call tabs()/bindTabs().
const tabs = strip;
function bindTabs(app) {
  bindStrip(app);
}
function moveInGroup(project, groupId, id, target, after) {
  const org = Org.ensure(project),
    group = org.groups.find((g) => g.id === groupId);
  if (!group || id === target || !group.roomIds.includes(id) || !group.roomIds.includes(target))
    return;
  group.roomIds.splice(group.roomIds.indexOf(id), 1);
  group.roomIds.splice(group.roomIds.indexOf(target) + (after ? 1 : 0), 0, id);
  project.roomOrganization = org;
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
  paintThumbnails,
  toggleStrip,
  expandStrip,
  COLLAPSE_KEY,
  tabs,
  bindTabs,
  moveInGroup,
  UNGROUPED,
  THUMB_WIDTH,
  THUMB_HEIGHT,
};
