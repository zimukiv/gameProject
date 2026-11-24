'use strict';
// Group package import: preview the manifest, choose one target course, then
// commit through group-import.cjs as a single undo step. Assets are written
// through the existing asset manager before the project object is swapped, the
// same order the single-room import dialog uses.
const { $, esc, modal } = require('./dom.cjs'),
  GroupImport = require('../project/group-import.cjs'),
  Native = require('../project/native-compat.cjs'),
  Assets = require('../assets/manager.cjs');
function open(app, incoming, options = {}) {
  const info = GroupImport.describe(incoming.project),
    courses = app.store.project.courses,
    color = info.color || '',
    signature = () => JSON.stringify(app.store.project),
    feedback = (message) => {
      if ($('group-import-feedback')) $('group-import-feedback').textContent = message;
    };
  async function commit(plan, stamp) {
    const buttons = [...$('dialog-actions').querySelectorAll('button')];
    buttons.forEach((button) => (button.disabled = true));
    try {
      if (signature() !== stamp) throw new Error('当前项目已变化，请重新导入');
      for (const [path, bytes] of plan.files)
        if (!app.store.assetFiles.has(path)) await Assets.putBlob(path, bytes);
      if (signature() !== stamp) throw new Error('当前项目已变化，请重新导入');
      const before = app.store.snapshot(),
        courseId = $('group-import-course').value;
      app.store.project = plan.project;
      app.store.assetFiles = plan.files;
      app.store.commit(before);
      $('dialog').close();
      app.go('home', {
        courseId,
        roomId: plan.rooms[0].id,
        planningTab: 'map',
        roomFilter: 'all',
        graphSelection: { kind: 'room', id: plan.rooms[0].id, courseId },
      });
      app.message(
        `已导入分组「${plan.groupName}」：${plan.rooms.length} 间房，新增 ${plan.addedAssets} 个素材` +
          (plan.boundaryConnections
            ? `；${plan.boundaryConnections} 条跨分组连线只保留为来源标记，未自动接入`
            : '') +
          '。可撤销。',
      );
    } catch (error) {
      feedback(error.message);
      buttons.forEach((button) => (button.disabled = false));
    }
  }
  function confirm() {
    try {
      const stamp = signature(),
        plan = GroupImport.prepare(
          app.store.project,
          app.store.assetFiles,
          incoming.project,
          incoming.files,
          $('group-import-course').value,
          $('group-import-art').checked,
          {
            signalMode: $('group-import-signals')?.value,
            adoptNative: $('group-import-adopt')?.checked,
          },
        );
      commit(plan, stamp);
    } catch (error) {
      feedback(error.message);
    }
  }
  modal(
    '导入分组',
    `<p>${esc(options.label || incoming.project.name)} · 分组「${esc(info.name)}」包含 ${info.specs.length} 间房。</p>` +
      `<p class="hint">${color ? `<span class="badge" style="border-color:${esc(color)}">分组颜色 ${esc(color)}</span> ` : ''}房间内容、分组顺序/颜色、分组内部玩家连线（含跨课程）、AI 连线与 AI 出口绑定都会保留。指向分组外的连线只保存来源信息，不会接到无关房间。</p>` +
      `<label>目标大关<select id="group-import-course">${courses
        .map(
          (course) =>
            `<option value="${esc(course.id)}" ${course.id === app.state.courseId ? 'selected' : ''}>${esc(course.name)}</option>`,
        )
        .join('')}</select></label>` +
      (Native.enabled(incoming.project)
        ? `<label>同名跨房信号<select id="group-import-signals"><option value="">请选择处理方式</option><option value="independent">独立信号（本批导入共用新名称）</option><option value="reuse">复用目标大关同名信号</option></select></label>${
            Native.enabled(app.store.project)
              ? ''
              : '<label class="check"><input type="checkbox" id="group-import-adopt">为整个目标项目启用来源测试版规则（影响旧房间）</label>'
          }`
        : '') +
      '<label class="check"><input type="checkbox" id="group-import-art" checked>保留房间原美术</label>' +
      '<p class="hint">导入后的房间会作为一整块放在目标大关现有房间右侧，并保留来源房间之间的相对位置。</p>' +
      '<p id="group-import-feedback" role="status"></p>',
    [
      { label: '取消' },
      { label: '导入分组', primary: true, close: false, action: confirm },
    ],
  );
  for (const id of ['group-import-signals', 'group-import-adopt'])
    if ($(id)) $(id).onchange = () => feedback('');
}
module.exports = { open };
