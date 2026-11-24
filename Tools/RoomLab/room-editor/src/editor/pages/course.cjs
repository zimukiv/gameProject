'use strict';
// Legacy course workspace (rules / art bindings). The route map and the room
// list are the same shared components the planning screen uses, so both routes
// agree on geometry, room cards and actions. The map itself is always global;
// this page only preselects the course tab and locks the library filter.
const Limits = require('../../project/room-limits.cjs');
const { esc, $, field, area } = require('../dom.cjs');
const Board = require('../graph-board.cjs'),
  Library = require('../room-library-panel.cjs');
const TABS = [
  ['graph', '全局路线图'],
  ['rooms', '房间列表'],
  ['settings', '大关规则'],
  ['bindings', '本关美术绑定'],
];
function render(app) {
  const c = app.course(),
    tab = app.state.courseTab || 'graph';
  if (tab === 'graph' && Board.ensureProjectLayout(app)) return;
  $('app').innerHTML =
    `<div class="page-title"><div><h1>${esc(c.name)}</h1><p class="muted">${esc(c.notes)} · AI ID：${esc(c.aiId || '未指定')} · 路线图显示全部大关</p></div><div class="actions"><button id="add-room">新建房间</button><button id="test-course" class="primary">从首房试玩</button></div></div><div class="tabs">${TABS.map(
      ([id, name]) =>
        `<button data-tab="${id}" class="${tab === id ? 'active' : ''}">${name}</button>`,
    ).join('')}</div><div id="course-content"></div>`;
  $('add-room').onclick = () => Library.addRoom(app, c);
  $('test-course').onclick = () => app.startPlay(c.rooms[0].id);
  $('app')
    .querySelectorAll('[data-tab]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          app.state.courseTab = b.dataset.tab;
          app.render();
        }),
    );
  if (tab === 'graph') {
    $('course-content').innerHTML = Board.markup(app);
    Board.mount(app);
  } else if (tab === 'rooms') Library.render(app, $('course-content'), { courseId: c.id });
  else if (tab === 'settings') settings(app, c);
  else app.renderBindings(c, $('course-content'));
}
function settings(app, c) {
  $('course-content').innerHTML =
    `<div class="panel form" style="max-width:650px">${field('大关名称', 'course-name', c.name)}${area('大关备注', 'course-notes', c.notes)}${field('默认 AI ID（不配置技能）', 'course-ai', c.aiId)}<div class="row">${field('新房间默认列数', 'course-cols', c.defaultSize.cols, { type: 'number', min: 6, max: Limits.MAX_COLS })}${field('新房间默认行数', 'course-rows', c.defaultSize.rows, { type: 'number', min: 5, max: Limits.MAX_ROWS })}</div><p class="hint">默认尺寸只影响以后创建的房间。首冲落地恢复，并计入每周期三次上限；付费库存不因落地补满。</p><button id="save-course" class="primary apply">应用大关设置</button></div>`;
  require('../native-panel.cjs').course(app, c, $('course-content').querySelector('.form'));
  $('save-course').onclick = () => {
    const cols = Number($('course-cols').value),
      rows = Number($('course-rows').value);
    if (!Limits.valid(cols, rows)) {
      app.message(Limits.description, true);
      return;
    }
    app.store.change(() => {
      c.name = $('course-name').value.trim() || c.name;
      c.notes = $('course-notes').value;
      c.aiId = $('course-ai').value.trim();
      c.defaultSize = { cols, rows };
    });
  };
}
module.exports = { render };
