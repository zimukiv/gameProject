'use strict';
const { clamp } = require('../shared/utils.cjs');
const DEFAULT = { mode: 'follow', cols: 30, rows: 17 },
  TILE = 32;
function resolve(room) {
  return {
    mode: room.playCamera?.mode || 'room',
    cols: room.playCamera?.cols ?? 30,
    rows: room.playCamera?.rows ?? 17,
  };
}
function errors(value) {
  if (value === undefined) return [];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !['room', 'follow'].includes(value.mode)
  )
    return ['试玩视角模式无效'];
  return ['cols', 'rows'].some(
    (k) => value[k] !== undefined && (!Number.isFinite(value[k]) || value[k] < 1 || value[k] > 256),
  )
    ? ['试玩视野宽高需为 1–256 格的有效数字']
    : [];
}
function view(room, player, width, height, padding = 22) {
  const config = resolve(room),
    worldW = room.cols * TILE,
    worldH = room.rows * TILE,
    w = Math.max(1, width - padding * 2),
    h = Math.max(1, height - padding * 2);
  const cols = config.mode === 'room' ? room.cols : Math.min(room.cols, config.cols),
    rows = config.mode === 'room' ? room.rows : Math.min(room.rows, config.rows),
    scale = Math.min(w / (cols * TILE), h / (rows * TILE));
  const visibleW = w / scale,
    visibleH = h / scale;
  const left =
    worldW <= visibleW
      ? (worldW - visibleW) / 2
      : clamp((player?.x || 0) + (player?.w || 0) / 2 - visibleW / 2, 0, worldW - visibleW);
  const top =
    worldH <= visibleH
      ? (worldH - visibleH) / 2
      : clamp((player?.y || 0) + (player?.h || 0) / 2 - visibleH / 2, 0, worldH - visibleH);
  return {
    scale,
    x: padding - left * scale,
    y: padding - top * scale,
    cols: Math.min(room.cols, visibleW / TILE),
    rows: Math.min(room.rows, visibleH / TILE),
    mode: config.mode,
  };
}
module.exports = { DEFAULT, resolve, errors, view };
