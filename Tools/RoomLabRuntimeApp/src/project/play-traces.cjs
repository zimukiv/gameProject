'use strict';
const { uid, clone } = require('../shared/utils.cjs');
const COLORS = ['#70cff4', '#ffbd78', '#c7a1ff', '#79e0b4', '#ff8fa4', '#e6dc77'],
  LIMIT = 12000,
  MAX_TRACES = 32;
class Recorder {
  constructor(game) {
    this.sessionId = uid('play-session');
    this.projectId = game.project.id;
    this.courseId = game.course.id;
    this.rooms = new Map();
    this.lastRoom = null;
    this.lastDeaths = game.deaths;
    this.capture(game);
  }
  capture(game) {
    const id = game.room.id,
      points = this.rooms.get(id) || [],
      last = points.at(-1),
      p = {
        x: Number((game.player.x + game.player.w / 2).toFixed(1)),
        y: Number((game.player.y + game.player.h / 2).toFixed(1)),
        t: Number(game.elapsed.toFixed(3)),
        life: game.deaths + 1,
      },
      cut = this.lastRoom !== id || this.lastDeaths !== game.deaths;
    if (cut) p.break = true;
    if (!last || cut || Math.hypot(p.x - last.x, p.y - last.y) >= 3 || p.t - last.t >= 0.2) {
      points.push(p);
      if (points.length > LIMIT) {
        const reduced = points.filter(
          (n, i) => i === 0 || i === points.length - 1 || n.break || i % 2 === 0,
        );
        points.splice(0, points.length, ...reduced);
      }
      this.rooms.set(id, points);
    }
    this.lastRoom = id;
    this.lastDeaths = game.deaths;
  }
  get(id) {
    return clone(this.rooms.get(id) || []);
  }
}
function create(name, points, index = 0) {
  return {
    id: uid('trace'),
    name: String(name || '试玩路径').slice(0, 80),
    createdAt: new Date().toISOString(),
    color: COLORS[index % COLORS.length],
    visible: true,
    points: clone(points),
  };
}
function pendingLives(recorder) {
  const found = new Map();
  for (const [roomId, points] of recorder?.rooms || [])
    for (const p of points) {
      const n = p.life || 1;
      const value = found.get(n) || { number: n, points: 0, rooms: new Set() };
      value.points++;
      value.rooms.add(roomId);
      found.set(n, value);
    }
  return [...found.values()]
    .sort((a, b) => a.number - b.number)
    .map((v) => ({ ...v, rooms: v.rooms.size }));
}
function saveRecording(course, recorder, name = '', selectedLives = null) {
  if (!recorder || recorder.courseId !== course.id) return 0;
  const selected = new Set(selectedLives || pendingLives(recorder).map((l) => l.number)),
    pending = [];
  for (const room of course.rooms) {
    const groups = new Map();
    for (const p of recorder.get(room.id)) {
      const life = p.life || 1;
      if (!selected.has(life)) continue;
      if (!groups.has(life)) groups.set(life, []);
      groups.get(life).push(p);
    }
    let added = 0;
    for (const [life, points] of groups) {
      const existing = (room.playTraces || []).find(
        (t) => t.sessionId === recorder.sessionId && t.life === life,
      );
      if (!existing) added++;
      pending.push({ room, life, points, existing });
    }
    if ((room.playTraces?.length || 0) + added > MAX_TRACES)
      throw Error('每房最多 32 条路径，请先移除部分记录。');
  }
  for (const entry of pending) {
    const start = entry.existing?.timeOrigin ?? entry.points[0].t ?? 0,
      points = entry.points.map((p) => ({ ...p, t: Number(((p.t || 0) - start).toFixed(3)) }));
    if (entry.existing) entry.existing.points.push(...points);
    else {
      entry.room.playTraces ||= [];
      const trace = create(String(entry.life), points, entry.room.playTraces.length);
      Object.assign(trace, { sessionId: recorder.sessionId, life: entry.life, timeOrigin: start });
      entry.room.playTraces.push(trace);
    }
  }
  if (pending.length) {
    for (const [roomId, points] of recorder.rooms) {
      const left = points.filter((p) => !selected.has(p.life || 1));
      if (left.length) recorder.rooms.set(roomId, left);
      else recorder.rooms.delete(roomId);
    }
    recorder.lastRoom = null;
  }
  return pending.length;
}
function serialize(room) {
  return JSON.stringify(
    {
      format: 'room-lab-traces',
      version: 1,
      room: { id: room.id, name: room.name, cols: room.cols, rows: room.rows },
      traces: room.playTraces || [],
    },
    null,
    2,
  );
}
function parse(text, room) {
  if (text.length > 8 * 1024 * 1024) throw new Error('路径文件不能超过 8 MiB');
  const value = JSON.parse(text);
  if (
    value.format !== 'room-lab-traces' ||
    value.version !== 1 ||
    !Array.isArray(value.traces) ||
    value.traces.length > MAX_TRACES
  )
    throw new Error('不是有效的 Room Lab 路径文件');
  if (value.room?.cols !== room.cols || value.room?.rows !== room.rows)
    throw new Error('路径文件房间尺寸与当前房间不同');
  return value.traces.map((t, i) => {
    if (
      !Array.isArray(t.points) ||
      t.points.length > LIMIT ||
      t.points.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          Math.abs(p.x) > 100000 ||
          Math.abs(p.y) > 100000,
      )
    )
      throw new Error('路径坐标无效或采样点过多');
    const trace = create(t.name, t.points, i);
    trace.visible = t.visible !== false;
    trace.color = /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : trace.color;
    return trace;
  });
}
module.exports = {
  Recorder,
  COLORS,
  LIMIT,
  MAX_TRACES,
  create,
  serialize,
  parse,
  saveRecording,
  pendingLives,
};
