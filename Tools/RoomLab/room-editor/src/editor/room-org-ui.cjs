'use strict';
// Shared DOM helpers for room organisation: favourite stars, filter chips and
// user-named group controls. Planning (strip/library) and the map inspector all
// use these, so a star means the same thing everywhere. All writes go through
// store.change(), which gives favourites/groups undo + redo for free.
const Org = require('../project/room-organization.cjs'),
  GraphLayout = require('./graph-layout.cjs'),
  { esc, $, modal, field } = require('./dom.cjs');
function organization(app) {
  return Org.ensure(app.store.project);
}
function write(app, next) {
  app.store.change(() => {
    app.store.project.roomOrganization = next;
  });
}
function toggleFavorite(app, roomId) {
  if (!org1Room(app.store.project, roomId)) return;
  write(app, Org.toggleFavorite(organization(app), roomId));
}
function org1Room(project, roomId) {
  return !!GraphLayout.locate(project, roomId);
}
function starMarkup(app, roomId, extraClass = '') {
  const on = Org.isFavorite(organization(app), roomId);
  return `<button class="fav-toggle${on ? ' on' : ''}${extraClass ? ' ' + extraClass : ''}" data-fav="${esc(roomId)}" aria-pressed="${on}" title="${on ? '取消收藏' : '收藏此房间'}" aria-label="${on ? '取消收藏' : '收藏'}">${on ? '★' : '☆'}</button>`;
}
function bindStars(app, host) {
  if (!host) return;
  for (const button of host.querySelectorAll('[data-fav]'))
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(app, button.dataset.fav);
    };
}
// Filter bar: 全部 / 收藏 / user groups. Favourite highlights stay visible in
// every filter; the map always shows all rooms.
function filterValue(app) {
  const value = app.state.roomFilter || 'all';
  if (value === 'all' || value === 'favorites') return value;
  if (typeof value === 'string' && value.startsWith('group:'))
    return Org.groupOf(organization(app), value.slice(6)) ? value : 'all';
  return 'all';
}
function filtersMarkup(app) {
  const org = organization(app),
    active = filterValue(app);
  const button = (id, label, extra = '') =>
    `<button data-room-filter="${esc(id)}" class="room-filter${active === id ? ' active' : ''}" aria-pressed="${active === id}">${label}${extra}</button>`;
  return `<div class="room-filters" role="group" aria-label="房间筛选">${button('all', '全部')}${button('favorites', '★ 收藏', org.favorites.length ? `<small>${org.favorites.length}</small>` : '')}${org.groups
    .map((group) =>
      button(
        'group:' + group.id,
        esc(group.name),
        group.roomIds.length ? `<small>${group.roomIds.length}</small>` : '',
      ),
    )
    .join(
      '',
    )}<span class="room-filter-tools"><button id="group-new" title="新建房间分组（跨大关）">＋ 分组</button><button id="group-manage" title="重命名 / 删除分组">⋯</button></span></div>`;
}
function filteredRoomIds(app) {
  return Org.filterRoomIds(app.store.project, filterValue(app));
}
function bindFilters(app, host) {
  if (!host) return;
  for (const button of host.querySelectorAll('[data-room-filter]'))
    button.onclick = () => {
      app.state.roomFilter = button.dataset.roomFilter;
      app.state.graphSelection = null;
      app.state.roomMulti = [];
      app.render();
    };
  if ($('group-new')) $('group-new').onclick = () => newGroup(app, currentSelection(app));
  if ($('group-manage')) $('group-manage').onclick = () => manageGroups(app);
}
// Rooms a group action applies to: multi-selection first, then the selected
// room. Single-room actions always use one explicit ID.
function currentSelection(app) {
  const multi = (app.state.roomMulti || []).filter((id) => org1Room(app.store.project, id));
  if (multi.length) return multi;
  const selected = app.state.graphSelection;
  return selected?.kind === 'room' && org1Room(app.store.project, selected.id) ? [selected.id] : [];
}
function groupNamesMarkup(app, roomId) {
  const groups = Org.groupsContaining(organization(app), roomId);
  if (!groups.length) return '<span class="group-none">未分组</span>';
  return groups
    .map(
      (group) =>
        `<button class="group-chip" data-group-remove="${esc(group.id)}" data-room="${esc(roomId)}" title="从「${esc(group.name)}」移出（房间与分组都保留）">${esc(group.name)} ×</button>`,
    )
    .join('');
}
// Compact add-to-group control used by the strip, library cards and inspector.
function groupControlMarkup(app, targetIds, options = {}) {
  const org = organization(app),
    ids = Array.isArray(targetIds) ? targetIds : currentSelection(app),
    single = ids.length === 1 ? ids[0] : null;
  const scope = single ? `data-group-scope="1"` : `data-group-scope="multi"`;
  const groups = single
    ? Org.groupsContaining(org, single)
        .map(
          (group) =>
            `<button class="group-chip" data-group-remove="${esc(group.id)}" data-room="${esc(single)}" title="移出分组（不删除房间）">${esc(group.name)} ×</button>`,
        )
        .join('')
    : `<span class="muted">已选 ${ids.length} 间房</span>`;
  const select = `<select data-group-select ${ids.length ? '' : 'disabled'} title="把所选房间加入分组；分组与房间可来自不同大关"><option value="">${ids.length ? '加入分组…' : '先选择房间'}</option>${org.groups.map((group) => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('')}</select>`;
  return `<div class="group-control" ${scope} data-group-targets="${esc(ids.join(' '))}">${groups}${select}<button data-group-new title="新建分组并放入所选房间">＋</button></div>`;
}
function bindGroupControls(app, host, targetsFor) {
  if (!host) return;
  for (const control of host.querySelectorAll('.group-control')) {
    const ids = () =>
      typeof targetsFor === 'function'
        ? targetsFor()
        : (control.dataset.groupTargets || '').split(' ').filter(Boolean);
    const select = control.querySelector('[data-group-select]');
    if (select)
      select.onchange = () => {
        const groupId = select.value,
          roomIds = ids();
        select.value = '';
        if (!groupId || !roomIds.length) return;
        write(app, Org.assign(organization(app), groupId, roomIds));
      };
    const add = control.querySelector('[data-group-new]');
    if (add)
      add.onclick = (event) => {
        event.stopPropagation();
        newGroup(app, ids());
      };
    for (const chip of control.querySelectorAll('[data-group-remove]'))
      chip.onclick = (event) => {
        event.stopPropagation();
        write(app, Org.unassign(organization(app), chip.dataset.groupRemove, [chip.dataset.room]));
      };
  }
}
function promptGroupName(app, title, value, onSave) {
  const save = () => {
    const input = $('group-name-input'),
      name = input.value.trim();
    if (!name) {
      input.setCustomValidity('请输入分组名称。');
      input.reportValidity();
      return;
    }
    $('dialog').close();
    onSave(name);
  };
  modal(
    title,
    `<div class="form">${field('分组名称（仅用于整理，不改变大关归属）', 'group-name-input', value)}</div>`,
    [{ label: '取消' }, { label: '保存', primary: true, close: false, action: save }],
  );
  const input = $('group-name-input');
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
function newGroup(app, roomIds = []) {
  promptGroupName(app, '新建房间分组', '', (name) =>
    write(app, Org.createGroup(organization(app), name, roomIds)),
  );
}
function renameGroup(app, groupId) {
  const group = Org.groupOf(organization(app), groupId);
  if (!group) return;
  promptGroupName(app, '重命名分组', group.name, (name) =>
    write(app, Org.renameGroup(organization(app), groupId, name)),
  );
}
function removeGroup(app, groupId) {
  const group = Org.groupOf(organization(app), groupId);
  if (!group) return;
  modal(
    '删除分组',
    `<p>删除分组「${esc(group.name)}」？分组内的 ${group.roomIds.length} 间房会保留，只解除分组关系，可撤销。</p>`,
    [
      { label: '取消' },
      {
        label: '删除分组',
        action: () => {
          if (filterValue(app) === 'group:' + groupId) app.state.roomFilter = 'all';
          write(app, Org.deleteGroup(organization(app), groupId));
        },
      },
    ],
  );
  $('dialog-actions').lastElementChild.classList.add('danger');
}
function manageGroups(app) {
  const org = organization(app);
  const rows = org.groups
    .map(
      (group) =>
        `<div class="group-row" data-group-row="${esc(group.id)}"><button data-group-pick="${esc(group.id)}" class="group-name" title="筛选此分组">${esc(group.name)}</button><span class="muted">${group.roomIds.length} 间房</span><button data-group-rename="${esc(group.id)}">重命名</button><button data-group-delete="${esc(group.id)}" class="danger">删除</button></div>`,
    )
    .join('');
  modal(
    '分组管理',
    `<p class="hint">分组只用于整理；可以跨大关，删除分组不会删除房间。</p>${rows || '<p class="muted">还没有分组。</p>'}<div class="actions"><button id="group-here-new">＋ 新建分组</button></div>`,
    [{ label: '关闭' }],
  );
  for (const button of document.querySelectorAll('[data-group-rename]'))
    button.onclick = () => {
      $('dialog').close();
      renameGroup(app, button.dataset.groupRename);
    };
  for (const button of document.querySelectorAll('[data-group-delete]'))
    button.onclick = () => {
      $('dialog').close();
      removeGroup(app, button.dataset.groupDelete);
    };
  for (const button of document.querySelectorAll('[data-group-pick]'))
    button.onclick = () => {
      $('dialog').close();
      app.state.roomFilter = 'group:' + button.dataset.groupPick;
      app.render();
    };
  $('group-here-new').onclick = () => {
    $('dialog').close();
    newGroup(app, currentSelection(app));
  };
}
module.exports = {
  organization,
  toggleFavorite,
  starMarkup,
  bindStars,
  filterValue,
  filtersMarkup,
  filteredRoomIds,
  bindFilters,
  currentSelection,
  groupNamesMarkup,
  groupControlMarkup,
  bindGroupControls,
  newGroup,
  renameGroup,
  removeGroup,
  manageGroups,
};
