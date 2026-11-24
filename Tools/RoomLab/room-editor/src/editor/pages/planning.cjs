'use strict';
// Project planning screen, room-first: a compact header, the 路线图 / 房间库 tabs,
// one horizontally scrollable strip of real room thumbnails, favourite/group
// filters, and a large global route map (default) or all-room library. Courses
// are still the ownership container but are not a navigation step; their legacy
// management lives in the collapsed 高级 panel and the Tools menu.
const Board = require('../graph-board.cjs'),
  Nav = require('../planning-nav.cjs'),
  Library = require('../room-library-panel.cjs'),
  OrgUI = require('../room-org-ui.cjs'),
  { esc, $, modal, field, area } = require('../dom.cjs');
function render(app) {
  const project = app.store.project,
    tab = app.state.planningTab === 'library' ? 'library' : 'map',
    rooms = Nav.roomsOf(app),
    org = OrgUI.organization(app);
  if (tab === 'map' && Board.ensureProjectLayout(app)) return;
  $('app').innerHTML =
    `<div class="planning-head"><div class="planning-title"><h1>${esc(project.name)}</h1><p class="muted">${rooms.length} 间房${org.favorites.length ? ' · ★ ' + org.favorites.length : ''}${org.groups.length ? ' · ' + org.groups.length + ' 个分组' : ''}</p></div><details class="planning-help"><summary title="使用说明与快捷操作">？ 说明</summary><div class="help-body"><p>单击缩略图：定位房间；双击或 ✎：进入。☆ 收藏；分组仅用于整理，可跨大关，不改变房间归属。</p><p>路线图：滚轮缩放 · 中键平移 · 拖空白框选 · 拖动已选房间整体移动 · 双击进入 · 从出口拖线到入口。紫色 AI 端口只连 AI 线，点击连线可删除；金色★为收藏。</p></div></details></div>` +
    `<div class="planning-bar">${Nav.tabs(tab)}${Nav.tools(app)}</div>` +
    Nav.filters(app) +
    `<details id="room-picker" class="room-picker" ${app.state.roomPickerCollapsed ? '' : 'open'}><summary>房间选择 <small>${rooms.length}</small></summary>${Nav.strip(app)}</details>` +
    Nav.contextMenu() +
    '<div id="planning-content"></div>';
  Nav.bind(app);
  if (tab === 'map') {
    // The board markup must exist inside the page container before mount().
    $('planning-content').innerHTML = Board.markup(app);
    Board.mount(app);
  } else {
    Library.render(app, $('planning-content'));
    OrgUI.bindStars(app, $('app'));
    OrgUI.bindGroupControls(app, $('planning-content'));
    OrgUI.bindCardDrag(app, $('planning-content'));
  }
}
function projectSettings(app) {
  const project = app.store.project;
  modal(
    '项目名称与备注',
    `<div class="form">${field('项目名称', 'project-label', project.name)}${area('备注', 'project-notes', project.notes)}</div>`,
    [
      { label: '取消' },
      {
        label: '保存',
        primary: true,
        action: () =>
          app.store.change((value) => {
            value.name = $('project-label').value.trim() || value.name;
            value.notes = $('project-notes').value;
          }),
      },
    ],
  );
}
module.exports = { render, projectSettings };
