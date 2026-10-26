'use strict';
const { $, esc, modal } = require('./dom.cjs'),
  Archive = require('../project/archive.cjs'),
  Importer = require('../project/room-import.cjs'),
  Assets = require('../assets/manager.cjs');
function bind(app) {
  $('import-room').onclick = () => $('room-package-file').click();
  $('room-package-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error('房间包不能超过 128 MiB');
      const incoming = Archive.unpack(new Uint8Array(await file.arrayBuffer())),
        choices = incoming.project.courses.flatMap((course) =>
          course.rooms.map((room) => ({ course, room })),
        );
      if ($('dialog').open) $('dialog').close();
      modal(
        '导入房间',
        `<p>从房间包或完整项目包选择一个房间，追加到目标大关。</p><label>目标大关<select id="room-import-course">${app.store.project.courses.map((c) => `<option value="${esc(c.id)}" ${c.id === app.state.courseId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label>选择房间<select id="room-import-choice">${choices.map((x, i) => `<option value="${i}">${esc(x.course.name + ' / ' + x.room.name)} · ${x.room.cols}×${x.room.rows}</option>`).join('')}</select></label><div id="room-import-preview"></div><label class="check"><input type="checkbox" id="room-import-art" checked>保留房间原美术</label><p>重名会自动加「导入」后缀。追加房间使用目标项目的移动、冲刺规则，保留原机关参数和房间内关联；跨房接线需重新连接。</p><p id="room-import-feedback" role="status"></p>`,
        [
          { label: '取消' },
          {
            label: '导入到大关',
            primary: true,
            close: false,
            action: async () => {
              const buttons = [...$('dialog-actions').querySelectorAll('button')];
              buttons.forEach((b) => (b.disabled = true));
              try {
                const choice = choices[Number($('room-import-choice').value)],
                  courseId = $('room-import-course').value;
                const prepared = Importer.prepare(
                  app.store.project,
                  app.store.assetFiles,
                  incoming.project,
                  incoming.files,
                  courseId,
                  choice.course.id,
                  choice.room.id,
                  $('room-import-art').checked,
                );
                for (const [path, bytes] of prepared.files)
                  if (!app.store.assetFiles.has(path)) await Assets.putBlob(path, bytes);
                const before = app.store.snapshot();
                app.store.project = prepared.project;
                app.store.assetFiles = prepared.files;
                app.store.commit(before);
                $('dialog').close();
                app.go('room', { courseId, roomId: prepared.roomId });
                app.message(
                  '房间已追加：' +
                    prepared.roomName +
                    '；新增 ' +
                    prepared.addedAssets +
                    ' 个素材。可撤销。',
                );
              } catch (error) {
                $('room-import-feedback').textContent = error.message;
                buttons.forEach((b) => (b.disabled = false));
              }
            },
          },
        ],
      );
      const preview = () => {
        const x = choices[Number($('room-import-choice').value)];
        $('room-import-preview').innerHTML =
          `<h3>${esc(x.room.name)}</h3><p>${esc(x.room.notes || '无备注')}</p><p>${x.room.objects.length} 个机关 / 道具 · ${x.room.entries.length} 个入口 · ${x.room.exits.length} 个出口</p>`;
      };
      $('room-import-choice').onchange = preview;
      preview();
    } catch (error) {
      app.message('导入房间失败：' + error.message, true);
    }
  };
}
module.exports = { bind };
