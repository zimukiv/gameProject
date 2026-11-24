'use strict';
const { clamp } = require('../shared/utils.cjs');
const TeacherLinks = require('../project/teacher-links.cjs');
const Route = require('../project/teacher-route.cjs');
function patrolBounds(ctx, o) {
  const cols = ctx.room.cols,
    a = clamp(Number(o.params?.patrolMinX) || 0, 0, cols - 1),
    b = clamp(Number(o.params?.patrolMaxX) || 0, 0, cols - 1);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}
module.exports = {
  type: 'slacker.teacher',
  version: '1.1.0',
  name: '巡查老师',
  glyph: '师',
  category: '水课',
  courses: ['slacker'],
  slots: ['idle', 'active'],
  collider: false,
  defaultCollision: false,
  trigger: 'none',
  defaults: {
    patrolMinX: 0,
    patrolMaxX: 4,
    speed: 1.5,
    path: [],
    pathLoop: 'roundtrip',
    checkinIds: [],
  },
  schema: [
    { key: 'patrolMinX', label: '平台左边界（列）', kind: 'number', min: 0, max: 255 },
    { key: 'patrolMaxX', label: '平台右边界（列）', kind: 'number', min: 0, max: 255 },
    { key: 'speed', label: '巡查速度（格/秒，无节点路线时生效）', kind: 'number', min: 0.1, max: 20 },
    {
      key: 'pathLoop',
      label: '节点路线循环',
      kind: 'select',
      values: ['roundtrip', 'loop', 'once'],
      labels: { roundtrip: '往返', loop: '循环', once: '单次' },
    },
  ],
  createState(ctx, o) {
    const range = patrolBounds(ctx, o),
      start = Route.hasPath(o)
        ? { x: o.x, y: o.y }
        : { x: clamp(o.x, range.min, range.max), y: o.y };
    return {
      x: start.x,
      y: start.y,
      direction: 1,
      routeTime: 0,
      hits: 0,
      removed: false,
      playerContact: false,
    };
  },
  runtimePosition(o, state) {
    return state ? { x: state.x, y: state.y } : null;
  },
  tick(ctx, o, state, dt) {
    if (state.removed) return;
    if (Route.hasPath(o)) {
      state.routeTime = (state.routeTime || 0) + dt;
      const point = Route.at(o, state.routeTime);
      state.x = point.x;
      state.y = point.y;
    } else {
      const range = patrolBounds(ctx, o),
        speed = Math.max(0, Number(o.params?.speed) || 0);
      if (range.max > range.min && speed > 0) {
        let next = state.x + (state.direction < 0 ? -1 : 1) * speed * dt;
        if (next > range.max) {
          next = range.max - (next - range.max);
          state.direction = -1;
        } else if (next < range.min) {
          next = range.min + (range.min - next);
          state.direction = 1;
        }
        state.x = clamp(next, range.min, range.max);
      } else state.x = range.min;
    }
    const checkins = TeacherLinks.ids(o);
    if (checkins.length && checkins.every((id) => (ctx.objectState(id)?.signIns || 0) > 0)) {
      state.removed = true;
      state.playerContact = false;
      ctx.emit('teacher-removed', { id: o.id });
    }
  },
  onPlayerContact(ctx, o, state) {
    if (state.removed) return false;
    state.hits = (state.hits || 0) + 1;
    if (state.hits >= 2) {
      ctx.emit('teacher-death', { id: o.id, hits: state.hits });
      ctx.retry('再次碰到巡查老师');
      return 'retry';
    }
    const result = ctx.takeHalfTokens();
    ctx.say('被巡查老师抓住：失去 ' + result.lost + ' 个 token');
    ctx.emit('teacher-hit', { id: o.id, hits: state.hits, ...result });
    return false;
  },
  visual(ctx, o, state) {
    return state.hits > 0 ? 'active' : 'idle';
  },
};
