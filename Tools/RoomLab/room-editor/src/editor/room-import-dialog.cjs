'use strict';
const { $, esc, modal } = require('./dom.cjs'),
  Batch = require('../project/room-import-batch.cjs'),
  Assets = require('../assets/manager.cjs');
function open(app, incoming, options = {}) {
  const choices = incoming.project.courses.flatMap((course) =>
      course.rooms.map((room) => ({ course, room })),
    ),
    selected = new Set(),
    modes = new Map();
  choices.forEach((x, i) => {
    if (
      options.selected
        ? options.selected.includes(Batch.key(x.course.id, x.room.id))
        : choices.length === 1
    )
      selected.add(i);
  });
  if ($('dialog').open) $('dialog').close();
  let pending = null;
  const signature = () => JSON.stringify(app.store.project),
    feedback = (message) => {
      if ($('room-import-feedback')) $('room-import-feedback').textContent = message;
    };
  const invalidate = () => {
    pending = null;
    if ($('room-import-confirm')) $('room-import-confirm').hidden = true;
  };
  async function commit(plan, stamp) {
    const buttons = [
      ...$('dialog-actions').querySelectorAll('button'),
      ...$('room-import-confirm').querySelectorAll('button'),
    ];
    buttons.forEach((b) => (b.disabled = true));
    try {
      if (signature() !== stamp) throw new Error('当前项目已变化，请重新预览导入');
      for (const [path, bytes] of plan.files)
        if (!app.store.assetFiles.has(path)) await Assets.putBlob(path, bytes);
      if (signature() !== stamp) throw new Error('当前项目已变化，请重新预览导入');
      const before = app.store.snapshot(),
        courseId = $('room-import-course').value;
      app.store.project = plan.project;
      app.store.assetFiles = plan.files;
      app.store.commit(before);
      $('dialog').close();
      if (plan.rooms.length === 1) app.go('room', { courseId, roomId: plan.rooms[0].id });
      else
        app.go('course', {
          courseId,
          roomId: plan.rooms[0].id,
          courseTab: 'graph',
          graphSelection: { kind: 'room', id: plan.rooms[0].id },
        });
      app.message(
        `已导入 ${plan.rooms.length} 个房间，覆盖 ${plan.overwritten.length} 个，新增 ${plan.addedAssets} 个素材。可撤销。`,
      );
    } catch (e) {
      feedback(e.message);
      buttons.forEach((b) => (b.disabled = false));
      invalidate();
    }
  }
  function importSelected() {
    try {
      const stamp = signature(),
        courseId = $('room-import-course').value,
        selections = [...selected]
          .sort((a, b) => a - b)
          .map((i) => ({
            courseId: choices[i].course.id,
            roomId: choices[i].room.id,
            mode: modes.get(i)?.mode || 'independent',
            targetRoomId: modes.get(i)?.targetRoomId,
          }));
      const plan = Batch.prepare(
        app.store.project,
        app.store.assetFiles,
        incoming.project,
        incoming.files,
        courseId,
        selections,
        $('room-import-art').checked,
      );
      if (plan.overwritten.length) {
        pending = { plan, stamp };
        $('room-import-confirm').hidden = false;
        $('room-import-impact').innerHTML =
          `<p>将覆盖 ${plan.overwritten.length} 个房间：</p><ul>${plan.overwritten.map((r) => `<li>${esc(r.name)}</li>`).join('')}</ul><p>将清理或替换 ${plan.droppedConnections} 条不兼容 / 冲突连线。现有房间 ID 和匹配的出入口会保留；本次导入可整体撤销。</p>`;
        $('room-import-confirm').scrollIntoView({ block: 'nearest' });
      } else commit(plan, stamp);
    } catch (e) {
      feedback(e.message);
    }
  }
  modal(
    '导入房间',
    `<p>${esc(options.label || incoming.project.name)} · 勾选要导入的房间。默认作为独立房间追加；同名可选覆盖。</p><label>目标大关<select id="room-import-course">${app.store.project.courses.map((c) => `<option value="${esc(c.id)}" ${c.id === app.state.courseId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><div class="button-row"><button id="room-import-all">全选</button><button id="room-import-invert">反选</button><span id="room-import-count"></span></div><div id="room-import-choice" class="room-import-choices"></div><label class="check"><input type="checkbox" id="room-import-art" checked>保留房间原美术</label><p class="hint">使用目标项目的移动和冲刺规则。勾选房间之间的接线一并保留，未选房间不会被导入。</p><section id="room-import-confirm" hidden><div id="room-import-impact"></div><button id="room-import-confirm-yes" class="danger">确认覆盖并导入</button><button id="room-import-confirm-no">返回选择</button></section><p id="room-import-feedback" role="status"></p>`,
    [
      { label: '取消' },
      { label: '导入到大关', primary: true, close: false, action: importSelected },
    ],
  );
  const count = () => {
    $('room-import-count').textContent = `已选 ${selected.size} / ${choices.length} 个房间`;
  };
  function renderChoices() {
    const target = app.store.project.courses.find((c) => c.id === $('room-import-course').value);
    $('room-import-choice').innerHTML = choices
      .map((x, i) => {
        const same = target.rooms.filter((r) => r.name === x.room.name),
          mode = modes.get(i) || {
            mode: 'independent',
            targetRoomId: same.length === 1 ? same[0].id : '',
          };
        modes.set(i, mode);
        return `<article class="room-import-option"><label class="check"><input type="checkbox" data-room-import-index="${i}" ${selected.has(i) ? 'checked' : ''}><b>${esc(x.room.name)}</b><small>${esc(x.course.name)} · ${x.room.cols}×${x.room.rows} · ${x.room.objects.length} 个机关 / 道具</small></label><p>${esc(x.room.notes || '无备注')}</p>${same.length ? `<label>同名处理<select data-room-import-mode="${i}"><option value="independent" ${mode.mode === 'independent' ? 'selected' : ''}>独立导入（自动加后缀）</option><option value="overwrite" ${mode.mode === 'overwrite' ? 'selected' : ''}>覆盖同名房间</option></select></label><label>覆盖目标<select data-room-import-target="${i}"><option value="">请选择</option>${same.map((r) => `<option value="${esc(r.id)}" ${mode.targetRoomId === r.id ? 'selected' : ''}>${esc(r.name)} · ${r.cols}×${r.rows} · ${esc(r.id.slice(-8))}</option>`).join('')}</select></label>` : '<small>新名称 · 独立导入</small>'}</article>`;
      })
      .join('');
    for (const el of $('room-import-choice').querySelectorAll('[data-room-import-index]'))
      el.onchange = () => {
        const i = Number(el.dataset.roomImportIndex);
        el.checked ? selected.add(i) : selected.delete(i);
        invalidate();
        count();
      };
    for (const el of $('room-import-choice').querySelectorAll('[data-room-import-mode]'))
      el.onchange = () => {
        modes.get(Number(el.dataset.roomImportMode)).mode = el.value;
        invalidate();
      };
    for (const el of $('room-import-choice').querySelectorAll('[data-room-import-target]'))
      el.onchange = () => {
        modes.get(Number(el.dataset.roomImportTarget)).targetRoomId = el.value;
        invalidate();
      };
    count();
  }
  $('room-import-course').onchange = () => {
    modes.clear();
    invalidate();
    renderChoices();
  };
  $('room-import-art').onchange = invalidate;
  $('room-import-all').onclick = () => {
    choices.forEach((_, i) => selected.add(i));
    invalidate();
    renderChoices();
  };
  $('room-import-invert').onclick = () => {
    choices.forEach((_, i) => (selected.has(i) ? selected.delete(i) : selected.add(i)));
    invalidate();
    renderChoices();
  };
  $('room-import-confirm-no').onclick = invalidate;
  $('room-import-confirm-yes').onclick = () => {
    if (pending) commit(pending.plan, pending.stamp);
  };
  renderChoices();
}
module.exports = { open };
