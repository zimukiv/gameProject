'use strict';
const { clamp } = require('../shared/utils.cjs');
const modes = [
  ['linear', '匀速直线'],
  ['smooth', '缓入缓出'],
  ['easeIn', '加速'],
  ['easeOut', '减速'],
];
const maxNodes = 32;
const isPad = (o) => ['calculus.integral', 'calculus.derivative'].includes(o?.type);
const colorFor = (room, id) => {
  const index = room.objects.filter(isPad).findIndex((pad) => pad.id === id);
  return index < 0 ? '#aab8c5' : `hsl(${(168 + index * 137.508) % 360} 82% 69%)`;
};
const legacyNode = (brick) => ({
  x: brick.targetX,
  y: brick.targetY,
  seconds: 0.45,
  mode: 'linear',
});
const nodes = (brick) => brick.motionPath ?? [legacyNode(brick)];
const duration = (path) => path.reduce((total, node) => total + node.seconds, 0);
const inRoom = (node, cols, rows) => node.x >= 0 && node.y >= 0 && node.x < cols && node.y < rows;
function validNode(node) {
  return (
    node &&
    Number.isInteger(node.x) &&
    Number.isInteger(node.y) &&
    Number.isFinite(node.seconds) &&
    node.seconds >= 0.05 &&
    node.seconds <= 60 &&
    modes.some(([mode]) => mode === node.mode)
  );
}
function save(brick, path) {
  brick.motionPath = path;
  const last = path.at(-1) || brick;
  brick.targetX = last.x;
  brick.targetY = last.y;
}
function groupMembers(room, brick) {
  if (!brick) return [];
  return brick.brickGroup
    ? room.movables.filter((member) => member.brickGroup === brick.brickGroup)
    : [brick];
}
function representative(bricks) {
  if (!bricks.length) return null;
  const x = bricks.reduce((sum, b) => sum + b.x, 0) / bricks.length,
    y = bricks.reduce((sum, b) => sum + b.y, 0) / bricks.length,
    distance = (brick) => (brick.x - x) ** 2 + (brick.y - y) ** 2;
  return bricks.reduce((closest, brick) => (distance(brick) < distance(closest) ? brick : closest));
}
function applyGroupPath(room, bricks, anchor, path) {
  const plans = bricks.map((brick) => ({
    brick,
    path: path.map((node) => ({
      ...node,
      x: node.x + brick.x - anchor.x,
      y: node.y + brick.y - anchor.y,
    })),
  }));
  if (plans.some((plan) => plan.path.some((node) => !inRoom(node, room.cols, room.rows))))
    return false;
  for (const plan of plans) save(plan.brick, plan.path);
  return true;
}
function bind(room, brick, padId) {
  for (const member of groupMembers(room, brick)) member.padId = padId;
}
function moveOwner(brick, x, y) {
  const dx = x - brick.x,
    dy = y - brick.y;
  brick.x = x;
  brick.y = y;
  if (brick.motionPath) {
    for (const node of brick.motionPath) {
      node.x += dx;
      node.y += dy;
    }
    save(brick, brick.motionPath);
  } else {
    brick.targetX += dx;
    brick.targetY += dy;
  }
}
function position(brick, time) {
  let from = brick;
  for (const to of brick.motionPath) {
    if (time <= to.seconds) {
      let t = clamp(time / to.seconds, 0, 1);
      if (to.mode === 'smooth') t = t * t * (3 - 2 * t);
      if (to.mode === 'easeIn') t *= t;
      if (to.mode === 'easeOut') t = 1 - (1 - t) ** 2;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    time -= to.seconds;
    from = to;
  }
  return { x: from.x, y: from.y };
}
function isMoving(brick, state) {
  if (!state?.anim) return false;
  if (state.anim.kind === 'path' && brick.motionPath) {
    const time = state.pathTime || 0,
      target = state.anim.to;
    const next = time + Math.sign(target - time) * Math.min(0.001, Math.abs(target - time));
    const a = position(brick, time),
      b = position(brick, next);
    return a.x !== b.x || a.y !== b.y;
  }
  if (state.anim.kind === 'angle') return state.angle !== state.anim.to;
  return (
    state.progress !== state.anim.to && (brick.x !== brick.targetX || brick.y !== brick.targetY)
  );
}
module.exports = {
  isMoving,
  modes,
  maxNodes,
  isPad,
  colorFor,
  nodes,
  duration,
  inRoom,
  validNode,
  save,
  position,
  groupMembers,
  representative,
  applyGroupPath,
  bind,
  moveOwner,
};
