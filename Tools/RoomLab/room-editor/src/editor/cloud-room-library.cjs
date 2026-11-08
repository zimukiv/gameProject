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
      : app.state.route === 'course' && app.state.graphSelection?.kind === 'room'
        ? app.state.graphSelection.id
        : null;
  const courseId = app.state.courseId,
    current = app.store.project.courses
      .find((c) => c.id === courseId)
      ?.rooms.find((r) => r.id === roomId);
  if ($('dialog').open) $('dialog').close();
  modal(
    '云端房间库',
    `<div id="room-cloud-library"><p class="hint">同一连接密钥共享房间。节点互相独立，不创建工作树或改变当前云端分支。</p><div class="button-row"><button id="room-cloud-upload" ${current ? '' : 'disabled'}>上传${current ? '「' + esc(current.name) + '」' : '当前房间'}</button><button id="room-cloud-refresh">刷新</button><button id="room-cloud-fit">适应全部</button><button id="room-cloud-more" hidden>加载更多</button></div><p id="room-cloud-status" role="status">正在读取云端房间…</p><div class="cloud-graph-layout"><div id="room-cloud-graph" class="room-cloud-graph" aria-label="独立房间节点图"></div><aside id="room-cloud-details" class="room-cloud-details">选中房间节点查看详情和导入。</aside></div></div>`,
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
    readToken = 0,
    view = { x: 16, y: 16, scale: 1 },
    drag = null;
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
  $('dialog').addEventListener('close', releaseURLs, { once: true });
  function draw() {
    graph.innerHTML = `<svg width="100%" height="100%" role="img" aria-label="云端房间，无父子关系"><g transform="translate(${view.x},${view.y}) scale(${view.scale})">${rooms.map((r, i) => `<g data-library-room="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(r.name)}" transform="translate(${(i % 3) * 246},${Math.floor(i / 3) * 126})"><rect width="226" height="106" rx="9" fill="${r.id === selected ? '#1c474d' : '#182c3b'}" stroke="${r.id === selected ? '#80eee0' : '#476a80'}" stroke-width="${r.id === selected ? 3 : 1}"/><text x="14" y="29" fill="#e7f2fc" font-size="15">${esc(r.name.slice(0, 14))}</text><text x="14" y="54" fill="#8bd4dd" font-size="12">${esc({ physics: '物理', calculus: '高数', slacker: '水课' }[r.kind] || r.kind)} · ${r.cols} × ${r.rows} 格</text><text x="14" y="80" fill="#9bb5c7" font-size="11">${esc(new Date(r.uploadedAt).toLocaleString())}</text></g>`).join('')}</g></svg>`;
    graph.querySelectorAll('[data-library-room]').forEach((el) => {
      const choose = () => inspect(el.dataset.libraryRoom);
      el.onclick = choose;
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      };
    });
  }
  function fit() {
    const width = Math.min(3, Math.max(rooms.length, 1)) * 246,
      height = Math.max(1, Math.ceil(rooms.length / 3)) * 126;
    view = {
      x: 16,
      y: 16,
      scale: Math.max(
        0.08,
        Math.min(1, (graph.clientWidth - 32) / width, (graph.clientHeight - 32) / height),
      ),
    };
    draw();
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
      $('room-cloud-import').onclick = () => Import.open(app, data);
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
  graph.onwheel = (e) => {
    e.preventDefault();
    const b = graph.getBoundingClientRect(),
      x = e.clientX - b.left,
      y = e.clientY - b.top,
      s = Math.max(0.08, Math.min(3, view.scale * Math.exp(-e.deltaY * 0.0015)));
    view = {
      x: x - ((x - view.x) * s) / view.scale,
      y: y - ((y - view.y) * s) / view.scale,
      scale: s,
    };
    draw();
  };
  graph.onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest('[data-library-room]')) return;
    drag = { x: e.clientX, y: e.clientY, view: { ...view } };
    graph.setPointerCapture(e.pointerId);
  };
  graph.onpointermove = (e) => {
    if (drag) {
      view = {
        ...drag.view,
        x: drag.view.x + e.clientX - drag.x,
        y: drag.view.y + e.clientY - drag.y,
      };
      draw();
    }
  };
  graph.onpointerup = graph.onpointercancel = () => {
    drag = null;
  };
  refresh();
}
module.exports = { open };
