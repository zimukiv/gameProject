'use strict';
const { esc, $, modal, field, area } = require('../dom.cjs'),
  Themes = require('../../project/themes.cjs');
function bindCourseMenu(app, p) {
  const menu = $('course-context-menu'),
    rename = $('rename-course'),
    button = $('delete-course');
  let selected;
  const open = (card, x, y) => {
    selected = card.dataset.course;
    button.disabled = p.courses.length <= 1;
    button.textContent = button.disabled ? '至少保留一个大关' : '删除大关';
    if (!menu.matches(':popover-open')) menu.showPopover();
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - menu.offsetWidth - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - menu.offsetHeight - 4)) + 'px';
    rename.focus({ preventScroll: true });
  };
  for (const card of $('app').querySelectorAll('[data-course]')) {
    card.oncontextmenu = (e) => {
      e.preventDefault();
      const box = card.getBoundingClientRect();
      open(card, e.clientX || box.left, e.clientY || box.top);
    };
  }
  rename.onclick = () => {
    const id = selected,
      course = app.store.project.courses.find((c) => c.id === id);
    menu.hidePopover();
    if (!course) return;
    const save = () => {
      const input = $('course-label'),
        name = input.value.trim();
      if (!name) {
        input.setCustomValidity('请输入大关名称。');
        input.reportValidity();
        return;
      }
      $('dialog').close();
      app.store.change((project) => {
        const current = project.courses.find((c) => c.id === id);
        if (current) current.name = name;
      });
    };
    modal(
      '重命名大关',
      `<div class="form">${field('大关名称', 'course-label', course.name)}</div>`,
      [{ label: '取消' }, { label: '保存名称', primary: true, close: false, action: save }],
    );
    const input = $('course-label');
    input.oninput = () => input.setCustomValidity('');
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        save();
      }
    };
    input.focus();
    input.select();
  };
  button.onclick = () => {
    const id = selected,
      course = p.courses.find((c) => c.id === id);
    menu.hidePopover();
    if (!course || p.courses.length <= 1) return;
    modal(
      '删除大关',
      '<p>删除「' +
        esc(course.name) +
        '」及其 ' +
        course.rooms.length +
        ' 间房、' +
        course.connections.length +
        ' 条连线？项目素材保留，可用 Ctrl+Z 撤销。</p>',
      [
        { label: '取消' },
        {
          label: '确认删除大关',
          action: () => {
            const courses = app.store.project.courses;
            if (courses.length <= 1 || !courses.some((c) => c.id === id)) return;
            if (app.state.courseId === id) {
              app.state.courseId = courses.find((c) => c.id !== id).id;
              app.state.roomId = null;
              app.state.graphSelection = null;
            }
            app.store.change((project) => {
              project.courses = project.courses.filter((c) => c.id !== id);
            });
            app.message('已删除大关，可用 Ctrl+Z 撤销。');
          },
        },
      ],
    );
    $('dialog-actions').lastElementChild.classList.add('danger');
  };
}
function render(app) {
  const p = app.store.project;
  $('app').innerHTML =
    `<div class="page-title"><div><h1>${esc(p.name)}</h1><p class="muted">${esc(p.notes || '项目首页 · 先进入大关，再编辑房间')}</p></div><div class="actions"><button id="project-settings">项目说明</button><button id="add-course">新建大关</button></div></div><div class="cards">${p.courses
      .map((c) => {
        const t = Themes.theme(c.kind);
        return `<article class="card course-card" data-course="${esc(c.id)}" data-kind="${esc(c.kind)}" style="--theme-color:${esc(t.color)}"><span class="badge theme-badge">${t.order} · ${esc(t.label)}</span><h2>${esc(c.name)}</h2><p>${esc(c.notes)}</p><p>${c.rooms.length} 间房 · ${c.connections.length} 条连线</p><button data-enter="${esc(c.id)}" class="primary">进入大关 →</button></article>`;
      })
      .join(
        '',
      )}</div><div id="course-context-menu" class="course-context-menu" popover><button id="rename-course">重命名大关</button><button id="delete-course" class="danger">删除大关</button></div>`;
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
  $('add-course').onclick = () => app.chooseCourse();
  bindCourseMenu(app, p);
}
module.exports = { render };
