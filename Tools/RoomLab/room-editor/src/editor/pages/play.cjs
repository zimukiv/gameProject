'use strict';
const Draw = require('../draw.cjs'),
  { esc, $, modal } = require('../dom.cjs');
const TraceManager = require('../trace-manager.cjs');
const Camera = require('../../project/play-camera.cjs');
function render(app) {
  const g = app.game,
    s = app.state,
    hidden = s.playInspectorHidden !== false;
  $('app').innerHTML =
    `<div class="play-shell"><div class="room-title"><div><h1 id="play-title">${esc(g.room.name)}</h1><span id="play-room-size" class="room-size-tag">${g.room.cols} × ${g.room.rows} 格</span></div><div class="actions"><button id="play-traces">保存 / 显示路径</button><button id="play-help">⌨ 按键说明</button><button id="play-inspector">${hidden ? '显示状态' : '收起状态'}</button><button id="play-pause">暂停 / 继续</button><button id="play-retry">重试本房</button><button id="play-edit" class="primary">回到编辑</button></div></div><div class="room-workspace ${hidden ? 'inspector-hidden' : ''}"><section class="panel canvas-panel play-canvas-panel"><div class="play-hud"><span>token <b id="play-tokens"></b></span><span>免费首冲 <b id="play-free"></b></span><span>付费库存 <b id="play-paid"></b></span><span>周期 <b id="play-count"></b>/3</span><span>积分 <b id="play-score"></b></span><span>重试 <b id="play-deaths"></b></span><span>存档 <b id="play-checkpoint"></b></span></div><div class="canvas-wrap"><canvas id="play-canvas" width="1000" height="560" tabindex="0" aria-label="试玩画布"></canvas><div id="play-overlay" class="play-overlay" hidden><div><h2 id="play-overlay-title"></h2><p id="play-overlay-text"></p><button id="play-resume" class="primary">继续试玩</button><button id="overlay-retry">重试本房</button><button id="overlay-edit">回到编辑</button></div></div></div><div class="canvas-footer" id="play-note"></div></section><aside class="panel inspector form"><h2>试玩状态</h2><p id="play-ai" class="hint"></p><div id="play-environment" class="hint"></div><h3>AI 距离条件测试</h3><select id="test-object">${g.room.objects
      .filter((o) => o.trigger?.requiresAI)
      .map((o) => `<option value="${esc(o.id)}">${esc(o.name || o.id)}</option>`)
      .join(
        '',
      )}</select><div class="actions" style="margin-top:10px"><button id="ai-near">AI 到机关附近</button><button id="ai-far">AI 远离机关</button></div><p class="hint">距离测试只影响本次试玩。</p></aside></div></div>`;
  $('play-inspector').onclick = () => {
    s.playInspectorHidden = !hidden;
    app.render();
  };
  $('play-traces').onclick = () => TraceManager.open(app, g.room.id);
  $('play-help').onclick = () =>
    modal(
      '试玩按键说明',
      '<table class="table"><tr><td>A/D 或 ←/→</td><td>左右移动</td></tr><tr><td>空格 / W / ↑</td><td>跳跃</td></tr><tr><td>S / ↓</td><td>蹲下 / 向下冲刺方向</td></tr><tr><td>方向 + Shift</td><td>冲刺</td></tr><tr><td>R / Esc</td><td>重试本房 / 暂停继续</td></tr></table><p>实心 AI 板踩上触发；空心 AI 板经过触发。经过存档点后会更新复活位置，重试时从最近存档点继续。每次实际落地刷新一次免费首冲，计入三次上限。</p>',
      [{ label: '知道了' }],
    );
  const canvas = $('play-canvas'),
    ctx = canvas.getContext('2d');
  const cameraInfo = document.createElement('span');
  cameraInfo.id = 'play-camera-info';
  cameraInfo.className = 'room-size-tag';
  $('play-room-size').after(cameraInfo);
  app.currentDraw = () => {
    $('app').style.height =
      Math.max(500, window.innerHeight - ($('app').getBoundingClientRect().top + window.scrollY)) +
      'px';
    const w = Math.max(200, Math.round(canvas.clientWidth)),
      h = Math.max(200, Math.round(canvas.clientHeight));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const playView = Camera.view(g.room, g.player, w, h);
    s.playView = playView;
    cameraInfo.textContent =
      playView.mode === 'room'
        ? '完整房间'
        : '跟随视野 · ' + playView.cols.toFixed(1) + ' × ' + playView.rows.toFixed(1) + ' 格';
    Draw.drawRoom(ctx, g.project, g.course, g.room, {
      view: playView,
      game: g,
      traces: app.course().rooms.find((r) => r.id === g.room.id)?.playTraces || [],
      targets: true,
      assetURL: (id) => app.assetURL(id),
    });
    refresh(app);
  };
  $('play-pause').onclick = () => {
    g.togglePause();
    app.clearInputs();
    canvas.focus({ preventScroll: true });
  };
  $('play-resume').onclick = () => {
    g.togglePause();
    app.clearInputs();
    canvas.focus({ preventScroll: true });
  };
  const retry = () => {
    g.retry();
    app.clearInputs();
    canvas.focus({ preventScroll: true });
  };
  $('play-retry').onclick = retry;
  $('overlay-retry').onclick = retry;
  const edit = () => app.stopPlay();
  $('play-edit').onclick = edit;
  $('overlay-edit').onclick = edit;
  $('ai-near').onclick = () => g.simulateAI($('test-object').value, true);
  $('ai-far').onclick = () => g.simulateAI($('test-object').value, false);
  canvas.onpointerdown = () => canvas.focus({ preventScroll: true });
  canvas.focus({ preventScroll: true });
  refresh(app);
}
function refresh(app) {
  const g = app.game;
  $('play-title').textContent = g.room.name;
  $('play-room-size').textContent = g.room.cols + ' × ' + g.room.rows + ' 格';
  $('play-tokens').textContent = g.tokens;
  $('play-free').textContent = g.player.freeDash ? '●' : '○';
  $('play-paid').textContent = '●'.repeat(g.charges) + '○'.repeat(3 - g.charges);
  $('play-count').textContent = g.player.dashCount;
  $('play-score').textContent = g.score;
  $('play-deaths').textContent = g.deaths;
  $('play-checkpoint').textContent = g.checkpoint?.spawn?.objectId ? '存档点' : '房间入口';
  $('play-note').textContent =
    g.messageTime > 0 ? g.message : '踩板触发；出口按照接线板切换。免费首冲计入三次上限。';
  $('play-ai').textContent =
    'AI ID：' + g.ai.id + ' / ' + (g.ai.active ? '已启动（跨房继承）' : '未启动');
  $('play-environment').textContent =
    '温度：' +
    [...g.zoneStates].map(([key, value]) => key + '=' + value).join('；') +
    ' / 房间 ' +
    g.roomEnvironment;
  $('play-overlay').hidden = g.mode === 'playing';
  $('play-resume').hidden = g.mode !== 'paused';
  $('play-overlay-title').textContent = g.mode === 'won' ? '第一大关已提交' : '已暂停';
  $('play-overlay-text').textContent =
    g.mode === 'won'
      ? '积分 ' + g.score + ' · 重试 ' + g.deaths + ' · 被偷 ' + g.steals + ' 次。'
      : 'Esc 继续，R 恢复最近存档点。';
}
module.exports = { render };
