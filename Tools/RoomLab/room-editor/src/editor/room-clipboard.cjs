'use strict';
const Export = require('../project/room-export.cjs'),
  Batch = require('../project/room-import-batch.cjs'),
  Assets = require('../assets/manager.cjs'),
  Native = require('../project/native-compat.cjs'),
  { $, modal, esc } = require('./dom.cjs');

function source(app) {
  const roomId =
    app.state.route === 'room'
      ? app.state.roomId
      : app.state.graphSelection?.kind === 'room'
        ? app.state.graphSelection.id
        : null;
  // The selected room resolves to its owner course, so copying from the global
  // route map or library never picks up a room from the wrong course.
  return (roomId && require('./graph-layout.cjs').locate(app.store.project, roomId)) || null;
}

function canPaste(app) {
  return !!app.roomClipboard && ['course', 'room', 'home'].includes(app.state.route);
}

function sync(app) {
  const selected = source(app),
    clipboard = app.roomClipboard;
  for (const button of document.querySelectorAll('[data-room-clipboard-copy]')) {
    button.disabled = !selected;
    button.title = selected
      ? '复制整房「' + selected.room.name + '」（Ctrl+C）'
      : '编辑房间或在接线板选择一个房间后复制';
    button.onclick = () => copySelection(app);
  }
  for (const button of document.querySelectorAll('[data-room-clipboard-paste]')) {
    button.disabled = !canPaste(app);
    button.title = clipboard
      ? '粘贴整房「' + clipboard.roomName + '」到当前大关（Ctrl+V）'
      : '请先复制一个房间';
    button.onclick = () => paste(app);
  }
}

function copy(app, courseId, roomId) {
  try {
    const course = app.store.project.courses.find((item) => item.id === courseId),
      room = course?.rooms.find((item) => item.id === roomId);
    if (!course || !room) throw new Error('没有可复制的房间');
    const project = Export.standalone(app.store.project, courseId, roomId),
      files = new Map();
    for (const asset of project.assets) {
      const bytes = app.store.assetFiles.get(asset.path);
      if (!bytes) throw new Error('房间素材文件缺失：' + asset.name);
      files.set(asset.path, bytes.slice());
    }
    app.roomClipboard = {
      project,
      files,
      courseId,
      roomId,
      roomName: room.name,
      courseName: course.name,
    };
    sync(app);
    app.message('已复制整房「' + room.name + '」。可切换大关后粘贴，外部接线需重新连接。');
  } catch (error) {
    app.message('复制整房失败：' + error.message, true);
  }
}

function copySelection(app) {
  const item = source(app);
  if (!item) return false;
  copy(app, item.course.id, item.room.id);
  return true;
}

async function commit(app, plan, targetCourseId) {
  const before = app.store.snapshot();
  for (const [path, bytes] of plan.files)
    if (!app.store.assetFiles.has(path)) await Assets.putBlob(path, bytes);
  app.store.project = plan.project;
  app.store.assetFiles = plan.files;
  app.store.commit(before);
  const target = app.store.project.courses.find((course) => course.id === targetCourseId),
    room = plan.rooms[0];
  app.go('home', {
    courseId: targetCourseId,
    roomId: room.id,
    planningTab: 'map',
    graphSelection: { kind: 'room', id: room.id },
  });
  app.message(
    '已粘贴整房「' +
      room.name +
      '」到「' +
      target.name +
      '」，新增 ' +
      plan.addedAssets +
      ' 个素材。外部接线需重新连接，操作可撤销。',
  );
}

async function pasteNow(app, targetCourseId, adoptNative) {
  const clipboard = app.roomClipboard;
  if (!clipboard) return;
  try {
    const plan = Batch.prepare(
      app.store.project,
      app.store.assetFiles,
      clipboard.project,
      clipboard.files,
      targetCourseId,
      [{ courseId: clipboard.courseId, roomId: clipboard.roomId, mode: 'independent' }],
      true,
      { signalMode: 'independent', adoptNative },
    );
    await commit(app, plan, targetCourseId);
  } catch (error) {
    app.message('粘贴整房失败：' + error.message, true);
  }
}

function paste(app) {
  if (!canPaste(app)) {
    app.message(app.roomClipboard ? '请先进入目标大关。' : '请先复制一个房间。', true);
    return;
  }
  const clipboard = app.roomClipboard,
    targetCourseId = app.state.courseId;
  if (Native.enabled(clipboard.project) && !Native.enabled(app.store.project)) {
    modal(
      '粘贴整房 · 测试版规则',
      '<p>房间「' +
        esc(clipboard.roomName) +
        '」依赖测试版关卡规则。粘贴后会把来源测试版规则应用到当前整个项目，旧房间的运行方式也可能改变。</p><p>原项目可撤销，外部接线仍需重新连接。</p>',
      [
        { label: '取消' },
        {
          label: '启用规则并粘贴',
          primary: true,
          action: () => pasteNow(app, targetCourseId, true),
        },
      ],
    );
    return;
  }
  pasteNow(app, targetCourseId, false);
}

module.exports = { canPaste, copy, copySelection, paste, sync };
