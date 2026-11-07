'use strict';
const N = require('./native-compat.cjs'),
  { uid } = require('../shared/utils.cjs');
const isPad = (o) => ['calculus.integral', 'calculus.derivative'].includes(o?.type);
function control(pad) {
  const m = pad?.rework;
  return m?.signal
    ? { key: 'signal', name: m.signal }
    : m?.switch
      ? { key: 'switch', name: m.switch }
      : null;
}
function bound(brick, pad) {
  const c = control(pad);
  return (
    !!c &&
    (brick.signal
      ? c.key === 'signal' && brick.signal === c.name
      : c.key === 'switch' && brick.switch === c.name)
  );
}
function toggle(room, pad, bricks) {
  if (!isPad(pad) || pad.locked) throw Error('请先解除控制板锁定');
  bricks = bricks.filter((b) => b && !b.locked);
  if (!bricks.length) return;
  N.initRoom(room);
  let c = control(pad);
  if (c && bricks.every((b) => bound(b, pad))) {
    for (const b of bricks) {
      delete b.signal;
      delete b.switch;
    }
    return;
  }
  if (!c) {
    if (room.nativeCampaign.switches.length >= 32) throw Error('本房开关已达上限');
    const name = uid('brick').slice(0, 48);
    room.nativeCampaign.switches.push(name);
    pad.rework = { ...pad.rework, switch: name, value: pad.type === 'calculus.integral' };
    c = control(pad);
  }
  for (const b of bricks) {
    delete b.signal;
    delete b.switch;
    b[c.key] = c.name;
  }
}
function setTarget(brick, point, room) {
  if (brick.locked) return false;
  const x = Math.round(point.x * 2) / 2,
    y = Math.round(point.y * 2) / 2;
  if (x < 0 || y < 0 || x + (brick.w || 1) > room.cols || y + (brick.h || 1) > room.rows)
    throw Error('机关砖终点越界');
  brick.toX = x;
  brick.toY = y;
  return true;
}
module.exports = { isPad, control, bound, toggle, setTarget };
