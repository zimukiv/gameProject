'use strict';
const M = require('../project/model.cjs'),
  Registry = require('../plugins/registry.cjs'),
  { clone, overlap, center, clamp, rotate } = require('../shared/utils.cjs');
const T = 32;
const Performance = require('../project/performance.cjs');
const Temperature = require('../project/temperature.cjs');
const Collision = require('../project/collision.cjs');
const Spikes = require('../project/spikes.cjs');
function direction(input, face) {
  const x = Number(!!input.right) - Number(!!input.left);
  return { x: x || face, y: 0 };
}
function accelerateHorizontal(velocity, horizontal, maxSpeed, dt, rampTime) {
  if (!horizontal) return 0;
  // Start a fresh ramp when reversing. Releasing ordinary movement still stops immediately.
  const speed = Math.sign(velocity) === horizontal ? Math.min(Math.abs(velocity), maxSpeed) : 0;
  return horizontal * Math.min(maxSpeed, speed + (maxSpeed / rampTime) * dt);
}
class Engine {
  constructor(project, courseId, roomId, entryId) {
    const errors = M.validate(project, { play: true }).errors;
    if (errors.length) throw new Error(errors[0]);
    this.config = Performance.resolve(project.settings);
    this.project = clone(project);
    this.course = this.project.courses.find((c) => c.id === courseId) || this.project.courses[0];
    for (const r of this.course.rooms)
      for (const o of r.objects) {
        const errors = Registry.validateObject(this.project, o);
        if (errors.length) throw new Error(errors[0]);
        o.params = clone(Registry.params(this.project, o));
      }
    this.elapsed = 0;
    this.score = 0;
    this.deaths = 0;
    this.steals = 0;
    this.developer = { enabled: false, lockHealth: false, flight: false };
    this.events = [];
    this.credited = new Set();
    this.roomCaches = new Map();
    this.lifeBaselines = new Map();
    this.courseState = {
      aiActive: false,
      aiTier: 0,
      aiId: this.course.aiId,
      phase: 'slow',
      life: 1,
    };
    this.loadRoom(roomId || this.course.rooms[0].id, entryId, {
      tokens: 0,
      charges: 3,
      recharge: 0,
      freeDash: true,
      dashCount: 0,
      paidDashUsed: false,
    });
  }
  emit(type, extra = {}) {
    this.events.push({ type, room: this.room.id, ...extra });
    if (this.events.length > 200) this.events.shift();
  }
  say(message, time = 3) {
    this.message = message;
    this.messageTime = time;
  }
  objectRect(o) {
    return {
      id: o.id,
      x: o.x * T,
      y: o.y * T,
      w: (o.w || 1) * T,
      h: (o.h || 1) * T,
      kind: 'object',
      object: o,
    };
  }
  context(o) {
    return {
      player: this.player,
      ai: this.ai,
      project: this.project,
      room: this.room,
      temperature: (target) =>
        target.type === 'physics.ice'
          ? Temperature.at(this.room, target, this.zoneStates, this.roomEnvironment)
          : this.zoneStates.get(target.params.zoneId) || this.roomEnvironment,
      setTemperature: (zoneId, value) => this.setTemperature(zoneId, value),
      actorOverlaps: (target) =>
        overlap(this.player, this.objectRect(target)) ||
        (this.ai.active &&
          overlap({ x: this.ai.x - 12, y: this.ai.y - 14, w: 24, h: 28 }, this.objectRect(target))),
      launchPlayer: (x, y) => this.launchPlayer(x, y),
      launchAI: (target, range, x, y) => this.launchAI(target, range, x, y),
      startRail: (target) => this.startRail(target),
      activateAI: (target) => this.activateAI(target),
      saveCheckpoint: (target) => this.saveCheckpoint(target),
      activeCheckpoint: this.checkpoint?.id || null,
      transformGroup: (target, kind) => this.transformGroup(target, kind),
      emit: (type, data) => this.emit(type, data),
      say: (text) => this.say(text),
    };
  }
  setTemperature(zoneId, value) {
    const ice = this.room.objects.filter((o) => o.type === 'physics.ice'),
      previous = ice.map((o) => this.context(o).temperature(o));
    if (zoneId) this.zoneStates.set(zoneId, value);
    else this.roomEnvironment = value;
    // Synchronize in the switch action itself: drawing and collision queries
    // must see the frozen blocks before another physics tick or countdown.
    ice.forEach((o, i) => {
      const ctx = this.context(o), next = ctx.temperature(o);
      if (previous[i] !== next)
        Registry.get(o.type).onTemperatureChange?.(ctx, o, this.objectStates.get(o.id), next);
    });
  }
  serializeRoom() {
    return clone({
      objects: Object.fromEntries(this.objectStates),
      zones: Object.fromEntries(this.zoneStates),
      environment: this.roomEnvironment,
      movables: Object.fromEntries(this.movableStates),
    });
  }
  initializeRoom(cache = null) {
    this.zoneStates = new Map(
      this.room.zones.map((z) => [z.id, Temperature.initial(this.room, z.id)]),
    );
    this.roomEnvironment = Temperature.initial(this.room);
    this.objectStates = new Map();
    this.movableStates = new Map(
      this.room.movables.map((b) => [b.id, { progress: 0, angle: 0, anim: null }]),
    );
    for (const o of this.room.objects) {
      const def = Registry.get(o.type),
        extra = def.createState?.(this.context(o), o) || {};
      this.objectStates.set(o.id, {
        used: false,
        cooldown: 0,
        firedDuringContact: false,
        ...extra,
      });
    }
    if (cache) {
      this.objectStates = new Map(Object.entries(clone(cache.objects)));
      this.zoneStates = new Map(Object.entries(cache.zones));
      this.roomEnvironment = cache.environment;
      this.movableStates = new Map(Object.entries(clone(cache.movables)));
    }
  }
  loadRoom(id, entryId, resources, carry = null, respawn = null) {
    if (this.room) this.roomCaches.set(this.room.id, this.serializeRoom());
    this.room = this.course.rooms.find((r) => r.id === id);
    if (!this.room) throw new Error('目标房间不存在');
    this.entry = this.room.entries.find((e) => e.id === entryId) || this.room.entries[0];
    Object.assign(this, {
      tokens: resources.tokens,
      charges: resources.charges,
      recharge: resources.recharge,
    });
    this.player = {
      x: respawn?.spawn?.x ?? this.entry.x * T + 4,
      y: respawn?.spawn?.y ?? this.entry.y * T + 4,
      w: 24,
      h: 28,
      vx: carry?.vx || 0,
      vy: carry?.vy || 0,
      face: respawn?.spawn?.face || this.entry.face || 1,
      grounded: false,
      coyote: 0,
      buffer: 0,
      dash: 0,
      dashX: 0,
      dashY: 0,
      freeDash: resources.freeDash,
      dashCount: resources.dashCount,
      paidDashUsed: !!resources.paidDashUsed,
      launched: false,
      launchX: 0,
      rail: null,
      invulnerable: 0.4,
      crouching: false,
      support: null,
    };
    if (carry && (Math.abs(carry.vx) > 1 || Math.abs(carry.vy) > 1)) {
      this.player.launched = true;
      this.player.launchX = carry.vx;
    }
    if (this.room.phase !== 'inherit') this.courseState.phase = this.room.phase;
    if (this.room.aiPolicy === 'start') this.courseState.aiActive = true;
    const pc = center(this.player);
    this.ai = {
      id: this.room.aiId || this.courseState.aiId || this.course.aiId,
      active: this.room.aiPolicy === 'off' ? false : this.courseState.aiActive,
      tier: this.courseState.aiTier,
      x: pc.x - 165,
      y: pc.y,
      speed: 265 + 30 * this.courseState.aiTier,
      steal: 1 + 2 * this.courseState.aiTier,
      processing: 0.8,
      cooldown: 0,
      flight: false,
      vx: 0,
      vy: 0,
      warning: null,
      teleported: [],
      trail: [pc],
    };
    this.initializeRoom(this.roomCaches.get(id));
    if (!this.lifeBaselines.has(id))
      this.lifeBaselines.set(id, clone(Object.fromEntries(this.objectStates)));
    this.roomTime = 0;
    this.respawnRemaining = 0;
    this.exitCooldown = 0.4;
    this.playerTrail = [];
    this.aiTrail = [];
    this.mode = 'playing';
    this.message = this.room.notes || this.room.name;
    this.messageTime = 5;
    this.checkpoint = this.captureCheckpoint(respawn?.spawn || null, respawn?.id || null);
    this.emit('room-enter', { entryId: this.entry.id });
    this.flightReturn = null;
    if (this.developer.flight) this.beginFlight();
  }
  captureCheckpoint(spawn = null, id = null) {
    return {
      id, spawn,
      resources: {
        tokens: this.tokens,
        charges: this.charges,
        recharge: this.recharge,
        freeDash: this.player.freeDash,
        dashCount: this.player.dashCount,
        paidDashUsed: this.player.paidDashUsed,
      },
      score: this.score,
      credited: [...this.credited],
      course: clone(this.courseState),
      state: this.serializeRoom(),
    };
  }
  saveCheckpoint(o) {
    if (this.mode !== 'playing' || this.developer.flight || this.checkpoint.id === o.id) return;
    const p = this.player, colliders = this.colliders(), spikes = this.room.objects.filter(b => b.type === 'common.spike');
    const safe = pos => pos.x >= 0 && pos.y >= 0 && pos.x + 24 <= this.room.cols*T && pos.y + 28 <= this.room.rows*T &&
      !colliders.some(b => overlap({ ...pos, w: 24, h: 28 }, b)) &&
      !spikes.some(b => Spikes.touches({ ...pos, w: 24, h: 28 }, this.objectRect(b), b.params.direction));
    let spawn = { x: o.x*T+4, y: o.y*T+4, face: p.face };
    if (!safe(spawn)) spawn = { x: p.x, y: p.y-(p.crouching ? 10 : 0), face: p.face };
    if (!safe(spawn)) { this.say('存档点周围没有安全复活位置。'); return; }
    this.checkpoint = this.captureCheckpoint(spawn, o.id);
    this.emit('checkpoint', { id: o.id, x: spawn.x, y: spawn.y });
    this.say('存档点已保存，死亡或重试后从这里继续。');
  }
  retry(reason = '重试当前房间') {
    if (this.respawnRemaining > 0 && this.mode === 'playing') return;
    const preserved = new Map();
    for (const o of this.room.objects)
      if (o.resetPolicy === 'preserve') preserved.set(o.id, clone(this.objectStates.get(o.id)));
    this.roomCaches.set(this.room.id, this.serializeRoom());
    for (const room of this.course.rooms) {
      const cache = this.roomCaches.get(room.id),
        baseline = this.lifeBaselines.get(room.id);
      if (!cache || !baseline) continue;
      for (const o of room.objects)
        if (o.resetPolicy === 'life' && baseline[o.id]) {
          cache.objects[o.id] = clone(baseline[o.id]);
          Registry.get(o.type).restoreSnapshotEffects?.(o, cache.objects[o.id], cache);
        }
    }
    this.deaths++;
    this.emit('retry', { reason });
    const cp = clone(this.checkpoint),
      roomId = this.room.id,
      entryId = this.entry.id;
    this.score = cp.score;
    this.credited = new Set(cp.credited);
    this.courseState = cp.course;
    this.courseState.life++;
    const baseline = this.lifeBaselines.get(roomId);
    for (const o of this.room.objects)
      if (o.resetPolicy === 'life' && baseline?.[o.id]) {
        cp.state.objects[o.id] = clone(baseline[o.id]);
        Registry.get(o.type).restoreSnapshotEffects?.(o, cp.state.objects[o.id], cp.state);
      }
    this.roomCaches.set(roomId, cp.state);
    this.lifeBaselines.clear();
    this.room = null;
    this.loadRoom(roomId, entryId, cp.resources, null, cp);
    for (const o of this.room.objects) {
      if (preserved.has(o.id)) this.objectStates.set(o.id, preserved.get(o.id));
      else if (o.resetPolicy === 'initial') {
        const extra = Registry.get(o.type).createState?.(this.context(o), o) || {};
        this.objectStates.set(o.id, {
          used: false,
          cooldown: 0,
          firedDuringContact: false,
          ...extra,
        });
      }
    }
    for (const o of this.room.objects)
      if (o.resetPolicy === 'preserve')
        Registry.get(o.type).restoreEffects?.(this.context(o), o, this.objectStates.get(o.id));
    for (const o of this.room.objects)
      Registry.get(o.type).afterRetry?.(this.context(o), o, this.objectStates.get(o.id));
    this.player.freeDash = true;
    this.player.dashCount = 0;
    this.player.paidDashUsed = false;
    this.respawnRemaining = 0.5;
    this.say(reason + (cp.id ? '。已恢复最近存档点。' : '。已恢复当前入口。'));
  }
  setDeveloperOptions(options = {}) {
    const wasFlying = this.developer.flight;
    this.developer = {
      enabled: options.enabled === true,
      lockHealth: options.enabled === true && options.lockHealth === true,
      flight: options.enabled === true && options.flight === true,
    };
    if (!wasFlying && this.developer.flight) this.beginFlight();
    else if (wasFlying && !this.developer.flight) this.endFlight();
  }
  clearFlightMotion() {
    Object.assign(this.player, { vx: 0, vy: 0, dash: 0, rail: null, launched: false,
      launchX: 0, grounded: false, support: null, coyote: 0, buffer: 0 });
  }
  beginFlight() {
    const p = this.player;
    this.flightReturn = { roomId: this.room.id, x: p.x, y: p.y, w: p.w, h: p.h, crouching: p.crouching };
    this.clearFlightMotion();
    if (p.crouching) { p.y -= 10; p.h = 28; p.crouching = false; }
  }
  endFlight() {
    const p = this.player, colliders = this.colliders(),
      spikes = this.room.objects.filter((o) => o.type === 'common.spike');
    const safe = (rect) => rect.x >= 0 && rect.y >= 0 &&
      rect.x + rect.w <= this.room.cols * T && rect.y + rect.h <= this.room.rows * T &&
      !colliders.some((b) => overlap(rect, b)) &&
      !spikes.some((o) => Spikes.touches(rect, this.objectRect(o), o.params.direction));
    if (!safe(p)) {
      const anchor = this.flightReturn?.roomId === this.room.id ? this.flightReturn : null,
        entry = { x: this.checkpoint?.spawn?.x ?? this.entry.x * T + 4,
          y: this.checkpoint?.spawn?.y ?? this.entry.y * T + 4, w: p.w, h: 28, crouching: false };
      let target = anchor && safe(anchor) ? anchor : safe(entry) ? entry : null;
      if (!target) {
        // A changing ice block can occupy the old anchor. Find the nearest empty cell.
        const origin = anchor || entry, candidates = [];
        for (let y = 0; y < this.room.rows; y++) for (let x = 0; x < this.room.cols; x++)
          candidates.push({ x: x * T + 4, y: y * T + 4, w: p.w, h: 28, crouching: false });
        candidates.sort((a, b) => Math.hypot(a.x-origin.x, a.y-origin.y)-Math.hypot(b.x-origin.x, b.y-origin.y));
        target = candidates.find(safe) || entry;
      }
      Object.assign(p, { x: target.x, y: target.y, w: target.w, h: target.h, crouching: target.crouching });
    }
    this.clearFlightMotion();
    this.flightReturn = null;
  }
  togglePause() {
    if (this.mode === 'playing') this.mode = 'paused';
    else if (this.mode === 'paused') this.mode = 'playing';
  }
  visualState(o) {
    const def = Registry.get(o.type);
    return def.visual?.(this.context(o), o, this.objectStates.get(o.id)) || 'idle';
  }
  movableRect(b) {
    const s = this.movableStates.get(b.id),
      o = this.room.objects.find((o) => o.id === b.padId);
    if (o?.type === 'legacy.rotor') {
      const pivot = { x: (o.x + 0.5) * T, y: o.y * T },
        p = rotate((b.x + 0.5) * T, (b.y + 0.5) * T, pivot.x, pivot.y, s.angle);
      return {
        id: b.id,
        x: p.x - T / 2,
        y: p.y - T / 2,
        w: T,
        h: T,
        kind: 'movable',
        active: !s.anim,
      };
    }
    return {
      id: b.id,
      x: (b.x + (b.targetX - b.x) * s.progress) * T,
      y: (b.y + (b.targetY - b.y) * s.progress) * T,
      w: T,
      h: T,
      kind: 'movable',
      active: true,
    };
  }
  colliders() {
    const result = this.room.tiles
      .filter((t) => Collision.enabled(t, 'tiles'))
      .map((t) => ({
        id: 'tile-' + t.x + '-' + t.y,
        x: t.x * T,
        y: t.y * T,
        w: T,
        h: T,
        kind: 'tile',
        priority: 0,
      }));
    for (const o of this.room.objects) {
      const def = Registry.get(o.type),
        s = this.objectStates.get(o.id);
      // Spikes are hazards with a compact hurt shape, never full-cell solid blocks.
      if (o.type === 'common.spike') continue;
      const shape = Collision.shape(o, def);
      if (!shape || (def.isSolid && !def.isSolid(this.context(o), o, s))) continue;
      if (
        ['common.coin', 'common.small', 'common.collectible'].includes(o.type) &&
        this.credited.has(this.room.id + '/' + o.id)
      )
        continue;
      const rect = this.objectRect(o);
      if (shape === 'pad') rect.h = 8;
      rect.priority = shape === 'tile' ? 2 : 1;
      result.push(rect);
    }
    result.push(
      ...this.room.movables
        .filter((b) => Collision.enabled(b, 'movables'))
        .map((b) => ({ ...this.movableRect(b), priority: 2 }))
        .filter((b) => b.active),
    );
    return result;
  }
  transformGroup(o, kind) {
    const pivot = { x: (o.x + 0.5) * T, y: o.y * T };
    for (const b of this.room.movables.filter((b) => b.padId === o.id)) {
      const rect = this.movableRect(b);
      if (Math.hypot(rect.x + 16 - pivot.x, rect.y + 16 - pivot.y) > (o.params.range || 12) * T)
        continue;
      const s = this.movableStates.get(b.id);
      s.anim =
        kind === 'rotor'
          ? { kind: 'angle', from: s.angle, to: s.angle + (o.params.angle || 90), t: 0 }
          : {
              kind: 'progress',
              from: s.progress,
              to: o.params.once ? 1 : s.progress > 0.5 ? 0 : 1,
              t: 0,
            };
    }
    if (kind === 'rotor') {
      this.launchPlayer(o.params.launchX, o.params.launchY);
      this.launchAI(o, o.params.range || 3, o.params.launchX, o.params.launchY);
    }
    this.emit('transform', { id: o.id, kind });
  }
  launchPlayer(x, y) {
    Object.assign(this.player, {
      vx: x,
      vy: y,
      launched: true,
      launchX: x,
      rail: null,
      dash: 0,
      grounded: false,
      coyote: 0,
      buffer: 0,
    });
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.3);
  }
  launchAI(o, range, x, y) {
    const pivot = { x: (o.x + 0.5) * T, y: o.y * T };
    if (this.ai.active && Math.hypot(this.ai.x - pivot.x, this.ai.y - pivot.y) <= range * T) {
      Object.assign(this.ai, {
        flight: true,
        vx: x,
        vy: y,
        warning: null,
        trail: [],
        processing: 0.3,
      });
      this.objectStates.get(o.id).hitAI = true;
    }
  }
  activateAI(o) {
    if (this.courseState.aiActive && this.ai.active) return;
    const resumed = this.courseState.aiActive;
    const investment = resumed ? 0 : this.tokens,
      tier = resumed ? this.courseState.aiTier : investment >= 20 ? 2 : investment >= 10 ? 1 : 0;
    if (!resumed) {
      this.tokens = 0;
      Object.assign(this.courseState, {
        aiActive: true,
        aiTier: tier,
        aiId: o.aiId || this.room.aiId || this.course.aiId,
        phase: 'fast',
      });
    }
    const pc = center(this.player);
    Object.assign(this.ai, {
      id: this.courseState.aiId,
      active: true,
      tier,
      speed: 265 + tier * 30,
      steal: 1 + tier * 2,
      x: pc.x - 165,
      y: pc.y,
      processing: 0.8,
      trail: [pc],
    });
    this.emit('ai-start', { investment, tier, resumed });
  }
  startRail(o) {
    const points = o.params.path.map((p) => ({ x: p.x * T, y: p.y * T }));
    if (points.length < 2) {
      this.say('轨道至少需要两个节点。');
      return;
    }
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    this.player.rail = {
      id: o.id,
      points,
      lengths,
      total: lengths.reduce((a, b) => a + b, 0),
      distance: 0,
      speed: 0,
      acceleration: o.params.acceleration,
      maxSpeed: o.params.maxSpeed,
      angle: o.params.launchAngle,
      allowExit: o.params.allowExit,
    };
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.grounded = false;
    this.player.launched = false;
  }
  moveRail(dt) {
    const p = this.player,
      r = p.rail;
    r.speed = Math.min(r.maxSpeed, r.speed + r.acceleration * dt);
    r.distance = Math.min(r.total, r.distance + r.speed * dt);
    let remaining = r.distance,
      index = 0;
    while (index < r.lengths.length - 1 && remaining > r.lengths[index]) {
      remaining -= r.lengths[index];
      index++;
    }
    const segment = r.lengths[index],
      t = segment > 0 ? remaining / segment : 1,
      a = r.points[index],
      b = r.points[index + 1];
    p.x = a.x + (b.x - a.x) * t - p.w / 2;
    p.y = a.y + (b.y - a.y) * t - p.h;
    p.vx = segment ? ((b.x - a.x) / segment) * r.speed : 0;
    p.vy = segment ? ((b.y - a.y) / segment) * r.speed : 0;
    p.grounded = false;
    if (r.distance >= r.total) {
      const angle = (r.angle * Math.PI) / 180;
      this.launchPlayer(Math.cos(angle) * r.speed, Math.sin(angle) * r.speed);
      this.emit('rail-end', { id: r.id, speed: r.speed });
    }
  }
  fire(o) {
    const s = this.objectStates.get(o.id),
      def = Registry.get(o.type);
    if (s.cooldown > 0 || ((o.trigger?.once || o.params.once) && s.used)) return;
    s.used = true;
    s.cooldown = o.params.cooldown || o.trigger?.cooldown || 1;
    def.onTrigger?.(this.context(o), o, s);
    this.emit('trigger', { id: o.id, type: o.type });
  }
  triggerObjects(oldBottom) {
    const p = this.player;
    for (const o of this.room.objects) {
      const d = Registry.get(o.type),
        mode = o.trigger?.mode || d.trigger;
      if (mode === 'none') continue;
      const s = this.objectStates.get(o.id),
        rect = this.objectRect(o);
      const occupied =
        overlap(p, rect) ||
        (p.grounded &&
          p.vy >= 0 &&
          oldBottom <= rect.y + 2 &&
          Math.abs(p.y + p.h - rect.y) < 1 &&
          p.x + p.w > rect.x + 2 &&
          p.x < rect.x + rect.w - 2);
      if (!occupied) {
        s.firedDuringContact = false;
        continue;
      }
      const required = o.trigger?.requiresAI,
        distance = o.trigger?.distance || 5,
        aiId = o.aiId || this.room.aiId || this.course.aiId;
      const ready =
        !required ||
        (this.ai.active &&
          this.ai.id === aiId &&
          Math.hypot(this.ai.x - (o.x + 0.5) * T, this.ai.y - o.y * T) <= distance * T);
      s.waitingAI = occupied && !ready;
      if (ready && !s.firedDuringContact) {
        this.fire(o);
        s.firedDuringContact = true;
      }
    }
  }
  tryCollect(o) {
    if (!['common.coin', 'common.small', 'common.collectible'].includes(o.type)) return;
    if (o.params.unlockPadId && !this.objectStates.get(o.params.unlockPadId)?.hitAI) return;
    const p = this.player,
      rect = this.objectRect(o),
      solidContact =
        o.collision === true &&
        overlap({ x: p.x - 0.2, y: p.y - 0.2, w: p.w + 0.4, h: p.h + 0.4 }, rect);
    if (solidContact || overlap(p, { x: rect.x + 5, y: rect.y + 5, w: 22, h: 22 }))
      this.collect(o);
  }
  collect(o) {
    const key = this.room.id + '/' + o.id;
    if (this.credited.has(key)) return;
    this.credited.add(key);
    if (o.type === 'common.collectible') this.score += 10000;
    else {
      const n = o.type === 'common.small' ? 1 : 10;
      this.tokens += n;
      this.recharge += n;
      this.score += n === 1 ? 100 : 1000;
      while (this.recharge >= 10) {
        this.recharge -= 10;
        this.charges = Math.min(3, this.charges + 1);
      }
    }
    this.emit('collect', { id: o.id });
  }
  catchPlayer() {
    if (this.developer.lockHealth || this.developer.flight) return;
    const a = this.ai,
      p = this.player;
    if (a.processing > 0 || a.cooldown > 0 || p.invulnerable > 0) return;
    if (this.tokens === 0) {
      this.retry('没有 token，被 AI 抓到');
      return;
    }
    const amount = Math.min(this.tokens, a.steal);
    this.tokens -= amount;
    this.steals++;
    a.processing = 0.8;
    a.cooldown = 1.4;
    p.invulnerable = 1.3;
    this.emit('steal', { amount });
  }
  updateAI(dt, colliders) {
    const a = this.ai,
      pc = center(this.player);
    a.processing = Math.max(0, a.processing - dt);
    a.cooldown = Math.max(0, a.cooldown - dt);
    if (!a.active) return;
    if (a.flight) {
      const old = a.y + 14;
      a.vy = Math.min(this.config.maxFall, a.vy + this.config.gravity * dt);
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      for (const b of colliders)
        if (
          a.vy >= 0 &&
          old <= b.y + 0.1 &&
          overlap({ x: a.x - 12, y: a.y - 14, w: 24, h: 28 }, b)
        ) {
          a.y = b.y - 14;
          a.flight = false;
          a.trail = [pc];
          break;
        }
      if (a.y > this.room.rows * T + 80) {
        a.flight = false;
        a.x = pc.x - 140;
        a.y = pc.y;
        a.trail = [pc];
        a.processing = 0.5;
      }
    } else {
      const tail = a.trail.at(-1);
      if (!tail || Math.hypot(tail.x - pc.x, tail.y - pc.y) > 4) a.trail.push(pc);
      for (const entry of this.room.objects.filter((o) => o.type === 'common.portalIn')) {
        const exit = this.room.objects.find(
          (o) => o.type === 'common.portalOut' && o.params.routeId === entry.params.routeId,
        );
        if (
          exit &&
          !a.teleported.includes(entry.params.routeId) &&
          !a.warning &&
          a.processing <= 0 &&
          Math.hypot(a.x - (entry.x + 0.5) * T, a.y - (entry.y + 0.5) * T) < 48
        ) {
          a.warning = {
            remaining: 0.65,
            to: { x: (exit.x + 0.5) * T, y: (exit.y + 0.5) * T },
            id: entry.params.routeId,
          };
          a.teleported.push(entry.params.routeId);
        }
      }
      if (a.warning) {
        a.warning.remaining = Math.max(0, a.warning.remaining - dt);
        if (a.warning.remaining === 0) {
          a.x = a.warning.to.x;
          a.y = a.warning.to.y;
          a.warning = null;
          a.processing = 0.25;
          a.trail = [pc];
          this.emit('ai-teleport');
        }
      } else if (a.processing <= 0) {
        let distance = a.speed * dt;
        while (distance > 0 && a.trail.length) {
          const t = a.trail[0],
            dx = t.x - a.x,
            dy = t.y - a.y,
            n = Math.hypot(dx, dy);
          if (n <= distance) {
            a.x = t.x;
            a.y = t.y;
            distance -= n;
            a.trail.shift();
          } else {
            a.x += (dx / n) * distance;
            a.y += (dy / n) * distance;
            distance = 0;
          }
        }
      }
    }
    if (Math.hypot(a.x - pc.x, a.y - pc.y) < 30) this.catchPlayer();
    if (a.trail.length > 1400) a.trail.splice(0, a.trail.length - 1400);
  }
  simulateAI(oId, near = true) {
    const o = this.room.objects.find((o) => o.id === oId);
    if (!o) return;
    this.ai.id = o.aiId || this.room.aiId || this.course.aiId;
    this.ai.active = true;
    this.ai.processing = 30;
    this.ai.x = (o.x + 0.5) * T + (near ? 20 : 500);
    this.ai.y = o.y * T - 12;
    this.emit('test-ai', { id: oId, near });
  }
  update(dt, input = {}) {
    if (this.mode !== 'playing') return;
    dt = clamp(dt, 0, 1 / 30);
    // Give the player time to reorient after a death. Freeze the entire round,
    // including AI/obstacles/timers, and discard input edges during the buffer.
    if (this.respawnRemaining > 0) {
      this.respawnRemaining = Math.max(0, this.respawnRemaining - dt);
      if (this.respawnRemaining < 1e-9) this.respawnRemaining = 0;
      return;
    }
    this.elapsed += dt;
    this.roomTime += dt;
    this.messageTime = Math.max(0, this.messageTime - dt);
    this.exitCooldown = Math.max(0, this.exitCooldown - dt);
    const p = this.player,
      wasGrounded = p.grounded,
      before = this.colliders();
    for (const o of this.room.objects) {
      const s = this.objectStates.get(o.id);
      s.cooldown = Math.max(0, s.cooldown - dt);
      Registry.get(o.type).tick?.(this.context(o), o, s, dt);
    }
    for (const s of this.movableStates.values())
      if (s.anim) {
        s.anim.t = Math.min(0.45, s.anim.t + dt);
        const v = s.anim.from + ((s.anim.to - s.anim.from) * s.anim.t) / 0.45;
        if (s.anim.kind === 'angle') s.angle = v;
        else s.progress = v;
        if (s.anim.t === 0.45) s.anim = null;
      }
    const colliders = this.colliders();
    if (this.developer.flight) {
      const x = Number(!!input.right) - Number(!!input.left),
        y = Number(!!input.down) - Number(!!input.up),
        length = Math.hypot(x, y) || 1, speed = this.config.speed * 2;
      p.vx = x / length * speed; p.vy = y / length * speed;
      p.x = clamp(p.x + p.vx * dt, 0, this.room.cols * T - p.w);
      p.y = clamp(p.y + p.vy * dt, 0, this.room.rows * T - p.h);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      if (x) p.face = x;
      // Inspection flight does not collect items, fire devices or enter exits.
      this.updateAI(dt, colliders);
      this.recordTrails();
      return;
    }
    if (p.grounded && p.support) {
      const old = before.find((b) => b.id === p.support),
        now = colliders.find((b) => b.id === p.support);
      if (old && now) {
        p.x += now.x - old.x;
        p.y += now.y - old.y;
      }
    }
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    const crouch = input.down && p.grounded && !p.launched && !p.rail && p.dash <= 0;
    if (crouch && !p.crouching) {
      p.y += 10;
      p.h = 18;
      p.crouching = true;
    } else if (!crouch && p.crouching) {
      const full = { ...p, y: p.y - 10, h: 28 };
      if (!colliders.some((b) => overlap(full, b))) {
        p.y -= 10;
        p.h = 28;
        p.crouching = false;
      }
    }
    if (input.jumpPressed) p.buffer = this.config.buffer;
    else p.buffer = Math.max(0, p.buffer - dt);
    p.coyote = p.grounded ? this.config.coyote : Math.max(0, p.coyote - dt);
    const horizontal = Number(!!input.right) - Number(!!input.left);
    if (horizontal) p.face = horizontal;
    if (
      input.dashPressed &&
      (p.freeDash || (!p.paidDashUsed && this.charges > 0)) &&
      (!p.rail || p.rail.allowExit)
    ) {
      const d = direction(input, p.face),
        free = p.freeDash;
      if (free) p.freeDash = false;
      else {
        this.charges--;
        p.paidDashUsed = true;
      }
      // Retain the count for diagnostics; it no longer gates either dash allowance.
      p.dashCount++;
      Object.assign(p, {
        vx: 0,
        vy: 0,
        rail: null,
        launched: false,
        dash: this.config.dashTime,
        dashX: d.x,
        dashY: d.y,
        coyote: 0,
        buffer: 0,
      });
      this.emit('dash', { free, count: p.dashCount });
    }
    if (input.jumpPressed && p.rail?.allowExit) {
      p.rail = null;
      p.launched = true;
      p.launchX = p.vx;
      p.vy = -this.config.jump;
      p.buffer = 0;
    }
    if (p.rail) {
      this.moveRail(dt);
      for (const o of this.room.objects) this.tryCollect(o);
      this.updateAI(dt, colliders);
      this.recordTrails();
      return;
    }
    if (p.buffer > 0 && p.coyote > 0 && p.dash <= 0 && !p.launched) {
      p.vy = -this.config.jump;
      p.grounded = false;
      p.coyote = 0;
      p.buffer = 0;
      this.emit('jump');
    }
    const dashing = p.dash > 0;
    if (dashing) {
      const speed = Math.max(
        0,
        this.config.dashSpeed - this.config.dashDeceleration * (this.config.dashTime - p.dash),
      );
      p.vx = p.dashX * speed;
      p.vy = p.dashY * speed;
      p.dash = Math.max(0, p.dash - dt);
    } else {
      const support = this.room.objects.find((o) => o.id === p.support),
        material = support && Registry.get(support.type).surface?.(this.context(support), support);
      if (p.grounded && material && !p.launched) {
        if (horizontal)
          p.vx = clamp(
            p.vx + horizontal * material.acceleration * dt,
            -this.config.speed,
            this.config.speed,
          );
        else p.vx *= Math.exp(-material.friction * dt);
      } else
        p.vx = p.launched
          ? Math.abs(p.launchX) < 1
            ? accelerateHorizontal(p.vx, horizontal, this.config.speed, dt, this.config.moveAccelerationTime)
            : p.launchX + horizontal * 45
          : accelerateHorizontal(p.vx, horizontal, this.config.speed * (p.crouching ? 0.45 : 1), dt, this.config.moveAccelerationTime);
      p.vy = Math.min(this.config.maxFall, p.vy + this.config.gravity * dt);
    }
    p.x += p.vx * dt;
    for (const b of colliders)
      if (overlap(p, b)) {
        if (p.vx > 0) p.x = b.x - p.w;
        else if (p.vx < 0) p.x = b.x + b.w;
        p.vx = 0;
        if (dashing) p.dashX = 0;
      }
    p.x = clamp(p.x, 0, this.room.cols * T - p.w);
    const oldTop = p.y,
      oldBottom = p.y + p.h;
    p.y += p.vy * dt;
    p.grounded = false;
    p.support = null;
    const landings = colliders
      .filter((b) => p.vy >= 0 && oldBottom <= b.y + 0.1 && overlap(p, b))
      .sort((a, b) => a.y - b.y || b.priority - a.priority);
    if (landings.length) {
      const b = landings[0];
      p.y = b.y - p.h;
      p.vy = 0;
      p.grounded = true;
      p.support = b.id;
      p.launched = false;
      if (dashing) p.dashY = 0;
    } else if (p.vy < 0)
      for (const b of colliders)
        if (oldTop >= b.y + b.h - 0.1 && overlap(p, b)) {
          p.y = b.y + b.h;
          p.vy = 0;
          if (dashing) p.dashY = 0;
          break;
        }
    if (p.grounded && !wasGrounded) {
      p.freeDash = true;
      p.dashCount = 0;
      p.paidDashUsed = false;
      this.emit('land');
    }
    if (p.y < 0) {
      p.y = 0;
      p.vy = 0;
      if (dashing) p.dashY = 0;
    }
    if (p.y > this.room.rows * T + 80) {
      if (this.developer.lockHealth) {
        // Recover a fall without resetting the round, resources or death count.
        Object.assign(p, { x: this.checkpoint.spawn?.x ?? this.entry.x * T + 4,
          y: this.checkpoint.spawn?.y ?? this.entry.y * T + 4,
          vx: 0, vy: 0, dash: 0, rail: null, launched: false,
          grounded: false, support: null, coyote: 0, buffer: 0 });
        return;
      }
      this.retry('掉出房间');
      return;
    }
    for (const o of this.room.objects) {
      if (!this.developer.lockHealth && o.type === 'common.spike' && Spikes.touches(p, this.objectRect(o), o.params.direction)) {
        this.retry('碰到尖刺');
        return;
      }
      this.tryCollect(o);
    }
    this.triggerObjects(oldBottom);
    this.updateAI(dt, this.colliders());
    if (this.player !== p) return;
    for (const exit of this.room.exits)
      if (
        this.exitCooldown === 0 &&
        overlap(p, { x: exit.x * T, y: exit.y * T, w: exit.w * T, h: exit.h * T })
      ) {
        const edge = this.course.connections.find(
          (w) => w.from.roomId === this.room.id && w.from.exitId === exit.id,
        );
        if (edge) {
          const from = this.room.id;
          this.loadRoom(
            edge.to.roomId,
            edge.to.entryId,
            {
              tokens: this.tokens,
              charges: this.charges,
              recharge: this.recharge,
              freeDash: p.freeDash,
              dashCount: p.dashCount,
              paidDashUsed: p.paidDashUsed,
            },
            edge.velocity === 'keep' ? { vx: p.vx, vy: p.vy } : null,
          );
          this.emit('room-change', { from, to: edge.to.roomId });
        } else {
          this.score += 50000;
          this.mode = 'won';
          this.emit('finish');
        }
        return;
      }
    this.recordTrails();
  }
  recordTrails() {
    const pc = center(this.player),
      last = this.playerTrail.at(-1);
    if (!last || Math.hypot(last.x - pc.x, last.y - pc.y) > 5) this.playerTrail.push(pc);
    if (this.ai.active) {
      const a = { x: this.ai.x, y: this.ai.y },
        tail = this.aiTrail.at(-1);
      if (!tail || Math.hypot(tail.x - a.x, tail.y - a.y) > 5)
        this.aiTrail.push({ ...a, break: !!tail && Math.hypot(tail.x - a.x, tail.y - a.y) > 160 });
    }
    if (this.playerTrail.length > 1300) this.playerTrail.shift();
    if (this.aiTrail.length > 1300) this.aiTrail.shift();
  }
  snapshot() {
    return {
      mode: this.mode,
      courseId: this.course.id,
      roomId: this.room.id,
      entryId: this.entry.id,
      cols: this.room.cols,
      rows: this.room.rows,
      tokens: this.tokens,
      charges: this.charges,
      recharge: this.recharge,
      score: this.score,
      deaths: this.deaths,
      steals: this.steals,
      elapsed: this.elapsed,
      roomTime: this.roomTime,
      respawnRemaining: this.respawnRemaining,
      checkpointId: this.checkpoint.id,
      developer: { ...this.developer },
      player: clone(this.player),
      ai: { ...this.ai, trail: undefined, trailLength: this.ai.trail.length },
      courseState: clone(this.courseState),
      objects: Object.fromEntries(this.objectStates),
      zones: Object.fromEntries(this.zoneStates),
      events: this.events.slice(),
    };
  }
}
module.exports = { Engine, CONFIG: Performance.defaults, direction };
