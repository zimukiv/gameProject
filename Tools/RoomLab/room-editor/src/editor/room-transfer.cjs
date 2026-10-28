'use strict';
const { $ } = require('./dom.cjs'),
  Archive = require('../project/archive.cjs'),
  Dialog = require('./room-import-dialog.cjs');
function bind(app) {
  $('import-room').onclick = () => $('room-package-file').click();
  $('room-package-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error('房间包不能超过 128 MiB');
      Dialog.open(app, Archive.unpack(new Uint8Array(await file.arrayBuffer())));
    } catch (error) {
      app.message('导入房间失败：' + error.message, true);
    }
  };
}
module.exports = { bind, open: Dialog.open };
