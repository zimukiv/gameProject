'use strict';
const { $, esc, modal } = require('./dom.cjs');
const Import = require('./room-import-dialog.cjs');
function open(app) {
  if (!window.desktopAPI?.cloud) {
    app.message('云端房间库请使用桌面版。', true);
    return;
  }
  const api = (name, p = {}) => window.desktopAPI.cloud(name, p);
  const roomId =
    app.state.route === 'room'
      ? app.state.roomId
      : app.state.graphSelection?.kind === 'room'
        ? app.state.graphSelection.id
        : null;
  // Resolve the owner course of the selected room, not the sticky active one.
  const owner = (roomId && require('./graph-layout.cjs').locate(app.store.project, roomId)) || null,
    courseId = owner?.course.id || app.state.courseId,
    current = owner?.room;
  if ($('dialog').open) $('dialog').close();
  modal(
    '云端房间库',
    `<div id="room-cloud-library"><div class="button-row"><button id="room-cloud-upload" ${current ? '' : 'disabled'}>上传${current ? '「' + esc(current.name) + '」' : '当前房间'}</button><button id="room-cloud-refresh">刷新</button><button id="room-cloud-fit" title="Ctrl + 滚轮调整缩略图大小">重置预览</button><button id="room-cloud-more" hidden>加载更多</button></div><p id="room-cloud-status" role="status">正在读取云端房间…</p><div class="cloud-graph-layout"><div id="room-cloud-graph" class="room-cloud-graph" aria-label="云端房间缩略预览"></div><aside id="room-cloud-details" class="room-cloud-details">点选房间预览和导入。</aside></div></div>`,
    [{ label: '关闭' }],
  );
  const root = $('room-cloud-library'),
    graph = $('room-cloud-graph'),
    details = $('room-cloud-details'),
    urls = [];
  const alive = () => root.isConnected && $('dialog').open;
  let rooms = [],
    cursor = null,
    selected = null,
    busy = false,
    readToken = 0;
  const cards = require('./cloud-room-cards.cjs').create({
    graph,
    api,
    alive,
    choose: (id) => inspect(id),
  });
  const status = (s, error = false) => {
    if (alive()) {
      const e = $('room-cloud-status');
      e.textContent = s;
      e.classList.toggle('error', error);
    }
  };
  const releaseURLs = () => {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  };
  $('dialog').addEventListener(
    'close',
    () => {
      releaseURLs();
      cards.dispose();
    },
    { once: true },
  );
  function draw() {
    cards.render(rooms, selected);
  }
  function fit() {
    cards.reset(rooms, selected);
  }
  async function inspect(id) {
    selected = id;
    draw();
    const token = ++readToken,
      info = rooms.find((r) => r.id === id);
    details.textContent = '正在读取房间及素材…';
    try {
      const data = await api('roomLibraryRead', { id });
      if (!alive() || token !== readToken) return;
      releaseURLs();
      const course = data.project.courses[0],
        room = course.rooms[0],
        files = new Map(data.files),
        assetURLs = new Map();
      cards.remember(id, data.project);
      for (const asset of data.project.assets) {
        const bytes = files.get(asset.path);
        if (bytes) {
          const u = URL.createObjectURL(new Blob([bytes], { type: asset.mime || 'image/png' }));
          urls.push(u);
          assetURLs.set(asset.id, u);
        }
      }
      details.innerHTML = `<h3>${esc(room.name)}</h3><p>${esc(course.name)} · ${room.cols} × ${room.rows} 格</p><canvas id="room-cloud-preview" width="640" height="360" aria-label="房间内容预览"></canvas><p class="room-cloud-notes">${esc(room.notes || '无备注')}</p><p class="hint">${esc(new Date(info.uploadedAt).toLocaleString())} · ${room.objects.length} 个功能块 · ${room.movables.length} 个机关砖<br>${room.entries.length} 个入口 / ${room.exits.length} 个出口<br>跨房连线需导入后重新连接。</p><button id="room-cloud-import" class="primary apply">导入这个房间</button>`;
      const canvas = $('room-cloud-preview');
      require('./draw.cjs').drawRoom(canvas.getContext('2d'), data.project, course, room, {
        targets: false,
        assetURL: (id) => assetURLs.get(id),
      });
      $('room-cloud-import').onclick = () => Import.open(app, { ...data, files });
      await Promise.all(
        [...assetURLs.values()].map(async (url) => {
          const image = new Image();
          image.src = url;
          try {
            await image.decode();
          } catch {}
        }),
      );
      requestAnimationFrame(() => {
        if (alive() && token === readToken && canvas.isConnected)
          require('./draw.cjs').drawRoom(canvas.getContext('2d'), data.project, course, room, {
            targets: false,
            assetURL: (id) => assetURLs.get(id),
          });
      });
    } catch (e) {
      if (alive() && token === readToken) details.textContent = '读取失败：' + e.message;
    }
  }
  async function refresh(more = false) {
    if (busy) return;
    busy = true;
    $('room-cloud-refresh').disabled = true;
    try {
      const result = await api('roomLibraryList', more ? { cursor } : {});
      if (!alive()) return;
      rooms = more
        ? [...rooms, ...result.rooms.filter((r) => !rooms.some((v) => v.id === r.id))]
        : result.rooms;
      cursor = result.cursor;
      $('room-cloud-more').hidden = !cursor;
      status(
        rooms.length
          ? `${rooms.length} 个独立房间节点。滚轮缩放，拖动空白平移。`
          : '暂无云端房间。进入房间后打开此窗口即可上传。',
      );
      fit();
    } catch (e) {
      status('读取失败：' + e.message, true);
    } finally {
      busy = false;
      if (alive()) $('room-cloud-refresh').disabled = false;
    }
  }
  async function upload(confirmed = false) {
    if (busy || !current) return;
    if (!confirmed && rooms.some((r) => r.name === current.name)) {
      status('云端已有同名房间。再次点击上传将另存为独立节点，原房间不覆盖。');
      $('room-cloud-upload').textContent = '确认另存为独立房间';
      $('room-cloud-upload').onclick = () => upload(true);
      return;
    }
    busy = true;
    $('room-cloud-upload').disabled = true;
    status('正在上传房间与引用素材…');
    try {
      const capture = app.cloud.capture();
      const result = await api('roomLibraryUpload', { ...capture, courseId, roomId });
      if (!alive()) return;
      rooms = [result.room, ...rooms.filter((r) => r.id !== result.room.id)];
      status('房间上传成功，当前编辑位置与云端分支保持不变。');
      fit();
      await inspect(result.room.id);
    } catch (e) {
      status('上传失败：' + e.message, true);
    } finally {
      busy = false;
      if (alive()) {
        $('room-cloud-upload').disabled = false;
        $('room-cloud-upload').textContent = '上传「' + current.name + '」';
        $('room-cloud-upload').onclick = () => upload();
      }
    }
  }
  $('room-cloud-upload').onclick = () => upload();
  $('room-cloud-refresh').onclick = () => refresh();
  $('room-cloud-more').onclick = () => refresh(true);
  $('room-cloud-fit').onclick = fit;

  refresh();
}
module.exports = { open };
