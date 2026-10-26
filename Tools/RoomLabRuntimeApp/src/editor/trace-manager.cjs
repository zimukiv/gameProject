'use strict';
const Traces = require('../project/play-traces.cjs'),
  { esc, $, modal, download } = require('./dom.cjs');
function open(app, roomId) {
  const course = app.course(),
    room = course.rooms.find((r) => r.id === roomId) || app.room(),
    game = app.game,
    wasPlaying = game?.mode === 'playing';
  if (wasPlaying) {
    game.togglePause();
    app.clearInputs();
  }
  modal('试玩路径 · ' + room.name, '', [{ label: '关闭', action: () => {} }]);
  $('dialog-actions').firstChild.id = 'trace-close';
  $('dialog').addEventListener(
    'close',
    () => {
      if (wasPlaying && !$('dialog').open && app.game === game && game.mode === 'paused') {
        game.togglePause();
        app.clearInputs();
      }
    },
    { once: true },
  );
  const saveable = () =>
    app.traceRecorder?.projectId === app.store.project.id &&
    app.traceRecorder.courseId === course.id &&
    [...app.traceRecorder.rooms.values()].some((p) => p.length > 1);
  const change = (fn) => {
    try {
      app.store.change(fn);
      render();
    } catch (e) {
      app.message(e.message, true);
    }
  };
  function importText(text) {
    try {
      const imported = Traces.parse(text, room);
      if ((room.playTraces?.length || 0) + imported.length > Traces.MAX_TRACES)
        throw new Error('每房最多保存 32 条路径，请先移除部分路径');
      change(() => {
        room.playTraces = [...(room.playTraces || []), ...imported];
      });
    } catch (e) {
      app.message('读取路径失败：' + e.message, true);
    }
  }
  function render() {
    const paths = room.playTraces || [],
      lives = Traces.pendingLives(app.traceRecorder);
    $('dialog-content').innerHTML =
      `<p class="hint">勾选可同时叠加多条路径。路径会随项目保存；每次保存只记录尚未保存的本次片段；重试分段单独记录，已保存内容不会重复加入。</p><div class="trace-save-row"><span>按生命编号保存</span><button id="trace-save" class="primary" ${saveable() ? '' : 'disabled'}>保存勾选的生命</button></div><div class="trace-life-choices">${lives.map((l) => `<label class="check"><input type="checkbox" data-save-life="${l.number}" checked><b>${l.number}</b><span>${l.points} 点 · ${l.rooms} 个房间</span></label>`).join('')}</div><div class="trace-toolbar"><button id="trace-show-all">全选显示</button><button id="trace-hide-all">全部隐藏</button><button id="trace-export">导出路径</button><button id="trace-import">读取路径</button><input id="trace-import-file" type="file" accept=".json" hidden></div><div class="trace-list">${paths.map((p) => `<div class="trace-row"><label class="check"><input type="checkbox" data-trace-toggle="${esc(p.id)}" ${p.visible !== false ? 'checked' : ''}><i style="background:${/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#70cff4'}"></i><span>${esc(p.name)}</span></label><small>${esc(new Date(p.createdAt).toLocaleTimeString('zh-CN', { hour12: false }))} · ${p.points.length} 点</small><button data-trace-delete="${esc(p.id)}" class="danger">移除</button></div>`).join('') || '<p class="hint">暂无保存路径。先试玩走一段，再保存或读取路径文件。</p>'}</div>`;
    $('trace-save').onclick = () => {
      const chosen = [...document.querySelectorAll('[data-save-life]:checked')].map((n) =>
        Number(n.dataset.saveLife),
      );
      change(() => Traces.saveRecording(course, app.traceRecorder, '', chosen));
    };
    $('trace-show-all').onclick = () => change(() => paths.forEach((p) => (p.visible = true)));
    $('trace-hide-all').onclick = () => change(() => paths.forEach((p) => (p.visible = false)));
    $('dialog-content')
      .querySelectorAll('[data-trace-toggle]')
      .forEach(
        (input) =>
          (input.onchange = () =>
            change(() => {
              paths.find((p) => p.id === input.dataset.traceToggle).visible = input.checked;
            })),
      );
    $('dialog-content')
      .querySelectorAll('[data-trace-delete]')
      .forEach(
        (b) =>
          (b.onclick = () =>
            change(() => {
              room.playTraces = paths.filter((p) => p.id !== b.dataset.traceDelete);
            })),
      );
    $('trace-export').onclick = async () => {
      const text = Traces.serialize(room);
      if (window.desktopAPI?.exportTraces) {
        try {
          await window.desktopAPI.exportTraces({ name: room.name, text });
        } catch (e) {
          app.message(e.message, true);
        }
      } else download(room.name + '-路径.json', text);
    };
    $('trace-import').onclick = async () => {
      if (window.desktopAPI?.importTraces) {
        try {
          const result = await window.desktopAPI.importTraces();
          if (result) importText(result.text);
        } catch (e) {
          app.message(e.message, true);
        }
      } else $('trace-import-file').click();
    };
    $('trace-import-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (file) importText(await file.text());
    };
  }
  render();
}
module.exports = { open };
