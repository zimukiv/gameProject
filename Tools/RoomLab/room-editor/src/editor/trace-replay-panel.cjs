'use strict';
const { $, esc } = require('./dom.cjs'),
  Replay = require('../project/trace-replay.cjs'),
  D = require('./draw.cjs'),
  Camera = require('../project/play-camera.cjs');
function mount(app, room, ids, back) {
  const project = app.store.snapshot(),
    course = project.courses.find((c) => c.id === app.course().id),
    world = course.rooms.find((r) => r.id === room.id),
    tracks = (room.playTraces || []).map(Replay.timeline),
    selected = new Set(ids),
    duration = Math.max(0, ...tracks.map((t) => t.duration));
  let time = 0,
    playing = false,
    speed = 1,
    last = performance.now(),
    raf,
    stopped = false;
  $('dialog-title').textContent = '路径回放 · ' + room.name;
  $('dialog-content').innerHTML =
    `<p class="hint">按录制时间回放轨迹角色，可比较多条路径。只回放位置，不重新运行机关或 AI，也不修改关卡。</p><div class="trace-replay-options">${tracks.map((t) => `<label class="check"><input type="checkbox" data-replay-trace="${esc(t.trace.id)}" ${selected.has(t.trace.id) ? 'checked' : ''}><span style="color:${/^#[0-9a-f]{6}$/i.test(t.trace.color) ? t.trace.color : '#70cff4'}">${esc(t.trace.name)}</span><small>${t.duration.toFixed(2)} 秒 · ${esc(new Date(t.trace.createdAt).toLocaleTimeString('zh-CN'))}</small></label>`).join('')}</div><div class="trace-replay-stage"><canvas id="trace-replay-canvas" width="900" height="360"></canvas></div><div class="button-row"><button id="trace-replay-play" ${duration ? '' : 'disabled'}>播放</button><button id="trace-replay-reset">回到起点</button><label>速度<select id="trace-replay-speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><label class="check"><input id="trace-replay-loop" type="checkbox">循环</label><label class="check"><input id="trace-replay-follow" type="checkbox">跟随角色</label><span id="trace-replay-time"></span></div><input id="trace-replay-seek" type="range" min="0" max="${duration}" step="0.01" value="0" aria-label="回放进度">`;
  $('dialog-actions').replaceChildren();
  const backButton = document.createElement('button'),
    close = document.createElement('button');
  backButton.id = 'trace-replay-back';
  backButton.textContent = '返回路径管理';
  close.textContent = '关闭';
  $('dialog-actions').append(backButton, close);
  const canvas = $('trace-replay-canvas'),
    ctx = canvas.getContext('2d');
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    $('dialog').removeEventListener('close', stop);
  }
  backButton.onclick = () => {
    stop();
    back();
  };
  close.onclick = () => $('dialog').close();
  $('dialog').addEventListener('close', stop, { once: true });
  $('trace-replay-play').onclick = () => {
    if (time >= duration) time = 0;
    playing = !playing;
    last = performance.now();
  };
  $('trace-replay-reset').onclick = () => {
    time = 0;
    playing = false;
  };
  $('trace-replay-speed').onchange = () => (speed = Number($('trace-replay-speed').value));
  $('trace-replay-seek').oninput = () => {
    time = Number($('trace-replay-seek').value);
    last = performance.now();
  };
  for (const el of $('dialog-content').querySelectorAll('[data-replay-trace]'))
    el.onchange = () =>
      el.checked ? selected.add(el.dataset.replayTrace) : selected.delete(el.dataset.replayTrace);
  function draw(now) {
    if (stopped || !canvas.isConnected) return;
    const delta = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (playing) {
      time += delta * speed;
      if (time >= duration) {
        if ($('trace-replay-loop').checked && duration) time %= duration;
        else {
          time = duration;
          playing = false;
        }
      }
    }
    const width = Math.max(240, Math.round(canvas.clientWidth)),
      height = Math.max(200, Math.round(canvas.clientHeight));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const active = tracks.filter((t) => selected.has(t.trace.id)),
      markers = active
        .map((t) => ({ track: t, point: Replay.sample(t, time) }))
        .filter((m) => m.point),
      first = markers[0]?.point;
    const view =
      $('trace-replay-follow').checked && first
        ? Camera.view(
            { ...world, playCamera: { ...Camera.resolve(world), mode: 'follow' } },
            { x: first.x - 12, y: first.y - 14, w: 24, h: 28 },
            width,
            height,
          )
        : D.fit(world, width, height);
    D.drawRoom(ctx, project, course, world, {
      view,
      traces: active.map((t) => ({ ...t.trace, visible: true })),
      grid: false,
      assetURL: (id) => app.assetURL(id),
    });
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    for (const { track, point } of markers) {
      ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(track.trace.color) ? track.trace.color : '#70cff4';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(point.x - 12, point.y - 14, 24, 28);
      ctx.globalAlpha = 1;
      D.text(ctx, '@', point.x, point.y + 7, 22, '#07131e', 'center');
    }
    ctx.restore();
    canvas.dataset.replayTime = time.toFixed(3);
    canvas.dataset.markerCount = String(markers.length);
    $('trace-replay-time').textContent = time.toFixed(2) + ' / ' + duration.toFixed(2) + ' 秒';
    $('trace-replay-play').textContent = playing ? '暂停' : '播放';
    $('trace-replay-seek').value = String(time);
    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);
}
module.exports = { mount };
