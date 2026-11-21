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
      ).replace(
        '<button ',
        `<button data-group-tab="${esc(group.id)}" title="分组「${esc(group.name)}」：把房间卡片拖到这里加入；在分组视图内拖动卡片可调整组内顺序" `,
      ),
    )
    .join(
      '',
    )}<span class="room-filter-tools"><button id="group-new" title="新建房间分组（跨大关）">＋ 分组</button><button id="group-manage" title="重命名 / 删除分组">⋯</button></span></div>`;
}
function filteredRoomIds(app) {
  return Org.filterRoomIds(app.store.project, filterValue(app));
}
// Ordered project rooms for the current filter. `filterRoomIds` already returns
// a group's own `roomIds` order, so the strips must map IDs in that order instead
// of filtering the project array (which would silently restore project order).
function orderedRooms(app, filter = filterValue(app)) {
  const byId = new Map();
  for (const course of app.store.project.courses || [])
    for (const room of course.rooms || []) byId.set(room.id, { course, room });
  return Org.filterRoomIds(app.store.project, filter)
    .map((id) => byId.get(id))
    .filter(Boolean);
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
// ---------------------------------------------------------------------------
// Drag cards onto group tabs / onto each other.
//
// Planning cards (`[data-strip-room]`) and library cards (`[data-room-card]`)
// are pointer-dragged. Dropping one on a group filter tab assigns it to that
// group. Dropping it on another card while a group filter is active reorders
// the group's own roomIds list only: project.courses[].rooms is never touched,
// so group order can stay independent of project order.
// Room-page thumbnail cards use data-nav-room, so the same binder now covers
// them: they can be dropped on a named group tab or reordered inside a group.
const CARD_SELECTOR = '[data-strip-room],[data-room-card],[data-nav-room]';
const cardId = (card) =>
  card?.dataset.stripRoom || card?.dataset.roomCard || card?.dataset.navRoom || null;
const cardSelector = (id) =>
  `[data-strip-room="${id}"], [data-room-card="${id}"], [data-nav-room="${id}"]`;
const groupTabAt = (x, y) => {
  const target = document.elementFromPoint?.(x, y);
  const tab = target?.closest?.('[data-room-filter^="group:"]');
  return tab ? tab.dataset.roomFilter.slice(6) : null;
};
const cardAt = (x, y) => {
  const target = document.elementFromPoint?.(x, y);
  return cardId(target?.closest?.(CARD_SELECTOR));
};
function clearDropMarks(host) {
  for (const node of host.querySelectorAll('.group-tab-drop, .room-card-drop-before, .room-card-drop-after'))
    node.classList.remove('group-tab-drop', 'room-card-drop-before', 'room-card-drop-after');
}
function activeGroupId(app) {
  const filter = filterValue(app);
  return typeof filter === 'string' && filter.startsWith('group:') ? filter.slice(6) : null;
}
// In the All/favourites view there is no active group filter, but dropping a
// card on another card can still reorder a shared group. Only do it when the
// two rooms share exactly one group; two shared groups are ambiguous and must
// leave every order untouched.
function reorderGroupId(app, roomId, targetId) {
  if (!roomId || !targetId || roomId === targetId) return null;
  const org = organization(app);
  const shared = Org.groupsContaining(org, roomId).filter((group) =>
    group.roomIds.includes(targetId),
  );
  return shared.length === 1 ? shared[0].id : null;
}
function bindCardDrag(app, host) {
  if (!host) return;
  const cards = [...host.querySelectorAll(CARD_SELECTOR)];
  if (cards.length < 1) return;
  for (const card of cards) {
    const roomId = cardId(card);
    let drag = null;
    card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      // A card may itself be a button (room-page thumbnails): only nested
      // interactive controls opt out of dragging, not the card element.
      const interactive = event.target.closest(
        'button, a, input, select, textarea, [data-fav]',
      );
      if (interactive && interactive !== card) return;
      drag = { x: event.clientX, y: event.clientY, active: false, id: roomId };
    });
    card.addEventListener('pointermove', (event) => {
      if (!drag) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
        drag.active = true;
        card.classList.add('room-card-dragging');
        card.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      clearDropMarks(host);
      const tabGroupId = groupTabAt(event.clientX, event.clientY);
      if (tabGroupId) {
        const tab = host.querySelector(`[data-room-filter="group:${tabGroupId}"]`);
        tab?.classList.add('group-tab-drop');
        return;
      }
      const targetId = cardAt(event.clientX, event.clientY),
        groupId = activeGroupId(app) || reorderGroupId(app, drag.id, targetId);
      if (!groupId || !targetId || targetId === drag.id) return;
      const target = host.querySelector(cardSelector(targetId));
      const box = target?.getBoundingClientRect?.();
      if (target && box)
        target.classList.add(
          event.clientX > box.x + box.width / 2
            ? 'room-card-drop-after'
            : 'room-card-drop-before',
        );
    });
    const finish = (event) => {
      if (!drag) return;
      const wasActive = drag.active;
      const room = drag.id;
      drag = null;
      card.classList.remove('room-card-dragging');
      if (card.hasPointerCapture?.(event.pointerId)) card.releasePointerCapture(event.pointerId);
      clearDropMarks(host);
      if (!wasActive) return;
      // The trailing click of a drag must not open/select the card.
      app.state.roomTabClickAfter = performance.now() + 250;
      const tabGroupId = groupTabAt(event.clientX, event.clientY);
      if (tabGroupId) {
        write(app, Org.assign(organization(app), tabGroupId, [room]));
        const joined = Org.groupOf(organization(app), tabGroupId);
        app.message?.('已加入分组「' + (joined?.name || tabGroupId) + '」');
        return;
      }
      const targetId = cardAt(event.clientX, event.clientY),
        groupId = activeGroupId(app) || reorderGroupId(app, room, targetId);
      if (!groupId || !targetId || targetId === room) return;
      const group = Org.groupOf(organization(app), groupId);
      if (!group?.roomIds.includes(room) || !group.roomIds.includes(targetId)) return;
      const target = host.querySelector(cardSelector(targetId));
      const box = target?.getBoundingClientRect?.();
      const after = !box || event.clientX > box.x + box.width / 2;
      write(app, Org.moveWithinGroup(organization(app), groupId, room, targetId, after));
      app.message?.('组内顺序已调整（不影响项目顺序）');
    };
    card.addEventListener('pointerup', finish);
    card.addEventListener('pointercancel', finish);
  }
}
// ---------------------------------------------------------------------------
// Route map sidebar quick mode for a named group: every room is a row. A left
// click adds that room to the group, a right click removes it. Both go through
// the shared organisation store, so they are undoable and never delete rooms.
function quickGroup(app, groupId) {
  const org = organization(app),
    active = groupId || activeGroupId(app);
  if (active) return Org.groupOf(org, active);
  const selected = app.state.graphSelection?.kind === 'room' ? app.state.graphSelection.id : null;
  return selected ? Org.groupsContaining(org, selected)[0] || null : null;
}
function projectRooms(app) {
  return (app.store.project.courses || []).flatMap((course) => course.rooms || []);
}
function quickRoomRow(room, group) {
  const member = group.roomIds.includes(room.id),
    index = group.roomIds.indexOf(room.id);
  return `<button class="group-quick-room${member ? ' in' : ''}" data-group-quick-room="${esc(room.id)}" data-group-quick-group="${esc(group.id)}" aria-pressed="${member}" title="${member ? '右键从分组移出' : '左键加入分组'}「${esc(group.name)}」"><span class="group-quick-mark" aria-hidden="true">${member ? '✓' : '＋'}</span><span class="group-quick-name">${esc(room.name)}</span>${member ? `<span class="group-quick-index">${index + 1}</span>` : ''}</button>`;
}
function staticRoomRow(room) {
  return `<div class="group-quick-room static"><span class="group-quick-mark" aria-hidden="true">·</span><span class="group-quick-name">${esc(room.name)}</span></div>`;
}
function quickList(rows, empty) {
  return `<div class="group-quick-list">${rows || `<p class="muted">${empty}</p>`}</div>`;
}
// No named group is active: show every group as its own collapsible list plus
// one ungrouped bucket. Groups keep their independent roomIds order, and
// rooms may appear in several group lists without being duplicated in data.
function groupsOverviewMarkup(app) {
  const org = organization(app),
    rooms = projectRooms(app),
    byId = new Map(rooms.map((room) => [room.id, room])),
    grouped = new Set(org.groups.flatMap((group) => group.roomIds)),
    ungrouped = rooms.filter((room) => !grouped.has(room.id));
  if (!org.groups.length && !ungrouped.length) return '';
  const sections = org.groups.map((group, index) => {
    const members = group.roomIds.map((id) => byId.get(id)).filter(Boolean);
    return `<details class="group-overview-group${index === 0 ? ' first' : ''}"${index === 0 ? ' open' : ''} style="--group-color:${esc(Org.groupColor(group, index))}"><summary><span class="group-overview-dot" aria-hidden="true"></span><span class="group-overview-name">${esc(group.name)}</span><small>${members.length}</small></summary>${quickList(
      members.map((room) => quickRoomRow(room, group)).join(''),
      '这个分组还没有房间。',
    )}</details>`;
  });
  const ungroupedSection = `<details class="group-overview-group ungrouped"${org.groups.length ? '' : ' open'}><summary><span class="group-overview-dot" aria-hidden="true"></span><span class="group-overview-name">未分组</span><small>${ungrouped.length}</small></summary>${quickList(
    ungrouped.map(staticRoomRow).join(''),
    '所有房间都已分组。',
  )}</details>`;
  return `<section class="group-overview"><h3>房间分组</h3><p class="inspector-empty muted">点击房间查看说明与操作；分组列表可折叠。</p>${sections.join('')}${ungroupedSection}</section>`;
}
// A named group is active (or the selected room belongs to one): keep the quick
// panel, but split the collapsible lists into in-group and not-in-group. Left
// click adds, right click removes, exactly as before.
function quickGroupMarkup(app, groupId, options = {}) {
  const group = quickGroup(app, groupId);
  if (!group) return options.overview === false ? '' : groupsOverviewMarkup(app);
  const rooms = projectRooms(app),
    inGroup = group.roomIds.map((id) => rooms.find((room) => room.id === id)).filter(Boolean),
    rest = rooms.filter((room) => !group.roomIds.includes(room.id)),
    active = app.state.graphQuickGroupId === group.id;
  return `<section class="group-quick" data-group-quick="${esc(group.id)}"><h3>快捷分组 · ${esc(group.name)}</h3><div class="group-quick-actions"><button class="group-quick-toggle${active ? ' primary' : ''}" data-graph-quick-toggle="${esc(group.id)}" aria-pressed="${active}">${active ? '退出路线图快捷模式' : '在路线图上快捷增减'}</button>${active ? '<span class="badge">快捷模式</span>' : ''}</div><details class="group-quick-section" open><summary>组内房间 <small>${inGroup.length}</small></summary>${quickList(
    inGroup.map((room) => quickRoomRow(room, group)).join(''),
    '还没有房间，左键点击下方房间加入。',
  )}</details><details class="group-quick-section"><summary>未加入 <small>${rest.length}</small></summary>${quickList(
    rest.map((room) => quickRoomRow(room, group)).join(''),
    '所有房间都已在组内。',
  )}</details></section>`;
}
function bindQuickGroup(app, host) {
  if (!host) return;
  for (const toggle of host.querySelectorAll('[data-graph-quick-toggle]')) {
    const groupId = toggle.dataset.graphQuickToggle;
    toggle.onclick = () => {
      app.state.graphQuickGroupId = app.state.graphQuickGroupId === groupId ? null : groupId;
      app.render();
    };
  }
  for (const button of host.querySelectorAll('[data-group-quick-room]')) {
    const groupId = button.dataset.groupQuickGroup,
      roomId = button.dataset.groupQuickRoom;
    button.onclick = () => write(app, Org.assign(organization(app), groupId, [roomId]));
    button.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      write(app, Org.unassign(organization(app), groupId, [roomId]));
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
      (group, index) =>
        `<div class="group-row" data-group-row="${esc(group.id)}"><input type="color" data-group-color="${esc(group.id)}" value="${esc(Org.groupColor(group, index))}" title="分组颜色（新界面按此着色，不改变大关归属）"><button data-group-pick="${esc(group.id)}" class="group-name" title="筛选此分组">${esc(group.name)}</button><span class="muted">${group.roomIds.length} 间房</span><button data-group-rename="${esc(group.id)}">重命名</button><button data-group-delete="${esc(group.id)}" class="danger">删除</button></div>`,
    )
    .join('');
  modal(
    '分组管理',
    `<p class="hint">分组只用于整理；可以跨大关，删除分组不会删除房间。分组颜色用于新的房间缩略界面（旧主题色只作兼容适配）。</p>${rows || '<p class="muted">还没有分组。</p>'}<div class="actions"><button id="group-here-new">＋ 新建分组</button></div>`,
    [{ label: '关闭' }],
  );
  for (const input of document.querySelectorAll('[data-group-color]'))
    input.onchange = () => {
      const groupId = input.dataset.groupColor;
      write(app, Org.setGroupColor(organization(app), groupId, input.value));
    };
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
  orderedRooms,
  bindFilters,
  currentSelection,
  groupNamesMarkup,
  groupControlMarkup,
  bindGroupControls,
  CARD_SELECTOR,
  cardId,
  bindCardDrag,
  activeGroupId,
  reorderGroupId,
  projectRooms,
  groupsOverviewMarkup,
  quickGroup,
  quickGroupMarkup,
  bindQuickGroup,
  newGroup,
  renameGroup,
  removeGroup,
  manageGroups,
};
