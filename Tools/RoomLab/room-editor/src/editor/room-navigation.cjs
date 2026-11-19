'use strict';
const Org = require('../project/room-organization.cjs');
const Layout = require('./graph-layout.cjs');
const { esc, $ } = require('./dom.cjs');

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
function navigate(app, roomId, groupId) {
  const owner = Layout.locate(app.store.project, roomId);
  if (!owner) return;
  app.go('room', {
    courseId: owner.course.id,
    roomId,
    ...(groupId !== undefined ? { roomGroupId: groupId } : {}),
  });
}
function breadcrumbs(app) {
  const ctx = context(app.store.project, app.state.roomId, app.state);
  return `<button id="crumb-project">项目</button><span>/</span><select id="room-nav-scope" aria-label="房间切换范围"><option value="">全部房间</option>${ctx.groups
    .filter((g) => g.roomIds.length)
    .map(
      (g) =>
        `<option value="${esc(g.id)}" ${g.id === ctx.group?.id ? 'selected' : ''}>${esc(g.name)}</option>`,
    )
    .join(
      '',
    )}</select><span>/</span><select id="room-nav-current" aria-label="切换房间">${ctx.rooms.map(({ room }) => `<option value="${esc(room.id)}" ${room.id === app.state.roomId ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}</select>`;
}
function bindBreadcrumbs(app) {
  const scope = $('room-nav-scope'),
    current = $('room-nav-current');
  if (!scope || !current) return;
  current.onchange = () => navigate(app, current.value, scope.value || null);
  scope.onchange = () => {
    const group = Org.ensure(app.store.project).groups.find((g) => g.id === scope.value);
    if (!group) {
      app.state.roomGroupId = null;
      app.render();
      return;
    }
    const id = group.roomIds.includes(app.state.roomId) ? app.state.roomId : group.roomIds[0];
    if (id) navigate(app, id, group.id);
  };
}
function tabs(app) {
  const ctx = context(app.store.project, app.state.roomId, app.state);
  if (!ctx.group) return '';
  return `<div class="room-tabs" aria-label="分组内房间"><span class="room-tabs-label">${esc(ctx.group.name)}</span><div>${ctx.rooms.map(({ room }) => `<button data-nav-room="${esc(room.id)}" aria-current="${room.id === app.state.roomId ? 'page' : 'false'}" class="${room.id === app.state.roomId ? 'active' : ''}" title="${esc(room.notes || '')}">${esc(room.name)}</button>`).join('')}</div></div>`;
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
function bindTabs(app) {
  const host = document.querySelector('.room-tabs > div');
  const ctx = context(app.store.project, app.state.roomId, app.state);
  if (!host || !ctx.group) return;
  host.querySelectorAll('[data-nav-room]').forEach((button) => {
    button.onclick = () => navigate(app, button.dataset.navRoom, ctx.group.id);
  });
  require('./room-tab-order.cjs').bind(app, null, host, {
    title: '按住拖动调整组内顺序',
    move: (id, target, after) => moveInGroup(app.store.project, ctx.group.id, id, target, after),
  });
}
module.exports = { context, navigate, breadcrumbs, bindBreadcrumbs, tabs, bindTabs, moveInGroup };
