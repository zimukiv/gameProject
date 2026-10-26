'use strict';
const { $, field, select } = require('./dom.cjs'),
  Camera = require('../project/play-camera.cjs');
function render(room) {
  const c = Camera.resolve(room);
  return `<details class="room-camera-settings" open><summary>试玩视角</summary>${select(
    '显示方式',
    'room-camera-mode',
    c.mode,
    [
      ['room', '完整房间'],
      ['follow', '自适应跟随'],
    ],
  )}<div class="row">${field('默认视野宽（格）', 'room-camera-cols', c.cols, { type: 'number', min: 1, max: 256, step: 0.5 })}${field('默认视野高（格）', 'room-camera-rows', c.rows, { type: 'number', min: 1, max: 256, step: 0.5 })}</div><p class="hint">跟随模式按设定范围显示并跟随玩家，窗口变动时自动适配，多出的方向可看到更多内容；小房间完整显示。此设置只影响试玩。</p></details>`;
}
function bind() {
  const update = () => {
    for (const id of ['room-camera-cols', 'room-camera-rows'])
      $(id).disabled = $('room-camera-mode').value === 'room';
  };
  $('room-camera-mode').onchange = update;
  update();
}
function read() {
  const result = {
      mode: $('room-camera-mode').value,
      cols: Number($('room-camera-cols').value),
      rows: Number($('room-camera-rows').value),
    },
    errors = Camera.errors(result);
  if (errors.length) throw new Error(errors[0]);
  return result;
}
module.exports = { render, bind, read };
