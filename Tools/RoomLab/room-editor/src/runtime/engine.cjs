'use strict';
const M = require('../project/model.cjs'),
  Registry = require('../plugins/registry.cjs'),
  { clone, overlap, center, clamp, rotate } = require('../shared/utils.cjs');
const T = 32;
const Performance = require('../project/performance.cjs');
const Temperature = require('../project/temperature.cjs');
const Collision = require('../project/collision.cjs');
const Motion = require('../project/brick-motion.cjs');
const MapCompat = require('../project/map-compat.cjs');
const ItemState = require('./item-state.cjs');
function direction(input, face) {
  let x = Number(!!input.right) - Number(!!input.left),
    y = input.up ? -1 : input.down ? 1 : 0;
  if (!x && !y) x = face;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}
class Engine {
  constructor(project, courseId, roomId, entryId, options = {}) {
    // 只做项目级结构检查；房间内容（含缺失插件）延迟到 loadRoom 按目标房间校验，
    // 避免旧存档中未试玩的房间阻塞当前房间。
    if (
      !project ||
      project.version !== 2 ||
      !Array.isArray(project.courses) ||
      !project.courses.length
    )
      throw new Error('项目版本或大关列表无效。');
    this.config = Performance.resolve(project.settings);
    this.paidStockCap = 1;
    this.project = clone(project);
    this.course = this.project.courses.find((c) => c.id === courseId) || this.project.courses[0];
    this.elapsed = 0;
    this.score = 0;
    this.deaths = 0;
    this.steals = 0;
    this.events = [];
    this.credited = new Set();
    this.developerMode = options.developerMode === true;
    // 项目级初始道具状态（可序列化），然后才是编辑器试玩背包：
    //   options.playtest = { mode:'configured'|'legacy-all', items:[itemType] }
    // 试玩背包是“进入时拥有哪些”的完整覆盖：显式配置（含空勾选）与旧版全道具
    // 都不叠加 project.itemState.initial；只有正常成品流程使用项目初始状态。
    this.items = ItemState.initial(this.project);
    this.itemCollects = [];
    const playtest = options.playtest || null;
    if (playtest && playtest.mode === 'configured') {
      this.items = {};
      for (const type of playtest.items || []) this.items[type] = 1;
    } else if (this.developerMode && (!playtest || playtest.mode === 'legacy-all')) {
      // 旧存档兼容：房间没有 playtestItems 配置时沿用旧的“全道具”试玩。
      this.items = {};
      for (const definition of Registry.all()) if (definition.item) this.items[definition.type] = 1;
    }
    this.roomCaches = new Map();
    this.lifeBaselines = new Map();
    this.courseState = {
      aiActive: false,
      aiTier: 0,
      aiId: this.course.aiId,
      phase: 'slow',
      life: 1,
    };
    this.loadRoom(roomId || this.course.rooms?.[0]?.id, entryId, {
      tokens: 0,
      charges: 0,
      recharge: 0,
      freeDash: true,
      dashCount: 0,
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
  hasItem(type) {
    return (this.items?.[type] || 0) > 0;
  }
  // 运行时全局道具状态接口：跨房间保留，可选快照 / 恢复。
  itemState() {
    return ItemState.snapshot(this);
  }
  restoreItemState(state) {
    return ItemState.restore(this, state);
  }
  takeHalfTokens() {
    const before = this.tokens,
      lost = Math.ceil(before / 2);
    this.tokens = Math.max(0, before - lost);
    return { before, lost, remaining: this.tokens };
  }
  attachmentOffset(o) {
    const owner = o.attachmentTo && this.room.movables.find((b) => b.id === o.attachmentTo);
    if (!owner || !this.movableStates?.has(owner.id)) return { x: 0, y: 0 };
    const rect = this.movableRect(owner);
    return { x: rect.x - owner.x * T, y: rect.y - owner.y * T };
  }
  // World rect of any authored cell shape (entry, exit, tile, object). Grouped
  // ports persist their authored origin in the save file; the runtime adds the
  // owning mechanism's live offset, so drawing, overlap, re-entry and the
  // spawn-time exit suppression all read the same geometry.
  attachedRect(item, fallbackW = 1, fallbackH = 1) {
    const offset = this.attachmentOffset(item);
    return {
      id: item.id,
      x: item.x * T + offset.x,
      y: item.y * T + offset.y,
      w: (item.w || fallbackW) * T,
      h: (item.h || fallbackH) * T,
    };
  }
  entryRect(entry) {
    return this.attachedRect(entry, 1, 1);
  }
  exitRect(exit) {
    return this.attachedRect(exit, 1, 1);
  }
  // Off-screen rooms are frozen in roomCaches. Re-entry can still point at a
  // grouped source exit, so resolve its offset from that room's cached movable
  // states instead of the live destination room.
  cachedAttachmentOffset(room, states, item) {
    const owner = item.attachmentTo && room.movables.find((b) => b.id === item.attachmentTo);
    if (!owner) return { x: 0, y: 0 };
    const state = states instanceof Map ? states.get(owner.id) : states?.[owner.id];
    if (!state) return { x: 0, y: 0 };
    const pad = room.objects.find((o) => o.id === owner.padId);
    let pos;
    if (pad?.type === 'legacy.rotor') {
      const pivot = { x: (pad.x + 0.5) * T, y: pad.y * T },
        p = rotate((owner.x + 0.5) * T, (owner.y + 0.5) * T, pivot.x, pivot.y, state.angle || 0);
      return { x: p.x - T / 2 - owner.x * T, y: p.y - T / 2 - owner.y * T };
    }
    pos = owner.motionPath
      ? Motion.position(owner, state.pathTime || 0)
      : {
          x: owner.x + (owner.targetX - owner.x) * (state.progress || 0),
          y: owner.y + (owner.targetY - owner.y) * (state.progress || 0),
        };
    return { x: pos.x * T - owner.x * T, y: pos.y * T - owner.y * T };
  }
  cachedExitRect(room, states, exit) {
    const offset = this.cachedAttachmentOffset(room, states, exit);
    return {
      id: exit.id,
      x: exit.x * T + offset.x,
      y: exit.y * T + offset.y,
      w: (exit.w || 1) * T,
      h: (exit.h || 1) * T,
    };
  }
  worldObject(o) {
    const runtime = Registry.get(o.type).runtimePosition?.(o, this.objectStates?.get(o.id));
    if (runtime) return { ...o, x: runtime.x, y: runtime.y };
    const d = this.attachmentOffset(o);
    if (!d.x && !d.y) return o;
    return {
      ...o,
      x: o.x + d.x / T,
      y: o.y + d.y / T,
      params: o.params?.path
        ? {
            ...o.params,
            path: o.params.path.map((p) => ({ ...p, x: p.x + d.x / T, y: p.y + d.y / T })),
          }
        : o.params,
    };
  }
  objectRect(o) {
    const world = this.worldObject(o);
    return {
      id: o.id,
      x: world.x * T,
      y: world.y * T,
      w: (o.w || 1) * T,
      h: (o.h || 1) * T,
      kind: o.attachmentTo ? 'movable' : 'object',
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
          ? Temperature.at(
              this.room,
              this.worldObject(target),
              this.zoneStates,
              this.roomEnvironment,
            )
          : this.zoneStates.get(target.params.zoneId) || this.roomEnvironment,
      setTemperature: (zoneId, value) => {
        if (zoneId) this.zoneStates.set(zoneId, value);
        else this.roomEnvironment = value;
      },
      hasItem: (type) => this.hasItem(type),
      objectState: (id) => this.objectStates.get(id),
      takeHalfTokens: () => this.takeHalfTokens(),
      retry: (reason) => this.retry(reason),
      actorOverlaps: (target) =>
        overlap(this.player, this.objectRect(target)) ||
        (this.ai.active &&
          overlap({ x: this.ai.x - 12, y: this.ai.y - 14, w: 24, h: 28 }, this.objectRect(target))),
      launchPlayer: (x, y) => this.launchPlayer(x, y),
      launchAI: (target, range, x, y) => this.launchAI(target, range, x, y),
      startRail: (target) => this.startRail(target),
      activateAI: (target) => this.activateAI(target),
      stopAI: () => this.stopAI(),
      addScore: (points, reason) => this.addScore(points, reason),
      setCheckpoint: (target) => this.setCheckpoint(target),
      transformGroup: (target, kind) => this.transformGroup(target, kind),
      emit: (type, data) => this.emit(type, data),
      say: (text) => this.say(text),
    };
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
  loadRoom(id, entryId, resources, carry = null, respawn = null, returnLink = null) {
    // 先解析并校验目标房间，失败时不改变当前房间/缓存。
    const ref = MapCompat.roomRef(this.project, id);
    if (!ref) throw new Error('目标房间不存在');
    const errors = M.validateRoom(this.project, id, { play: true }).errors;
    if (errors.length) throw new Error(errors[0]);
    for (const o of ref.room.objects) {
      const objectErrors = Registry.validateObject(this.project, o);
      if (objectErrors.length) throw new Error(objectErrors[0]);
    }
    if (this.room) this.roomCaches.set(this.room.id, this.serializeRoom());
    const previousCourse = this.course;
    this.course = ref.course;
    // 跨原大关时运行归属跟随目标房间，AI 默认 ID 也跟随目标大关；
    // 显式覆盖过的 aiId（不等于原大关默认值）保留。
    if (
      previousCourse !== this.course &&
      (!this.courseState.aiId || this.courseState.aiId === previousCourse.aiId)
    )
      this.courseState.aiId = this.course.aiId;
    this.room = ref.room;
    for (const o of this.room.objects) o.params = clone(Registry.params(this.project, o));
    this.entry = this.room.entries.find((e) => e.id === entryId) || this.room.entries[0];
    const fromEntry = !(respawn && respawn.roomId === this.room.id);
    let spawn = fromEntry
      ? {
          roomId: this.room.id,
          entryId: this.entry.id,
          x: this.entry.x * T + 4,
          y: this.entry.y * T + 4,
          face: this.entry.face || 1,
        }
      : respawn;
    Object.assign(this, {
      tokens: resources.tokens,
      charges: Math.min(this.paidStockCap, Math.max(0, resources.charges || 0)),
      recharge: resources.recharge,
    });
    this.player = {
      x: spawn.x,
      y: spawn.y,
      w: 24,
      h: 28,
      vx: carry?.vx || 0,
      vy: carry?.vy || 0,
      face: spawn.face || 1,
      grounded: false,
      coyote: 0,
      buffer: 0,
      dash: 0,
      dashX: 0,
      dashY: 0,
      freeDash: resources.freeDash,
      dashCount: resources.dashCount,
      launched: false,
      launchX: 0,
      launchHold: 0,
      rail: null,
      invulnerable: 0.4,
      crouching: false,
      support: null,
    };
    this.entryReturn =
      returnLink && returnLink.entryId === this.entry.id ? clone(returnLink) : null;
    this.entryTriggerArmed = false;
    this.exitTriggerArmed = !spawn.exitId;
    this.suppressedExitId = spawn.exitId || null;
    if (carry && (Math.abs(carry.vx) > 1 || Math.abs(carry.vy) > 1)) {
      this.player.launched = true;
      this.player.launchX = carry.vx;
      this.player.launchHold = Math.abs(carry.vx) > 1 ? 0.3 : 0;
    }
    if (this.room.phase !== 'inherit') this.courseState.phase = this.room.phase; // 仅旧数据兼容：新流程不按阶段切换
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
    // Grouped entries live on the mechanism. The saved entry keeps its authored
    // origin; once the target room's movable states exist, shift the default
    // spawn (and the AI that follows it) by the live attachment offset.
    if (fromEntry) {
      const rect = this.entryRect(this.entry),
        dx = rect.x - this.entry.x * T,
        dy = rect.y - this.entry.y * T;
      if (dx || dy) {
        this.player.x += dx;
        this.player.y += dy;
        this.ai.x += dx;
        this.ai.y += dy;
        this.ai.trail = [center(this.player)];
        spawn.x += dx;
        spawn.y += dy;
      }
    }
    if (!this.lifeBaselines.has(id))
      this.lifeBaselines.set(id, clone(Object.fromEntries(this.objectStates)));
    this.roomTime = 0;
    this.exitCooldown = 0.4;
    this.playerTrail = [];
    this.aiTrail = [];
    this.mode = 'playing';
    this.message = this.room.notes || this.room.name;
    this.messageTime = 5;
    this.checkpoint = {
      resources: {
        tokens: this.tokens,
        charges: this.charges,
        recharge: this.recharge,
        freeDash: this.player.freeDash,
        dashCount: this.player.dashCount,
      },
      score: this.score,
      credited: [...this.credited],
      collects: (this.itemCollects || []).slice(),
      items: clone(this.items),
      course: clone(this.courseState),
      state: this.serializeRoom(),
      spawn: clone(spawn),
      returnLink: this.entryReturn ? clone(this.entryReturn) : null,
    };
    this.emit('room-enter', { entryId: this.entry.id });
  }
  retry(reason = '重试当前房间') {
    const preserved = new Map();
    for (const o of this.room.objects)
      if (o.resetPolicy === 'preserve') preserved.set(o.id, clone(this.objectStates.get(o.id)));
    this.roomCaches.set(this.room.id, this.serializeRoom());
    for (const { room } of MapCompat.listRooms(this.project)) {
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
      entryId = this.entry.id,
      respawn = cp.spawn,
      returnLink = cp.returnLink;
    this.score = cp.score;
    this.credited = new Set(cp.credited);
    this.itemCollects = Array.isArray(cp.collects) ? cp.collects.slice() : [];
    this.items = clone(cp.items || {});
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
    this.loadRoom(roomId, entryId, cp.resources, null, respawn, returnLink);
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
    this.say(reason + '。已恢复最近存档点。');
  }
  reentryPort(p) {
    if (this.suppressedExitId) {
      const exit = this.room.exits.find((item) => item.id === this.suppressedExitId);
      if (!exit || !overlap(p, this.exitRect(exit))) {
        this.exitTriggerArmed = true;
        this.suppressedExitId = null;
      }
    }
    if (!this.entryReturn) return false;
    const entry = this.room.entries.find((item) => item.id === this.entryReturn.entryId);
    if (!entry || entry.allowReturn === false) return false;
    const inside = overlap(p, this.entryRect(entry));
    if (!inside) {
      this.entryTriggerArmed = true;
      return false;
    }
    if (!this.entryTriggerArmed) return false;
    const source = MapCompat.roomRef(this.project, this.entryReturn.roomId)?.room,
      exit = source?.exits.find((item) => item.id === this.entryReturn.exitId);
    if (!source || !exit) {
      this.entryReturn = null;
      return false;
    }
    const from = this.room.id,
      entryId = entry.id,
      sourceExit = this.cachedExitRect(
        source,
        this.roomCaches.get(source.id)?.movables,
        exit,
      ),
      spawn = {
        roomId: source.id,
        exitId: exit.id,
        x: sourceExit.x + Math.max(2, (sourceExit.w - 24) / 2),
        y: sourceExit.y + sourceExit.h - 30,
        face: exit.x <= 1 ? 1 : exit.x + exit.w >= source.cols - 1 ? -1 : 1,
      };
    this.loadRoom(
      source.id,
      source.entries[0]?.id,
      {
        tokens: this.tokens,
        charges: this.charges,
        recharge: this.recharge,
        freeDash: this.player.freeDash,
        dashCount: this.player.dashCount,
      },
      null,
      spawn,
    );
    this.emit('room-change', { from, to: source.id, via: 'entry' });
    this.emit('room-backtrack', { from, to: source.id, entryId, exitId: exit.id });
    return true;
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
        active: b.movingCollision === undefined ? !s.anim : Motion.movingCollision(b, s),
      };
    }
    const pos = b.motionPath
      ? Motion.position(b, s.pathTime || 0)
      : { x: b.x + (b.targetX - b.x) * s.progress, y: b.y + (b.targetY - b.y) * s.progress };
    return {
      id: b.id,
      x: pos.x * T,
      y: pos.y * T,
      w: T,
      h: T,
      kind: 'movable',
      active: Collision.inherited(this.room, b, 'movables', {}, this.movableStates),
    };
  }
  colliders() {
    const result = this.room.tiles
      .filter((t) => Collision.inherited(this.room, t, 'tiles', {}, this.movableStates))
      .map((t) => ({
        id: 'tile-' + t.x + '-' + t.y,
        x: t.x * T + this.attachmentOffset(t).x,
        y: t.y * T + this.attachmentOffset(t).y,
        w: T,
        h: T,
        kind: t.attachmentTo ? 'movable' : 'tile',
        priority: 0,
      }));
    for (const o of this.room.objects) {
      const def = Registry.get(o.type),
        s = this.objectStates.get(o.id);
      const dynamicSolid =
          def.dynamicSolidity && def.isSolid ? def.isSolid(this.context(o), o, s) : null,
        shape =
          dynamicSolid === null
            ? Collision.inherited(this.room, o, 'objects', def, this.movableStates)
              ? def.collider || 'tile'
              : false
            : dynamicSolid
              ? def.collider || 'tile'
              : false;
      if (!shape) continue;
      if (def.collectible && this.credited.has(this.room.id + '/' + o.id)) continue;
      const rect = this.objectRect(o);
      if (shape === 'pad') rect.h = 8;
      rect.priority = shape === 'tile' ? 2 : 1;
      result.push(rect);
    }
    result.push(
      ...this.room.movables
        .filter((b) => Collision.inherited(this.room, b, 'movables', {}, this.movableStates))
        .map((b) => ({ ...this.movableRect(b), priority: 2 }))
        .filter((b) => b.active),
    );
    return result;
  }
  transformGroup(o, kind) {
    const explicitBinding = Motion.isPad(o);
    const pivot = { x: (o.x + 0.5) * T, y: o.y * T };
    for (const b of this.room.movables.filter((b) => b.padId === o.id)) {
      const rect = this.movableRect(b);
      if (
        !explicitBinding &&
        Math.hypot(rect.x + 16 - pivot.x, rect.y + 16 - pivot.y) > (o.params.range || 12) * T
      )
        continue;
      const s = this.movableStates.get(b.id);
      if (explicitBinding && b.motionPath) {
        const end = Motion.duration(b.motionPath),
          at = s.pathTime || 0,
          to = o.params.once || !(s.anim ? s.anim.to > 0 : at > 0) ? end : 0;
        s.anim = at === to ? null : { kind: 'path', to };
        continue;
      }
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
      // A horizontal launch is a short burst, not a single frame: landing used
      // to clear `launched` immediately, so the next frame's walk speed erased
      // it. Keep the momentum for 0.3 s after a horizontal launch; vertical
      // launches still end on landing as before.
      launchHold: Math.abs(Number(x) || 0) > 1 ? 0.3 : 0,
      rail: null,
      dash: 0,
      grounded: false,
      coyote: 0,
      buffer: 0,
    });
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.3);
  }
  launchAI(o, range, x, y) {
    o = this.worldObject(o);
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
  stopAI() {
    const wasActive = this.ai.active;
    this.courseState.aiActive = false;
    Object.assign(this.ai, {
      active: false,
      flight: false,
      vx: 0,
      vy: 0,
      warning: null,
      trail: [],
    });
    this.aiTrail = [];
    if (wasActive) this.emit('ai-stop', { id: this.ai.id });
    return wasActive;
  }
  addScore(points, reason = '') {
    const amount = Number(points);
    if (!Number.isFinite(amount) || amount === 0) return 0;
    this.score += amount;
    this.emit('score', { amount, total: this.score, reason });
    return amount;
  }
  startRail(o) {
    const points = this.worldObject(o).params.path.map((p) => ({ x: p.x * T, y: p.y * T }));
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
    const owner = this.room.objects.find((o) => o.id === r.id);
    if (owner?.attachmentTo)
      r.points = this.worldObject(owner).params.path.map((n) => ({ x: n.x * T, y: n.y * T }));
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
    if (def.requiresItem && !this.hasItem(def.requiresItem)) {
      const required = Registry.get(def.requiresItem).name;
      if (def.silentWithoutItem) {
        // 不清屏、不刷屏：同一方块最多每 3 秒提示一次缺少前置道具。
        if (s && !(s.hintAt > this.elapsed - 3)) {
          s.hintAt = this.elapsed;
          this.say('需要' + required + '才能使用' + (o.name || def.name), 2);
          this.emit('item-needed', { id: o.id, item: def.requiresItem });
        }
      } else {
        this.say('需要' + required + '才能使用' + (o.name || def.name));
        this.emit('item-required', { id: o.id, item: def.requiresItem });
      }
      return false;
    }
    if (s.cooldown > 0 || ((o.trigger?.once || o.params.once) && s.used)) return false;
    const context = this.context(o);
    if (def.canTrigger && !def.canTrigger(context, o, s)) return false;
    s.used = true;
    s.cooldown = o.params.cooldown || o.trigger?.cooldown || 1;
    def.onTrigger?.(context, o, s);
    this.emit('trigger', { id: o.id, type: o.type });
    return true;
  }
  triggerObjects(oldBottom) {
    const p = this.player;
    for (const o of this.room.objects) {
      const d = Registry.get(o.type),
        mode = d.triggerFor?.(o) || o.trigger?.mode || d.trigger;
      if (mode === 'none') continue;
      const s = this.objectStates.get(o.id),
        rect = this.objectRect(o);
      const customOccupied = d.triggerOccupied?.(this.context(o), o, p, rect, oldBottom),
        occupied =
          customOccupied ??
          (overlap(p, rect) ||
            (p.grounded &&
              p.vy >= 0 &&
              oldBottom <= rect.y + 2 &&
              Math.abs(p.y + p.h - rect.y) < 1 &&
              p.x + p.w > rect.x + 2 &&
              p.x < rect.x + rect.w - 2));
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
          Math.hypot(this.ai.x - rect.x - rect.w / 2, this.ai.y - rect.y) <= distance * T);
      s.waitingAI = occupied && !ready;
      if (ready && !s.firedDuringContact && this.fire(o)) s.firedDuringContact = true;
    }
  }
  setCheckpoint(o) {
    if (!o || o.type !== 'common.checkpoint') return;
    o = this.worldObject(o);
    if (this.checkpoint.spawn?.objectId === o.id) return;
    for (const other of this.room.objects) {
      if (other.type !== 'common.checkpoint') continue;
      const otherState = this.objectStates.get(other.id);
      if (otherState) otherState.active = other.id === o.id;
    }
    const state = this.objectStates.get(o.id);
    if (state) state.active = true;
    this.checkpoint = {
      resources: {
        tokens: this.tokens,
        charges: this.charges,
        recharge: this.recharge,
        freeDash: this.player.freeDash,
        dashCount: this.player.dashCount,
      },
      score: this.score,
      credited: [...this.credited],
      collects: (this.itemCollects || []).slice(),
      items: clone(this.items),
      course: clone(this.courseState),
      state: this.serializeRoom(),
      spawn: {
        roomId: this.room.id,
        entryId: this.entry.id,
        objectId: o.id,
        x: o.x * T + Math.max(2, ((o.w || 1) * T - this.player.w) / 2),
        y: Collision.enabled(o, 'objects', Registry.get(o.type))
          ? o.y * T - this.player.h
          : o.y * T + 4,
        face: this.player.face,
      },
      returnLink: this.entryReturn ? clone(this.entryReturn) : null,
    };
    this.say('已记录存档点：' + (o.name || '存档点'), 2);
    this.emit('checkpoint', { id: o.id });
  }
  collect(o) {
    const key = this.room.id + '/' + o.id,
      def = Registry.get(o.type);
    if (this.credited.has(key)) return;
    this.credited.add(key);
    if (def.item) {
      this.items[o.type] = (this.items[o.type] || 0) + 1;
      (this.itemCollects ||= []).push(key);
      this.emit('item-collect', { id: o.id, itemType: o.type, count: this.items[o.type] });
    } else if (o.type === 'common.collectible') this.score += 10000;
    else {
      const n = o.type === 'common.small' ? 1 : 10;
      this.tokens += n;
      this.score += n === 1 ? 100 : 1000;
      if (this.hasItem('item.icedTea')) {
        this.recharge += n;
        while (this.recharge >= 10) {
          this.recharge -= 10;
          this.charges = Math.min(this.paidStockCap, this.charges + 1);
        }
      }
    }
    this.emit('collect', { id: o.id, objectType: o.type });
  }
  catchPlayer() {
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
        if (!exit) continue;
        // Both the trigger radius and the destination come from the same
        // attachment-aware rect the renderer uses, so a grouped portal pair
        // follows its mechanism and never teleports to the authored origin.
        const enter = center(this.objectRect(entry)),
          leave = center(this.objectRect(exit));
        if (
          !a.teleported.includes(entry.params.routeId) &&
          !a.warning &&
          a.processing <= 0 &&
          Math.hypot(a.x - enter.x, a.y - enter.y) < 48
        ) {
          a.warning = {
            remaining: 0.65,
            to: { x: leave.x, y: leave.y },
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
    const world = this.worldObject(o);
    this.ai.id = o.aiId || this.room.aiId || this.course.aiId;
    this.ai.active = true;
    this.ai.processing = 30;
    this.ai.x = (world.x + 0.5) * T + (near ? 20 : 500);
    this.ai.y = world.y * T - 12;
    this.emit('test-ai', { id: oId, near });
  }
  update(dt, input = {}) {
    if (this.mode !== 'playing') return;
    dt = clamp(dt, 0, 1 / 30);
    this.elapsed += dt;
    this.roomTime += dt;
    this.messageTime = Math.max(0, this.messageTime - dt);
    this.exitCooldown = Math.max(0, this.exitCooldown - dt);
    const p = this.player,
      wasGrounded = p.grounded,
      before = this.colliders();
    const spikes = this.room.objects.filter((o) => o.type === 'common.spike');
    const oldSpikes = new Map(spikes.map((o) => [o.id, this.objectRect(o)]));
    for (const o of this.room.objects) {
      const s = this.objectStates.get(o.id);
      s.cooldown = Math.max(0, s.cooldown - dt);
      Registry.get(o.type).tick?.(this.context(o), o, s, dt);
    }
    for (const s of this.movableStates.values())
      if (s.anim) {
        if (s.anim.kind === 'path') {
          const to = s.anim.to,
            at = s.pathTime || 0;
          s.pathTime = at < to ? Math.min(to, at + dt) : Math.max(to, at - dt);
          if (s.pathTime === to) s.anim = null;
          continue;
        }
        s.anim.t = Math.min(0.45, s.anim.t + dt);
        const v = s.anim.from + ((s.anim.to - s.anim.from) * s.anim.t) / 0.45;
        if (s.anim.kind === 'angle') s.angle = v;
        else s.progress = v;
        if (s.anim.t === 0.45) s.anim = null;
      }
    const colliders = this.colliders();
    const hazardMotion = spikes.map((o) => ({
      before: oldSpikes.get(o.id),
      after: this.objectRect(o),
    }));
    const motionResult = require('./moving-solids.cjs').transport(
      p,
      before,
      colliders,
      (actor, t) =>
        spikes.some((o, i) => {
          const a = hazardMotion[i].before,
            b = hazardMotion[i].after;
          return require('./hazards.cjs').spikeContact(actor, o, {
            ...b,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
          });
        }),
      hazardMotion,
    );
    if (motionResult === 'hazard') {
      this.retry('碰到尖刺');
      return;
    }
    if (!motionResult) {
      this.retry('被机关挤压');
      return;
    }
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.launchHold = Math.max(0, (p.launchHold || 0) - dt);
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
      p.dashCount < 3 &&
      (p.freeDash || (this.hasItem('item.icedTea') && this.charges > 0)) &&
      (!p.rail || p.rail.allowExit)
    ) {
      const d = direction(input, p.face),
        free = p.freeDash;
      if (free) p.freeDash = false;
      else this.charges--;
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
            ? horizontal * this.config.speed
            : p.launchX + horizontal * 45
          : horizontal * this.config.speed * (p.crouching ? 0.45 : 1);
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
      if (!p.launchHold) p.launched = false;
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
      this.emit('land');
    }
    if (p.y < 0) {
      p.y = 0;
      p.vy = 0;
      if (dashing) p.dashY = 0;
    }
    if (p.y > this.room.rows * T + 80) {
      this.retry('掉出房间');
      return;
    }
    for (const o of this.room.objects) {
      const rect = this.objectRect(o);
      const solidContact =
        o.collision === true &&
        overlap({ x: p.x - 0.2, y: p.y - 0.2, w: p.w + 0.4, h: p.h + 0.4 }, rect);
      if (o.type === 'common.spike' && require('./hazards.cjs').spikeContact(p, o, rect)) {
        this.retry('碰到尖刺');
        return;
      }
      if (
        Registry.get(o.type).collectible &&
        (!o.params.unlockPadId || this.objectStates.get(o.params.unlockPadId)?.hitAI) &&
        (solidContact || overlap(p, { x: rect.x + 5, y: rect.y + 5, w: 22, h: 22 }))
      )
        this.collect(o);
    }
    for (const o of this.room.objects) {
      const def = Registry.get(o.type),
        state = this.objectStates.get(o.id);
      if (!def.onPlayerContact || state.removed) continue;
      const contact = overlap(p, this.objectRect(o));
      if (!contact) {
        state.playerContact = false;
        continue;
      }
      if (state.playerContact) continue;
      state.playerContact = true;
      if (def.onPlayerContact(this.context(o), o, state) === 'retry') return;
    }
    this.triggerObjects(oldBottom);
    this.updateAI(dt, this.colliders());
    if (this.player !== p) return;
    if (this.reentryPort(p)) return;
    for (const exit of this.room.exits)
      if (
        this.exitTriggerArmed &&
        this.exitCooldown === 0 &&
        overlap(p, this.exitRect(exit))
      ) {
        // 统一地图兼容层：先查项目级全局连接，再回落到原 course.connections，
        // 因此跨原大关连接可运行，旧数据不做迁移也能原样运行。
        const edge = MapCompat.resolve(this.project, this.room.id, exit.id);
        if (edge) {
          const from = this.room.id,
            returnLink = { roomId: from, exitId: exit.id, entryId: edge.to.entryId };
          this.loadRoom(
            edge.to.roomId,
            edge.to.entryId,
            {
              tokens: this.tokens,
              charges: this.charges,
              recharge: this.recharge,
              freeDash: p.freeDash,
              dashCount: p.dashCount,
            },
            edge.velocity === 'keep' ? { vx: p.vx, vy: p.vy } : null,
            null,
            returnLink,
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
      paidStockCap: this.paidStockCap,
      score: this.score,
      developerMode: this.developerMode,
      items: clone(this.items),
      deaths: this.deaths,
      steals: this.steals,
      elapsed: this.elapsed,
      roomTime: this.roomTime,
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
