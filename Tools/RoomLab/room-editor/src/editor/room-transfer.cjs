'use strict';
const { $ } = require('./dom.cjs'),
  Archive = require('../project/archive.cjs'),
  Dialog = require('./room-import-dialog.cjs'),
  GroupDialog = require('./group-import-dialog.cjs'),
  MAX_PACKAGE = 128 * 1024 * 1024;
function unpackBytes(bytes) {
  if (bytes.byteLength > MAX_PACKAGE) throw new Error('房间包不能超过 128 MiB');
  return Archive.unpack(bytes);
}
async function readBrowserFile(file) {
  if (file.size > MAX_PACKAGE) throw new Error('房间包不能超过 128 MiB');
  return unpackBytes(new Uint8Array(await file.arrayBuffer()));
}
// Group packages share the project ZIP/asset packaging; only the manifest and
// the multi-room importer differ from the single-room entry points.
async function openGroup(app, incoming, options = {}) {
  GroupDialog.open(app, incoming, options);
}
async function pickGroup(app) {
  try {
    if (window.desktopAPI?.importArchive) {
      const picked = await window.desktopAPI.importArchive({ title: '导入房间分组包' });
      if (!picked) return;
      await openGroup(app, unpackBytes(new Uint8Array(picked.bytes)), { label: picked.name });
    } else $('group-package-file').click();
  } catch (error) {
    app.message('导入分组失败：' + error.message, true);
  }
}
function bind(app) {
  if ($('cloud-room-library'))
    $('cloud-room-library').onclick = () => require('./cloud-room-library.cjs').open(app);
  // Kept working for older pages/tests that still expose the single-room entry;
  // the project menu now exposes 导入分组 instead.
  if ($('import-room'))
    $('import-room').onclick = () => $('room-package-file')?.click();
  if ($('room-package-file'))
    $('room-package-file').onchange = async (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        Dialog.open(app, await readBrowserFile(file));
      } catch (error) {
        app.message('导入房间失败：' + error.message, true);
      }
    };
  if ($('import-group')) $('import-group').onclick = () => pickGroup(app);
  if ($('group-package-file'))
    $('group-package-file').onchange = async (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        await openGroup(app, await readBrowserFile(file), { label: file.name });
      } catch (error) {
        app.message('导入分组失败：' + error.message, true);
      }
    };
}
module.exports = { bind, open: Dialog.open, openGroup, pickGroup, unpackBytes };
