'use strict';
const { esc, $, modal, field, area } = require('../dom.cjs'),
  M = require('../../project/model.cjs');
function render(app) {
  const p = app.store.project;
  $('app').innerHTML =
    `<div class="page-title"><div><h1>${esc(p.name)}</h1><p class="muted">${esc(p.notes || '项目首页 · 先进入大关，再编辑房间')}</p></div><div class="actions"><button id="project-settings">项目说明</button><button id="add-course">新增空大关</button></div></div><div class="cards">${p.courses.map((c) => `<article class="card course-card" data-course="${esc(c.id)}"><span class="badge">${esc(c.kind.toUpperCase())}</span><h2>${esc(c.name)}</h2><p>${esc(c.notes)}</p><p>${c.rooms.length} 间房 · ${c.connections.length} 条连线</p><button data-enter="${esc(c.id)}" class="primary">进入大关 →</button></article>`).join('')}</div>`;
  $('app')
    .querySelectorAll('[data-enter]')
    .forEach((b) => (b.onclick = () => app.go('course', { courseId: b.dataset.enter })));
  $('project-settings').onclick = () =>
    modal(
      '项目名称与备注',
      `<div class="form">${field('项目名称', 'project-label', p.name)}${area('备注', 'project-notes', p.notes)}</div>`,
      [
        { label: '取消' },
        {
          label: '保存',
          primary: true,
          action: () =>
            app.store.change((v) => {
              v.name = $('project-label').value.trim() || v.name;
              v.notes = $('project-notes').value;
            }),
        },
      ],
    );
  $('add-course').onclick = () => app.newCourse();
}
module.exports = { render };
