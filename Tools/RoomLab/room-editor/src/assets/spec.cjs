'use strict';
// Demo artwork specification v1. This module is the editor-side single source of
// truth for canvas sizes, slots, animation timing and the intended collision
// hint. It never rewrites existing asset metadata, IDs, bindings or saves: the
// checks below only describe what a calibrated replacement should look like.
const PPU = 32,
  TILE = 32,
  SCREEN = { width: 1920, height: 1080 },
  WORLD = { width: 640, height: 360 },
  ZOOM = 3,
  CAMERA_SIZE = 5.625,
  PLAYER_PIVOT = { x: 0.5, y: 0.125 },
  PLAYER_FOOT = 8;
const CANVAS = Object.freeze({
  tile: { width: 32, height: 32 },
  pad: { width: 32, height: 8 },
  player: { width: 32, height: 64 },
  dust: { width: 32, height: 32 },
  tokenSmall: { width: 10, height: 10 },
  tokenBig: { width: 18, height: 18 },
  spike: { width: 32, height: 32 },
  backgroundFar: { width: 512, height: 512 },
  backgroundMid: { width: 1920, height: 360 },
});
// Frame counts/FPS/play rules from the specification. Keep this table the only
// copy so import inference, UI hints and future previews cannot drift.
const ANIMATIONS = Object.freeze({
  idle: { frames: 4, fps: 6, loop: true },
  run: { frames: 6, fps: 10, loop: true },
  jump: { frames: 2, fps: 10, loop: false, holdLast: true },
  fall: { frames: 2, fps: 6, loop: true },
  dash: { frames: 2, fps: 14, loop: false, holdLast: true, afterimage: true },
  crouch: { frames: 2, fps: 10, loop: false, frame0Seconds: 0.1, holdLast: true },
  death: { frames: 4, fps: 10, loop: false, holdLast: true, respawnSeconds: 0.9 },
  landdust: { frames: 4, fps: 12, loop: false, fade: true },
  jumpdust: { frames: 3, fps: 12, loop: false, fade: true },
});
const PLAYER_ACTIONS = Object.keys(ANIMATIONS);
const DUST_ACTIONS = ['landdust', 'jumpdust'];
// Canvas, slots and the visual collision target for every slot the editor can
// currently bind. `collision` is the specification target, not a runtime change;
// the room canvas still reads each plugin's actual collider.
const TYPES = {
  'common.solid': { name: '固定地形', canvas: CANVAS.tile, slots: ['idle'], collision: 'tile' },
  'physics.ice': {
    name: '冰块',
    canvas: CANVAS.tile,
    slots: ['solid', 'cracked', 'melted'],
    collision: 'tile',
  },
  'physics.jet': {
    name: '喷气板',
    canvas: CANVAS.pad,
    slots: ['idle', 'active'],
    collision: 'pad',
    visualPad: true,
  },
  'physics.thermal': {
    name: '温控板',
    canvas: CANVAS.pad,
    slots: ['cold', 'hot'],
    collision: 'pad',
    visualPad: true,
  },
  'physics.rail': {
    name: '电磁轨道',
    canvas: CANVAS.pad,
    slots: ['idle', 'active'],
    collision: 'pad',
    visualPad: true,
  },
  'calculus.integral': {
    name: '积分板',
    canvas: CANVAS.pad,
    slots: ['idle', 'active'],
    collision: 'pad',
    visualPad: true,
  },
  'calculus.derivative': {
    name: '求导板',
    canvas: CANVAS.pad,
    slots: ['idle', 'active'],
    collision: 'pad',
    visualPad: true,
  },
  'slacker.checkin': {
    name: '签到板',
    canvas: CANVAS.tile,
    slots: ['idle', 'active'],
    collision: 'pad',
    note: '视觉 32×32；碰撞仅为底部 32×8，不随视觉放大。',
  },
  'slacker.awake': {
    name: '清醒板',
    canvas: CANVAS.pad,
    slots: ['idle', 'active'],
    collision: 'pad',
    visualPad: true,
  },
  'slacker.teacher': {
    name: '巡查老师',
    canvas: CANVAS.tile,
    slots: ['idle', 'active'],
    collision: 'none',
  },
  'common.aiStart': { name: 'AI 启动板', canvas: CANVAS.tile, slots: ['idle'], collision: 'tile' },
  'common.aiStartHollow': {
    name: 'AI 启动板 · 空心',
    canvas: CANVAS.tile,
    slots: ['idle'],
    collision: 'none',
  },
  'common.aiSpawn': {
    name: 'AI 出现点',
    canvas: CANVAS.tile,
    slots: ['idle'],
    collision: 'none',
  },
  'common.checkpoint': {
    name: '存档点',
    canvas: CANVAS.tile,
    slots: ['idle', 'active'],
    collision: 'none',
    bottomAligned: true,
  },
  'common.portalIn': {
    name: 'AI 传送入口',
    canvas: CANVAS.tile,
    slots: ['idle'],
    collision: 'tile',
  },
  'common.portalOut': {
    name: 'AI 传送出口',
    canvas: CANVAS.tile,
    slots: ['idle'],
    collision: 'tile',
  },
  'common.assignmentSubmit': {
    name: '提交作业',
    canvas: CANVAS.tile,
    slots: ['idle', 'active'],
    collision: 'pad',
  },
  'common.coin': { name: '大 token', canvas: CANVAS.tokenBig, slots: ['idle'], collision: 'none' },
  'common.small': {
    name: '小 token',
    canvas: CANVAS.tokenSmall,
    slots: ['idle'],
    collision: 'none',
  },
  'common.collectible': {
    name: '收藏品',
    canvas: CANVAS.tokenBig,
    slots: ['idle'],
    collision: 'none',
  },
  'common.spike': {
    name: '尖刺',
    canvas: CANVAS.spike,
    slots: ['idle'],
    collision: 'hazard-circle',
    note: '非实体；伤害圆半径 11px，圆心在朝向边中点。',
  },
  'item.coffee': { name: '咖啡', canvas: CANVAS.tile, slots: ['idle'], collision: 'none' },
  'item.calculator': { name: '计算器', canvas: CANVAS.tile, slots: ['idle'], collision: 'none' },
  'item.phone': { name: '手机', canvas: CANVAS.tile, slots: ['idle'], collision: 'none' },
  'item.icedTea': { name: '冰红茶', canvas: CANVAS.tile, slots: ['idle'], collision: 'none' },
  background: {
    name: '远景背景',
    canvas: CANVAS.backgroundFar,
    slots: ['far'],
    collision: 'none',
    scene: true,
  },
  backgroundMid: {
    name: '中景曲线 / 公式',
    canvas: CANVAS.backgroundMid,
    slots: ['mid'],
    collision: 'none',
    scene: true,
  },
  player: { name: '角色', canvas: CANVAS.player, slots: PLAYER_ACTIONS, collision: 'none' },
  dust: { name: '角色灰尘', canvas: CANVAS.dust, slots: DUST_ACTIONS, collision: 'none' },
};
const CANONICAL = {
  'common.solid': { idle: 'common_solid.png' },
  'physics.ice': {
    solid: 'physics_ice_solid.png',
    cracked: 'physics_ice_cracked.png',
    melted: 'physics_ice_melted.png',
  },
  'physics.jet': { idle: 'physics_jet_idle.png', active: 'physics_jet_active.png' },
  'physics.thermal': { cold: 'physics_thermal_cold.png', hot: 'physics_thermal_hot.png' },
  'physics.rail': { idle: 'physics_rail_idle.png', active: 'physics_rail_active.png' },
  'calculus.integral': { idle: 'calculus_integral.png', active: 'calculus_integral.png' },
  'calculus.derivative': { idle: 'calculus_derivative.png', active: 'calculus_derivative.png' },
  'slacker.checkin': {
    idle: 'slacker_checkin_idle.png',
    active: 'slacker_checkin_active.png',
  },
  'slacker.awake': { idle: 'slacker_awake_idle.png', active: 'slacker_awake_active.png' },
  'slacker.teacher': { idle: 'slacker_teacher_idle.png', active: 'slacker_teacher_active.png' },
  'common.aiStart': { idle: 'common_aistart.png' },
  'common.aiStartHollow': { idle: 'common_aistart_hollow.png' },
  'common.aiSpawn': { idle: 'common_aispawn.png' },
  'common.checkpoint': {
    idle: 'common_checkpoint_idle.png',
    active: 'common_checkpoint_active.png',
  },
  'common.portalIn': { idle: 'common_portalin.png' },
  'common.portalOut': { idle: 'common_portalout.png' },
  'common.assignmentSubmit': {
    idle: 'common_assignmentsubmit_idle.png',
    active: 'common_assignmentsubmit_active.png',
  },
  'common.coin': { idle: 'token_big.png' },
  'common.small': { idle: 'token_small.png' },
  'common.collectible': { idle: 'token_big.png' },
  'common.spike': { idle: 'common_spike.png' },
  background: { far: 'bg_far_tile_a.png' },
  backgroundMid: { mid: 'bg_mid.png' },
};
const CATEGORY = {
  'common.solid': 'terrain',
  background: 'scene',
  backgroundMid: 'scene',
  player: 'character',
  dust: 'character',
};
function categoryForType(type) {
  if (CATEGORY[type]) return CATEGORY[type];
  if (
    type.startsWith('physics.') ||
    type.startsWith('calculus.') ||
    type.startsWith('slacker.') ||
    [
      'common.aiStart',
      'common.aiStartHollow',
      'common.aiSpawn',
      'common.assignmentSubmit',
      'common.portalIn',
      'common.portalOut',
    ].includes(type)
  )
    return 'mechanism';
  if (type.startsWith('item.') || type.startsWith('common.')) return 'item';
  return 'unsorted';
}
function forType(type) {
  return TYPES[type] || null;
}
function forSlot(type, slot) {
  const spec = forType(type);
  if (!spec) return null;
  return {
    ...spec,
    type,
    slot,
    canonical: CANONICAL[type]?.[slot] || null,
  };
}
function animation(action) {
  return ANIMATIONS[action] || null;
}
function baseName(value) {
  return String(value || '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '');
}
function lowerName(value) {
  return baseName(value).toLowerCase();
}
// Canonical filename -> slot. Accepts both the file name alone and a project
// relative path. Unknown artwork returns null so old/imported names keep their
// existing stored folder and are never rebound silently.
function infer(value) {
  const name = lowerName(value).replace(/^seed-/, '');
  const table = [
    [/^common_solid(?:_[bc])?$/, 'common.solid', 'idle'],
    [/^physics_ice_(solid|cracked|melted)$/, 'physics.ice', null],
    [/^physics_jet_(idle|active)$/, 'physics.jet', null],
    [/^physics_thermal_(cold|hot)$/, 'physics.thermal', null],
    [/^physics_rail_(idle|active)$/, 'physics.rail', null],
    [/^calculus_(integral|derivative)$/, null, null],
    [/^slacker_checkin_(idle|active)$/, 'slacker.checkin', null],
    [/^slacker_awake_(idle|active)$/, 'slacker.awake', null],
    [/^slacker_teacher_(idle|active)$/, 'slacker.teacher', null],
    [/^common_aistart$/, 'common.aiStart', 'idle'],
    [/^common_aistart_hollow$/, 'common.aiStartHollow', 'idle'],
    [/^common_aispawn$/, 'common.aiSpawn', 'idle'],
    [/^common_checkpoint_(idle|active)$/, 'common.checkpoint', null],
    [/^common_portalin$/, 'common.portalIn', 'idle'],
    [/^common_portalout$/, 'common.portalOut', 'idle'],
    [/^common_spike$/, 'common.spike', 'idle'],
    [/^token_small$/, 'common.small', 'idle'],
    [/^token_big$/, 'common.coin', 'idle'],
    [/^bg_far_tile(?:_[a-z])?$/, 'background', 'far'],
    [/^bg_mid$/, 'backgroundMid', 'mid'],
  ];
  for (const [pattern, type, slot] of table) {
    const match = pattern.exec(name);
    if (!match) continue;
    let resolvedType = type;
    if (!resolvedType && /^calculus_/.test(name))
      resolvedType = name.startsWith('calculus_integral')
        ? 'calculus.integral'
        : 'calculus.derivative';
    const resolvedSlot = slot || match[1] || 'idle';
    return {
      type: resolvedType,
      slot: resolvedSlot,
      category: categoryForType(resolvedType),
      subcategory: resolvedType,
      canonical: CANONICAL[resolvedType]?.[resolvedSlot] || null,
    };
  }
  const player = /^player_([a-z]+)(?:_(\d{2}))?$/.exec(name);
  if (player && ANIMATIONS[player[1]]) {
    const action = player[1];
    const dust = DUST_ACTIONS.includes(action);
    const frame = player[2] ? Number(player[2]) : null;
    return {
      type: dust ? 'dust' : 'player',
      slot: action,
      category: 'character',
      subcategory: dust ? 'player.dust' : 'player',
      animation: action,
      frame,
      canonical:
        (dust ? 'player_' : 'player_') +
        action +
        (frame === null ? '' : '_' + String(frame).padStart(2, '0')) +
        '.png',
    };
  }
  return null;
}
// Frame metadata for an imported file. A named atlas without a frame suffix is
// split into 32x64 (player) or 32x32 (dust) frames at the specification FPS; an
// individual `_00` frame keeps the whole image and only carries the FPS hint.
function importFrames(value, width, height) {
  const inferred = infer(value);
  if (!inferred || !inferred.animation) return null;
  const action = inferred.animation,
    info = ANIMATIONS[action],
    dust = DUST_ACTIONS.includes(action);
  if (inferred.frame !== null)
    return {
      animation: action,
      frame: inferred.frame,
      frameWidth: 0,
      frameHeight: 0,
      fps: info.fps,
    };
  const frameWidth = CANVAS.player.width,
    frameHeight = dust ? CANVAS.dust.height : CANVAS.player.height,
    columns = Math.max(1, Math.floor(Number(width || 0) / frameWidth)),
    rows = Math.max(1, Math.floor(Number(height || 0) / frameHeight));
  return {
    animation: action,
    frameWidth,
    frameHeight,
    fps: info.fps,
    frames: columns * rows,
  };
}
function dimensionIssues(asset, type) {
  const spec = forType(type);
  if (!spec) return [];
  const width = Number(asset.width),
    height = Number(asset.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  if (width === spec.canvas.width && height === spec.canvas.height) return [];
  return [
    `${asset.name || asset.path || '素材'} 当前 ${width}×${height}，规范 ${spec.canvas.width}×${spec.canvas.height}`,
  ];
}
function namingIssues(asset) {
  const raw = baseName(asset.name || asset.path);
  if (!raw) return [];
  const issues = [];
  if (/[^\x00-\x7F]/.test(raw)) issues.push('文件名含非 ASCII 字符');
  if (/[A-Z]/.test(raw)) issues.push('文件名需全小写');
  if (/[\s()（）]/.test(raw)) issues.push('文件名不能含空格或括号');
  if (/-/.test(raw)) issues.push('文件名分隔符用下划线');
  for (const match of raw.matchAll(/_(\d+)(?=_|$)/g))
    if (match[1].length !== 2) issues.push('帧号需两位数字，如 _00');
  return issues;
}
function expectedName(type, slot, fallback) {
  return CANONICAL[type]?.[slot] || fallback || null;
}
// Describe an asset against the calibration spec. Results are advisory only:
// pre-existing artwork is marked legacy and is still accepted/rendered.
function check(asset, options = {}) {
  const inferred = infer(asset?.name || asset?.path || '');
  const type = options.type || asset?.subcategory || inferred?.type || null;
  const slot = options.slot || inferred?.slot || null;
  const spec = forType(type);
  if (!spec || type === 'player' || type === 'dust') {
    if (inferred?.animation) {
      const info = animation(inferred.animation),
        dust = DUST_ACTIONS.includes(inferred.animation),
        frameWidth = Number(asset?.frameWidth) || 0,
        frameHeight = Number(asset?.frameHeight) || 0,
        target = dust ? CANVAS.dust : CANVAS.player,
        canvas = frameWidth && frameHeight ? { width: frameWidth, height: frameHeight } : target;
      const warnings = [];
      if (asset && frameWidth && frameHeight) {
        if (frameWidth !== target.width || frameHeight !== target.height)
          warnings.push(`单帧 ${frameWidth}×${frameHeight}，规范 ${target.width}×${target.height}`);
      } else if (asset && (asset.width !== target.width || asset.height !== target.height))
        warnings.push(`当前 ${asset.width}×${asset.height}，规范 ${target.width}×${target.height}`);
      return {
        status: warnings.length ? 'legacy' : 'ok',
        type,
        slot,
        expected: canvas,
        actual: asset ? { width: asset.width, height: asset.height } : null,
        animation: { ...info, action: inferred.animation },
        issues: [],
        warnings,
        canonical: inferred.canonical,
        label:
          `${inferred.animation} · ${info.frames} 帧 / ${info.fps} FPS` +
          (warnings.length ? ' · ' + warnings.join('；') : ''),
      };
    }
    return null;
  }
  const issues = dimensionIssues(asset || {}, type),
    warnings = namingIssues(asset || {}),
    builtIn = String(asset?.id || '').startsWith('seed-');
  const status = issues.length ? 'warn' : warnings.length && !builtIn ? 'legacy' : 'ok';
  const canonical = expectedName(type, slot, inferred?.canonical);
  const actual =
    asset && Number.isFinite(Number(asset.width)) && Number(asset.width) > 0
      ? { width: Number(asset.width), height: Number(asset.height) }
      : null;
  const label = actual
    ? `${actual.width}×${actual.height} · 规范 ${spec.canvas.width}×${spec.canvas.height}`
    : `规范 ${spec.canvas.width}×${spec.canvas.height}`;
  return {
    status,
    type,
    slot,
    expected: spec.canvas,
    actual,
    issues,
    warnings,
    canonical,
    note: spec.note || '',
    collision: spec.collision,
    label,
  };
}
// The actual collision hint drawn by the editor. It follows the running plugin
// definition (not the target spec) so a preview can never promise collisions the
// shared engine does not implement.
function collisionShape(type, definition = {}, object = {}) {
  if (type === 'common.spike')
    return {
      kind: 'circle',
      radius: Math.min(TILE, TILE) / 2 - 5,
      direction: ['up', 'down', 'left', 'right'].includes(object.params?.direction)
        ? object.params.direction
        : 'up',
    };
  if (definition.collider === false) return { kind: null };
  if (definition.collider === 'pad')
    return { kind: 'rect', width: TILE, height: 8, anchor: 'bottom' };
  return { kind: 'rect', width: TILE, height: TILE, anchor: 'cell' };
}
function visualSize(type, asset) {
  const spec = forType(type);
  if (!spec) return null;
  const width = Number(asset?.width),
    height = Number(asset?.height);
  if (type === 'common.small') return CANVAS.tokenSmall;
  if (['common.coin', 'common.collectible'].includes(type)) return CANVAS.tokenBig;
  if (spec.visualPad) {
    // Calibrated 32x8 pads draw as a bottom strip. Older square/64px artwork is
    // shown at its authored cell size so legacy previews do not collapse.
    if (!asset || (Number.isFinite(height) && height <= 8)) return CANVAS.pad;
    return null;
  }
  if (!asset || (width === spec.canvas.width && height === spec.canvas.height)) return spec.canvas;
  // Legacy artwork keeps its cell-sized preview.
  return null;
}
module.exports = {
  PPU,
  TILE,
  SCREEN,
  WORLD,
  ZOOM,
  CAMERA_SIZE,
  PLAYER_PIVOT,
  PLAYER_FOOT,
  CANVAS,
  ANIMATIONS,
  PLAYER_ACTIONS,
  DUST_ACTIONS,
  TYPES,
  CANONICAL,
  forType,
  forSlot,
  animation,
  infer,
  importFrames,
  check,
  collisionShape,
  visualSize,
  categoryForType,
};
