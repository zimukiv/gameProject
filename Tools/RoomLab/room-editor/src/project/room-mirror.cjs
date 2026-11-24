'use strict';
const { clone } = require('../shared/utils.cjs');
const TeacherLinks = require('./teacher-links.cjs');

const AXES = ['horizontal', 'vertical'];

function negate(value) {
  return value === 0 ? 0 : -value;
}

function normalizeAngle(value) {
  let angle = value;
  while (angle <= -180) angle += 360;
  while (angle > 180) angle -= 360;
  return angle;
}

function mirrorRoom(source, axis) {
  if (!AXES.includes(axis)) throw new Error('镜像方向无效');
  if (!source || !Number.isFinite(source.cols) || !Number.isFinite(source.rows))
    throw new Error('房间尺寸无效，无法镜像');
  const room = clone(source),
    horizontal = axis === 'horizontal',
    vertical = axis === 'vertical',
    cellX = (x) => (horizontal ? room.cols - 1 - x : x),
    cellY = (y) => (vertical ? room.rows - 1 - y : y),
    pointX = (x) => (horizontal ? room.cols - x : x),
    pointY = (y) => (vertical ? room.rows - y : y),
    rectX = (x, w = 1) => (horizontal ? room.cols - x - w : x),
    rectY = (y, h = 1) => (vertical ? room.rows - y - h : y);

  for (const tile of room.tiles || []) {
    tile.x = cellX(tile.x);
    tile.y = cellY(tile.y);
  }

  for (const kind of ['entries', 'exits', 'objects', 'movables', 'zones'])
    for (const item of room[kind] || []) {
      item.x = rectX(item.x, Number.isFinite(item.w) ? item.w : 1);
      item.y = rectY(item.y, Number.isFinite(item.h) ? item.h : 1);
    }

  if (horizontal)
    for (const entry of room.entries || [])
      entry.face = -(Number.isFinite(entry.face) && entry.face ? entry.face : 1);

  for (const object of room.objects || []) {
    const params = object.params;
    if (!params) continue;
    if (Array.isArray(params.path))
      for (const node of params.path) {
        if (Number.isFinite(node.x)) node.x = pointX(node.x);
        if (Number.isFinite(node.y)) node.y = pointY(node.y);
      }
    if (horizontal) {
      if (params.direction === 'left') params.direction = 'right';
      else if (params.direction === 'right') params.direction = 'left';
    }
    if (vertical) {
      if (params.direction === 'up') params.direction = 'down';
      else if (params.direction === 'down') params.direction = 'up';
    }
    if (horizontal && Number.isFinite(params.launchX)) params.launchX = negate(params.launchX);
    if (vertical && Number.isFinite(params.launchY)) params.launchY = negate(params.launchY);
    if ((horizontal || vertical) && Number.isFinite(params.angle))
      params.angle = normalizeAngle(negate(params.angle));
    if (horizontal && Number.isFinite(params.launchAngle))
      params.launchAngle = normalizeAngle(180 - params.launchAngle);
    else if (vertical && Number.isFinite(params.launchAngle))
      params.launchAngle = normalizeAngle(negate(params.launchAngle));
    if (horizontal && TeacherLinks.isTeacher(object)) {
      const min = Number.isFinite(params.patrolMinX) ? params.patrolMinX : 0,
        max = Number.isFinite(params.patrolMaxX) ? params.patrolMaxX : 4;
      params.patrolMinX = cellX(max);
      params.patrolMaxX = cellX(min);
    }
  }

  for (const brick of room.movables || []) {
    if (Number.isFinite(brick.targetX)) brick.targetX = cellX(brick.targetX);
    if (Number.isFinite(brick.targetY)) brick.targetY = cellY(brick.targetY);
    if (Array.isArray(brick.motionPath))
      for (const node of brick.motionPath) {
        if (Number.isFinite(node.x)) node.x = cellX(node.x);
        if (Number.isFinite(node.y)) node.y = cellY(node.y);
      }
  }

  for (const trace of room.playTraces || [])
    for (const point of trace.points || []) {
      if (Number.isFinite(point.x)) point.x = pointX(point.x);
      if (Number.isFinite(point.y)) point.y = pointY(point.y);
    }

  const native = room.nativeCampaign;
  if (native) {
    for (const platform of native.platforms || []) {
      const w = Number.isFinite(platform.w) ? platform.w : 1,
        h = Number.isFinite(platform.h) ? platform.h : 1;
      platform.x = rectX(platform.x, w);
      platform.y = rectY(platform.y, h);
      if (Number.isFinite(platform.toX)) platform.toX = rectX(platform.toX, w);
      if (Number.isFinite(platform.toY)) platform.toY = rectY(platform.toY, h);
    }
    for (const patrol of native.patrols || [])
      for (const node of patrol.nodes || []) {
        if (Number.isFinite(node.x)) node.x = pointX(node.x);
        if (Number.isFinite(node.y)) node.y = pointY(node.y);
      }
    for (const sign of native.signs || []) {
      sign.x = rectX(sign.x);
      sign.y = rectY(sign.y);
    }
  }

  return room;
}

module.exports = { AXES, mirrorRoom, normalizeAngle };
