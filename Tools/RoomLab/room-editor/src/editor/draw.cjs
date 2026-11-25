'use strict';
const Native = require('../project/native-compat.cjs'),
  NativeDraw = require('./native-draw.cjs');
const Motion = require('../project/brick-motion.cjs');
const Registry = require('../plugins/registry.cjs'),
  { clamp } = require('../shared/utils.cjs');
const GraphLayout = require('./graph-layout.cjs');
const Temperature = require('../project/temperature.cjs');
const Collision = require('../project/collision.cjs');
const TeacherLinks = require('../project/teacher-links.cjs');
const AiSpawns = require('../project/ai-spawns.cjs');
const AssetSpec = require('../assets/spec.cjs');
function ghostBorder(ctx, rect) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0d1928';
  ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#96e3ee';
  ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
  ctx.restore();
}
const Nodes = require('../project/rail-nodes.cjs'),
  Regions = require('./region-handles.cjs');
const T = 32,
  images = new Map();
function text(ctx, value, x, y, size = 12, color = '#a9bace', align = 'left') {
  ctx.font = size + 'px Consolas,"Microsoft YaHei",sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(String(value), x, y);
}
function line(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function shortText(ctx, value, width, size) {
  ctx.font = size + 'px Consolas,"Microsoft YaHei",sans-serif';
  const chars = Array.from(String(value));
  if (ctx.measureText(chars.join('')).width <= width) return chars.join('');
  while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
  return chars.join('') + '…';
}
function fit(r, width, height, padding = 22) {
  const scale = Math.min(
    (width - padding * 2) / (r.cols * T),
    (height - padding * 2) / (r.rows * T),
  );
  return { scale, x: (width - r.cols * T * scale) / 2, y: (height - r.rows * T * scale) / 2 };
}
function assetId(project, course, o, slot) {
  return (
    o.assetOverrides?.[slot] ||
    course.artBindings?.[o.type]?.[slot] ||
    project.blockDefaults?.[o.type]?.assets?.[slot] ||
    null
  );
}
function drawImage(ctx, url, rect, asset, time = 0) {
  if (!url) return false;
  let image = images.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    images.set(url, image);
  }
  if (!image.complete || !image.naturalWidth) return false;
  if (asset?.frameWidth && asset?.frameHeight) {
    const cols = Math.max(1, Math.floor(image.naturalWidth / asset.frameWidth)),
      rows = Math.max(1, Math.floor(image.naturalHeight / asset.frameHeight)),
      frame = Math.floor(time * (asset.fps || 6)) % (cols * rows);
    ctx.drawImage(
      image,
      (frame % cols) * asset.frameWidth,
      Math.floor(frame / cols) * asset.frameHeight,
      asset.frameWidth,
      asset.frameHeight,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
  } else ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
  return true;
}
// Draw at the calibrated canvas size when the asset (or its built-in
// placeholder) follows the specification. Legacy artwork keeps the full cell so
// old saves do not suddenly squash or hide their images.
function objectVisualRect(o, asset, def) {
  const x = o.x * T,
    y = o.y * T,
    w = (o.w || 1) * T,
    h = (o.h || 1) * T,
    size = AssetSpec.visualSize(o.type, asset);
  if (!size) return { x, y, w, h };
  if (size.width === w && size.height === h) return { x, y, w, h };
  // Pads and the calibrated awake/check-in visuals sit on the cell bottom.
  if (size.height === 8 && size.width === T) return { x, y: y + h - 8, w: T, h: 8 };
  return {
    x: x + (w - size.width) / 2,
    y: y + (h - size.height) / 2,
    w: size.width,
    h: size.height,
  };
}
// Collision hints are deliberately separate from the artwork rectangle: a
// 32x32 check-in board shows its bottom 32x8 pad, spikes show their 11px damage
// circle, and solid cells show their full cell box.
function drawCollisionHint(ctx, o, def, solid, scale) {
  const shape = AssetSpec.collisionShape(o.type, def, o);
  if (!shape.kind || (!solid && shape.kind !== 'circle')) return;
  const x = o.x * T,
    y = o.y * T,
    w = (o.w || 1) * T,
    h = (o.h || 1) * T;
  ctx.save();
  ctx.lineWidth = Math.max(1, 2 / scale);
  ctx.setLineDash([Math.max(2, 4 / scale), Math.max(2, 3 / scale)]);
  if (shape.kind === 'circle') {
    const direction = shape.direction,
      cx = direction === 'right' ? x : direction === 'left' ? x + w : x + w / 2,
      cy = direction === 'up' ? y + h : direction === 'down' ? y : y + h / 2;
    ctx.strokeStyle = '#f08a68';
    ctx.beginPath();
    ctx.arc(cx, cy, shape.radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape.anchor === 'bottom') {
    ctx.fillStyle = '#74d9d922';
    ctx.fillRect(x + 0.5, y + h - shape.height + 0.5, T - 1, shape.height - 1);
    ctx.strokeStyle = '#9be7d6';
    ctx.strokeRect(x + 0.5, y + h - shape.height + 0.5, T - 1, shape.height - 1);
  } else {
    ctx.strokeStyle = '#9be7d6';
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  ctx.restore();
}
function miniature(ctx, r, x, y, w, h, padding = 4) {
  const v = fit(r, w, h, padding);
  ctx.save();
  ctx.translate(x + v.x, y + v.y);
  ctx.scale(v.scale, v.scale);
  ctx.fillStyle = '#0d1622';
  ctx.fillRect(0, 0, r.cols * T, r.rows * T);
  ctx.fillStyle = '#54748c';
  for (const t of r.tiles) ctx.fillRect(t.x * T, t.y * T, T, T);
  for (const o of r.objects) {
    ctx.fillStyle =
      o.type === 'physics.ice' ? '#73bde4' : o.type === 'common.checkpoint' ? '#e2b85f' : '#6fd4c3';
    ctx.fillRect(o.x * T, o.y * T, T, T);
  }
  NativeDraw.draw(ctx, r, { scale: v.scale, mini: true, targets: false });
  for (const e of r.entries) {
    ctx.fillStyle = '#83cba5';
    ctx.fillRect(e.x * T, e.y * T, T, T);
  }
  for (const e of r.exits) {
    ctx.fillStyle = '#f5b475';
    ctx.fillRect(e.x * T, e.y * T, T, T * e.h);
  }
  ctx.restore();
}
function drawRoom(
  ctx,
  project,
  course,
  r,
  {
    view = null,
    game = null,
    selection = null,
    selections = [],
    selectedBrickNodeIndex = null,
    selectedBrickNodeOwner = null,
    peekBrickPaths = false,
    selectedRailNodeId = null,
    traces = null,
    hover = null,
    targets = true,
    assetURL = () => null,
    grid = true,
    collisionBoxes = false,
    nativeBand = 'all',
    dpr = 1,
  } = {},
) {
  if (r.artBindings)
    course = { ...course, artBindings: { ...course.artBindings, ...r.artBindings } };
  // Logical (CSS) size: the backing store is device pixels, so dividing by the
  // ratio keeps the view transform in CSS units and the drawing sharp.
  const ratio = Number(dpr) > 0 ? Number(dpr) : 1,
    w = ctx.canvas.width / ratio,
    h = ctx.canvas.height / ratio,
    v = view || fit(r, w, h);
  ctx.fillStyle = '#09121d';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  // Pixel-art previews use nearest-neighbour sampling at every zoom level.
  ctx.imageSmoothingEnabled = false;
  ctx.translate(v.x, v.y);
  ctx.scale(v.scale, v.scale);
  const bg =
    course.artBindings?.background ||
    (project.assets.some((a) => a.id === 'seed-bg-far') ? 'seed-bg-far' : null);
  const backgroundAsset = project.assets.find((a) => a.id === bg);
  if (
    !drawImage(ctx, assetURL(bg), { x: 0, y: 0, w: r.cols * T, h: r.rows * T }, backgroundAsset)
  ) {
    ctx.fillStyle = '#0d1928';
    ctx.fillRect(0, 0, r.cols * T, r.rows * T);
  }
  if (grid) {
    for (let x = 0; x <= r.cols; x++) line(ctx, x * T, 0, x * T, r.rows * T, '#203448');
    for (let y = 0; y <= r.rows; y++) line(ctx, 0, y * T, r.cols * T, y * T, '#203448');
  }
  for (const zone of r.zones) {
    const temp =
      game?.zoneStates?.get(zone.id) ||
      Temperature.initial(r, zone.id, (instance) => Registry.params(project, instance));
    ctx.fillStyle = temp === 'hot' ? '#f69b3828' : '#77bafa28';
    ctx.fillRect(zone.x * T, zone.y * T, zone.w * T, zone.h * T);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = temp === 'hot' ? '#ca9556' : '#668cb9';
    ctx.strokeRect(zone.x * T, zone.y * T, zone.w * T, zone.h * T);
    ctx.setLineDash([]);
    text(
      ctx,
      zone.name + ' / ' + temp,
      zone.x * T + 5,
      zone.y * T + 15,
      10,
      temp === 'hot' ? '#eac29a' : '#a6d7f1',
    );
  }
  for (const source of r.tiles) {
    const t = game?.worldObject?.(source) || source;
    const tileObject = { type: 'common.solid', assetOverrides: {} },
      id = assetId(project, course, tileObject, 'idle'),
      a = project.assets.find((a) => a.id === id);
    if (!drawImage(ctx, assetURL(id), { x: t.x * T, y: t.y * T, w: T, h: T }, a)) {
      ctx.fillStyle = '#263d51';
      ctx.fillRect(t.x * T, t.y * T, T, T);
      ctx.strokeStyle = '#7892a7';
      ctx.strokeRect(t.x * T + 0.5, t.y * T + 0.5, T - 1, T - 1);
    }
    if (!Collision.inherited(r, t, 'tiles', {}, game?.movableStates))
      ghostBorder(ctx, { x: t.x * T, y: t.y * T, w: T, h: T });
    if (!game && (t.x < 0 || t.y < 0 || t.x >= r.cols || t.y >= r.rows)) {
      ctx.strokeStyle = '#f17f77';
      ctx.strokeRect(t.x * T, t.y * T, T, T);
    }
  }
  if (!game)
    for (const b of r.movables) {
      const selected = [selection, ...selections].some(
        (s) => s?.kind === 'movables' && s.id === b.id,
      );
      if (!targets && !selected) continue;
      const color = Motion.colorFor(r, b.padId),
        pad = r.objects.find((o) => o.id === b.padId && Motion.isPad(o)),
        path = Motion.nodes(b);
      ctx.setLineDash([4, 4]);
      if (pad && targets) {
        ctx.save();
        ctx.globalAlpha = 0.42;
        line(ctx, (pad.x + 0.5) * T, (pad.y + 0.5) * T, (b.x + 0.5) * T, (b.y + 0.5) * T, color);
        ctx.restore();
      }
      let from = b;
      for (const node of path) {
        line(
          ctx,
          (from.x + 0.5) * T,
          (from.y + 0.5) * T,
          (node.x + 0.5) * T,
          (node.y + 0.5) * T,
          color,
        );
        from = node;
      }
      ctx.setLineDash([]);
      if (selected && path.length) {
        const end = path.at(-1);
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(end.x * T, end.y * T, T, T);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / v.scale;
        ctx.strokeRect(end.x * T, end.y * T, T, T);
        ctx.restore();
      }
    }
  for (const b of r.movables) {
    const rect = game?.movableRect?.(b) || { x: b.x * T, y: b.y * T, w: T, h: T };
    ctx.fillStyle = '#364153';
    ctx.fillRect(rect.x, rect.y, T, T);
    ctx.strokeStyle = !game && targets ? Motion.colorFor(r, b.padId) : '#b9c7d5';
    ctx.strokeRect(rect.x, rect.y, T, T);
    text(ctx, '□', rect.x + 16, rect.y + 23, 16, '#d4e2ec', 'center');
    if (!Collision.inherited(r, b, 'movables', {}, game?.movableStates) || (game && !rect.active))
      ghostBorder(ctx, rect);
  }
  for (const source of r.objects) {
    const o = game?.worldObject?.(source) || source;
    const d = Registry.get(o.type),
      state = game?.objectStates?.get(o.id) || {},
      slot = game
        ? game.visualState(o)
        : o.type === 'physics.ice'
          ? Temperature.at(r, o, null, null, (instance) => Registry.params(project, instance)) ===
            'hot'
            ? 'melted'
            : 'solid'
          : o.type === 'physics.thermal'
            ? Temperature.initial(r, o.params?.zoneId, (instance) =>
                Registry.params(project, instance),
              )
            : d.slots[0],
      id = assetId(project, course, o, slot),
      a = project.assets.find((a) => a.id === id);
    const cellRect = {
        x: o.x * T,
        y: o.y * T,
        w: (o.w || 1) * T,
        h: (o.h || 1) * T,
      },
      rect = objectVisualRect(o, a, d);
    if (d.collectible && game?.credited?.has(r.id + '/' + o.id)) continue;
    if (game && state.removed) continue;
    const checkpoint = o.type === 'common.checkpoint',
      glyph =
        o.type === 'physics.jet'
          ? { up: '↑', down: '↓', left: '←', right: '→', custom: '↗' }[o.params?.direction] ||
            d.glyph
          : d.glyph;
    if (!drawImage(ctx, assetURL(id), rect, a, game?.roomTime || 0)) {
      ctx.fillStyle = checkpoint
        ? slot === 'active'
          ? '#6d532177'
          : '#3b302055'
        : o.type === 'physics.ice'
          ? '#3c81b455'
          : d.collider === 'pad'
            ? '#345e6255'
            : '#344455';
      if (!d.hollow) ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = checkpoint
        ? slot === 'active'
          ? '#ffd66e'
          : '#b89454'
        : o.type === 'physics.ice'
          ? '#a3d8f7'
          : '#78cdb9';
      if (slot === 'melted' || d.hollow) ctx.setLineDash([3, 4]);
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
      ctx.setLineDash([]);
      text(
        ctx,
        glyph,
        rect.x + rect.w / 2,
        rect.y + rect.h * 0.7,
        rect.h <= 10 ? 9 : o.type === 'physics.thermal' ? 17 : 20,
        checkpoint
          ? slot === 'active'
            ? '#fff0b0'
            : '#e6cc8d'
          : o.type === 'physics.ice'
            ? '#bde4f5'
            : '#92e1ce',
        'center',
      );
    }
    if (checkpoint && slot === 'active') {
      ctx.strokeStyle = '#ffe7a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        rect.x + rect.w / 2,
        rect.y + rect.h / 2,
        Math.min(rect.w, rect.h) / 2 - 3,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (o.type === 'physics.rail') {
      ctx.fillStyle = '#7de1d3';
      ctx.fillRect(rect.x - 2, rect.y + rect.h / 2 - 7, 3, 14);
      ctx.fillRect(rect.x + rect.w - 1, rect.y + rect.h / 2 - 7, 3, 14);
    }
    const solid =
      game && d.dynamicSolidity && d.isSolid
        ? d.isSolid(game.context(o), o, state)
        : game
          ? Collision.inherited(r, o, 'objects', d, game.movableStates) &&
            (!d.isSolid || d.isSolid(game.context(o), o, state))
          : Collision.inherited(r, o, 'objects', d, game?.movableStates);
    if (!solid) ghostBorder(ctx, cellRect);
    if (collisionBoxes) drawCollisionHint(ctx, o, d, solid, v.scale);
    if (o.type === 'physics.ice' && game)
      text(
        ctx,
        (state.standing || 0).toFixed(1) + 's',
        rect.x + 16,
        rect.y - 5,
        9,
        '#b9e1ff',
        'center',
      );
    if (!game && (o.x < 0 || o.y < 0 || o.x + (o.w || 1) > r.cols || o.y + (o.h || 1) > r.rows)) {
      ctx.strokeStyle = '#f17f77';
      ctx.lineWidth = 2;
      ctx.strokeRect(cellRect.x, cellRect.y, cellRect.w, cellRect.h);
      ctx.lineWidth = 1;
    }
    if (o.params?.path) {
      ctx.strokeStyle = '#f4c586';
      ctx.beginPath();
      o.params.path.forEach((p, i) =>
        i ? ctx.lineTo(p.x * T, p.y * T) : ctx.moveTo(p.x * T, p.y * T),
      );
      ctx.stroke();
      o.params.path.forEach((p, i) => {
        const active = !game && selection?.id === o.id && p.id === selectedRailNodeId,
          label = Nodes.label(i),
          width = Math.max(20, label.length * 8 + 8),
          height = 20;
        ctx.fillStyle = active ? '#f3ce87' : '#101e2d';
        ctx.fillRect(p.x * T - width / 2, p.y * T - height / 2, width, height);
        ctx.strokeStyle = active ? '#fff0c4' : '#d9ad68';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x * T - width / 2, p.y * T - height / 2, width, height);
        text(ctx, label, p.x * T, p.y * T + 4, 12, active ? '#172231' : '#ffe0a2', 'center');
        ctx.lineWidth = 1;
      });
    }
  }
  if (!game)
    for (const teacher of r.objects.filter(TeacherLinks.isTeacher)) {
      const selected = [selection, ...selections].some(
          (s) => s?.kind === 'objects' && s.id === teacher.id,
        ),
        showBindings = targets || selected,
        min = Math.min(
          teacher.params?.patrolMinX ?? teacher.x,
          teacher.params?.patrolMaxX ?? teacher.x,
        ),
        max = Math.max(
          teacher.params?.patrolMinX ?? teacher.x,
          teacher.params?.patrolMaxX ?? teacher.x,
        );
      ctx.save();
      ctx.strokeStyle = selected ? '#ffd37a' : '#d6a95d99';
      ctx.lineWidth = 2 / v.scale;
      const route = require('../project/teacher-route.cjs').nodes(teacher);
      if (route.length) {
        // Two-dimensional node route: 0 is the teacher, nodes are I..N.
        const points = [
          { x: teacher.x + 0.5, y: teacher.y + 0.5 },
          ...route.map((n) => ({ x: n.x + 0.5, y: n.y + 0.5 })),
        ];
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(p.x * T, p.y * T) : ctx.moveTo(p.x * T, p.y * T)));
        ctx.stroke();
        ctx.setLineDash([]);
        points.forEach((p, i) => {
          ctx.fillStyle = i === 0 ? '#ffd37a' : '#101e2d';
          ctx.fillRect(p.x * T - 9, p.y * T - 9, 18, 18);
          ctx.strokeStyle = selected ? '#ffd37a' : '#d6a95d';
          ctx.strokeRect(p.x * T - 9, p.y * T - 9, 18, 18);
          ctx.fillStyle = selected ? '#1a1206' : '#e7ce9b';
          ctx.font = '11px Consolas,"Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(require('../project/rail-nodes.cjs').label(i), p.x * T, p.y * T + 1);
        });
      } else {
        ctx.setLineDash([6, 4]);
        line(
          ctx,
          (min + 0.1) * T,
          teacher.y * T + T * 0.75,
          (max + 0.9) * T,
          teacher.y * T + T * 0.75,
          ctx.strokeStyle,
        );
        ctx.setLineDash([]);
      }
      if (showBindings)
        for (const checkin of TeacherLinks.checkins(r, teacher)) {
          ctx.strokeStyle = '#e7b86788';
          ctx.setLineDash([4, 4]);
          line(
            ctx,
            (teacher.x + 0.5) * T,
            (teacher.y + 0.5) * T,
            (checkin.x + 0.5) * T,
            (checkin.y + 0.5) * T,
            ctx.strokeStyle,
          );
          ctx.setLineDash([]);
        }
      ctx.restore();
    }
  // Launch pad -> AI spawn point: reuse the same dashed association link as the
  // teacher/check-in binding so the authored reference is visible on the canvas.
  if (!game)
    for (const launchpad of r.objects.filter((o) => AiSpawns.isLaunchpad(o))) {
      const spawn = AiSpawns.target(r, launchpad);
      if (!spawn) continue;
      const selected = [selection, ...selections].some(
        (s) => s?.kind === 'objects' && (s.id === launchpad.id || s.id === spawn.id),
      );
      if (!targets && !selected) continue;
      ctx.save();
      ctx.strokeStyle = selected ? '#c9a8ff' : '#b79cff88';
      ctx.lineWidth = 2 / v.scale;
      ctx.setLineDash([5, 4]);
      line(
        ctx,
        (launchpad.x + (launchpad.w || 1) / 2) * T,
        (launchpad.y + (launchpad.h || 1) / 2) * T,
        (spawn.x + (spawn.w || 1) / 2) * T,
        (spawn.y + (spawn.h || 1) / 2) * T,
        ctx.strokeStyle,
      );
      ctx.setLineDash([]);
      ctx.restore();
    }
  for (const [index, trace] of (traces || r.playTraces || []).entries())
    if (trace.visible !== false && Array.isArray(trace.points) && trace.points.length) {
      const color = /^#[0-9a-f]{6}$/i.test(trace.color) ? trace.color : '#70cff4';
      ctx.strokeStyle = color + 'cc';
      ctx.lineWidth = 2 / v.scale;
      ctx.beginPath();
      trace.points.forEach((p, i) => (i && !p.break ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.lineWidth = 1;
      const first = trace.points[0];
      text(
        ctx,
        trace.name || '试玩路径',
        first.x + 10 / v.scale,
        first.y - (8 + index * 14) / v.scale,
        10 / v.scale,
        color,
      );
    }
  for (const entry of r.entries) {
    // Grouped ports are drawn at the mechanism's live position during play;
    // the authored origin in the project stays untouched.
    const rect = game?.entryRect?.(entry) || { x: entry.x * T, y: entry.y * T, w: T, h: T };
    ctx.strokeStyle = '#72d8ac';
    ctx.strokeRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
    text(ctx, 'IN', rect.x + rect.w / 2, rect.y + 21, 10, '#72d8ac', 'center');
    if (!game) text(ctx, entry.name, rect.x, rect.y - 6, 9, '#72d8ac');
  }
  for (const exit of r.exits) {
    const rect = game?.exitRect?.(exit) || {
      x: exit.x * T,
      y: exit.y * T,
      w: exit.w * T,
      h: exit.h * T,
    };
    ctx.fillStyle = '#dd9e4633';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#f6bb73';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    text(ctx, 'OUT', rect.x + rect.w / 2, rect.y + 24, 10, '#f6bb73', 'center');
    if (!game) text(ctx, exit.name, rect.x, rect.y - 6, 9, '#f6bb73');
  }
  if (game) {
    const trail = (points, color) => {
      if (!points?.length) return;
      ctx.strokeStyle = color;
      ctx.beginPath();
      points.forEach((p, i) => (i && !p.break ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    };
    trail(game.playerTrail, '#79c8ff77');
    trail(game.aiTrail, '#efb78377');
    const p = game.player;
    if (p.invulnerable <= 0 || Math.floor(game.elapsed * 10) % 2 === 0) {
      ctx.fillStyle = '#73beef';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      text(ctx, '@', p.x + p.w / 2, p.y + p.h - 5, p.crouching ? 16 : 23, '#08131e', 'center');
    }
    if (game.ai.active && !(game.ai.spawnDelay > 0)) {
      ctx.fillStyle = '#edae73';
      ctx.fillRect(game.ai.x - 22, game.ai.y - 14, 44, 28);
      text(ctx, '[AI]', game.ai.x, game.ai.y + 5, 15, '#21150c', 'center');
    }
  }
  if (!game && targets) {
    for (const pad of r.objects.filter(Motion.isPad)) {
      const color = Motion.colorFor(r, pad.id);
      ctx.fillStyle = color;
      ctx.fillRect(pad.x * T + 1, pad.y * T + 1, T - 2, 3);
    }
  }
  // Node handles normally belong to the selected brick. During the Space peek
  // every visible mechanism path gets handles so any of them can be dragged
  // directly; the owner id keeps the current node highlighted even when the
  // inspector selection is a different block.
  if (!game) {
    const bricks = new Map();
    if (selection?.kind === 'movables') {
      const brick = r.movables.find((b) => b.id === selection.id);
      if (brick) bricks.set(brick.id, brick);
    }
    if (peekBrickPaths)
      for (const ref of selections)
        if (ref.kind === 'movables') {
          const brick = r.movables.find((b) => b.id === ref.id);
          if (brick) bricks.set(brick.id, brick);
        }
    const { label } = require('../project/rail-nodes.cjs');
    for (const brick of bricks.values()) {
      const color = Motion.colorFor(r, brick.padId);
      for (const [index, node] of Motion.nodes(brick).entries()) {
        const x = (node.x + 0.5) * T,
          y = (node.y + 0.5) * T,
          active =
            index === selectedBrickNodeIndex &&
            (!selectedBrickNodeOwner || brick.id === selectedBrickNodeOwner);
        ctx.fillStyle = '#101b2a';
        ctx.fillRect(x - 9, y - 9, 18, 18);
        ctx.strokeStyle = active ? '#fff' : color;
        ctx.strokeRect(x - 9, y - 9, 18, 18);
        text(ctx, label(index + 1), x, y + 4, 10, color, 'center');
      }
    }
  }
  const selectedItems = selections.length ? selections : selection ? [selection] : [];
  for (const selection of selectedItems) {
    const item = selection.kind === 'tile' ? selection : findItem(r, selection),
      rect = item && { x: item.x * T, y: item.y * T, w: (item.w || 1) * T, h: (item.h || 1) * T };
    if (rect) {
      ctx.strokeStyle = '#f3eee0';
      ctx.lineWidth = 2 / v.scale;
      if (
        ['tiles', 'objects', 'movables'].includes(selection.kind) &&
        !Collision.inherited(r, item, selection.kind, item.type ? Registry.get(item.type) : {})
      )
        ctx.setLineDash([5, 4]);
      ctx.strokeRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      if (selection.kind === 'zones' && !item.locked)
        for (const h of Regions.corners(item)) {
          const size = 8 / v.scale;
          ctx.fillStyle = '#f7e1a9';
          ctx.strokeStyle = '#152737';
          ctx.lineWidth = 1 / v.scale;
          ctx.fillRect(h.x * T - size / 2, h.y * T - size / 2, size, size);
          ctx.strokeRect(h.x * T - size / 2, h.y * T - size / 2, size, size);
          ctx.lineWidth = 1;
        }
    }
  }
  if (hover) {
    ctx.fillStyle = '#7dc5f522';
    ctx.fillRect(hover.x * T, hover.y * T, T, T);
  }
  if (!game && selection?.kind === 'movables') {
    const brick = findItem(r, selection);
    if (brick?.brickGroup) {
      const x = brick.x * T,
        y = brick.y * T,
        badge = 16 / v.scale;
      ctx.save();
      ctx.strokeStyle = '#ffe181';
      ctx.lineWidth = 3 / v.scale;
      ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
      ctx.fillStyle = '#ffe181';
      ctx.fillRect(x, Math.max(0, y - badge), Math.max(T, badge * 2.1), badge);
      text(
        ctx,
        '代表',
        x + 4 / v.scale,
        Math.max(0, y - badge) + badge * 0.75,
        11 / v.scale,
        '#191407',
      );
      ctx.restore();
    }
  }
  if (!game)
    NativeDraw.draw(ctx, r, { scale: v.scale, selection, selections, targets, band: nativeBand });
  ctx.strokeStyle = '#7ba3c4';
  ctx.strokeRect(0, 0, r.cols * T, r.rows * T);
  ctx.restore();
}
function findItem(r, selection) {
  if (!selection) return null;
  if (['tile', 'tiles'].includes(selection.kind))
    return r.tiles.find((t) => t.x === selection.x && t.y === selection.y);
  return Native.get(r, selection);
}
function graphPorts(r, x, y) {
  return GraphLayout.ports(r, x, y);
}
function graphCurve(c, p, q) {
  const bend = Math.min(100, Math.abs(q.x - p.x) * 0.45),
    direction = Math.sign(q.x - p.x) || 1;
  return { c1: { x: p.x + bend * direction, y: p.y }, c2: { x: q.x - bend * direction, y: q.y } };
}
// Screen-constant label above a room body: name in its course colour, no notes.
function graphLabel(ctx, room, x, y, layout, scale, color) {
  const font = Math.min(30, Math.max(10, 11 / Math.max(scale, 0.001))),
    value = shortText(ctx, room.name, layout.width, font);
  ctx.font = font + 'px "Microsoft YaHei",sans-serif';
  const width = Math.min(layout.width, ctx.measureText(value).width + 8),
    top = y + Math.max(0, layout.labelHeight - font - 1);
  ctx.fillStyle = '#0b1622dd';
  ctx.fillRect(x, top, width, font + 2);
  text(ctx, value, x + 3, top + font, font, color || '#d8e8f3');
}
// World-space grid whose step keeps a constant on-screen density; the smallest
// step is one room cell so positions read against the same units as rooms.
function graphGrid(ctx, view) {
  const width = ctx.canvas.width,
    height = ctx.canvas.height,
    left = -view.x / view.scale,
    top = -view.y / view.scale,
    right = left + width / view.scale,
    bottom = top + height / view.scale;
  let step = GraphLayout.CELL_SIZE;
  while (step * view.scale < 9) step *= 2;
  ctx.strokeStyle = '#1c2f42';
  ctx.lineWidth = 1 / view.scale;
  ctx.beginPath();
  for (let x = Math.floor(left / step) * step; x <= right; x += step) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#2b4a63';
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(0, bottom);
  ctx.moveTo(left, 0);
  ctx.lineTo(right, 0);
  ctx.stroke();
}
function graphPortMarker(ctx, p, entry, scale) {
  const ai = p.kind === 'ai',
    color = ai ? (entry ? '#b79cff' : '#d8b4fe') : entry ? '#70ebbe' : '#ffb55d',
    glyph = ai ? (entry ? 'AI入' : 'AI出') : entry ? '入' : '出',
    radius = Math.min(16, 9 / scale);
  ctx.fillStyle = ai ? '#170f26' : '#07121e';
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = ai ? '#efe2ff' : '#e3f7f5';
  if (ai) ctx.setLineDash([3 / scale, 2 / scale]);
  ctx.lineWidth = 1.5 / scale;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  text(
    ctx,
    glyph,
    p.x,
    p.y + 3 / scale,
    Math.min(ai ? 11 : 14, (ai ? 7.5 : 9) / scale),
    '#0e2630',
    'center',
  );
  if (scale < 0.55) return;
  const label = ai
      ? 'AI ' + (entry ? '入口' : '出口') + ' · ' + (p.label || '未命名').slice(0, 6)
      : (entry ? '入口' : '出口') + ' · ' + (p.label || '未命名').slice(0, 6),
    font = 10 / Math.max(scale, 0.85);
  ctx.font = font + 'px "Microsoft YaHei",sans-serif';
  const width = ctx.measureText(label).width + 10;
  const x = entry ? p.x + radius + 7 : p.x - radius - 7 - width,
    y = entry ? p.y + radius + 5 / scale : p.y - radius - 23 / scale;
  ctx.fillStyle = ai ? '#171025' : '#081420';
  ctx.fillRect(x, y, width, 18 / scale);
  text(ctx, label, x + 5, y + 12 / scale, font, color);
}
// Global route map paint pass. `places` and `wires` come from graph-layout.cjs
// (same helper as hit testing and fit), so drawing can never disagree with the
// interactive geometry. Every course paints at once; the active course keeps a
// slightly brighter outline while the others stay fully visible.
function drawGraph(
  ctx,
  places,
  wires,
  selected,
  wire,
  view = { x: 0, y: 0, scale: 1 },
  activeCourseId = null,
  favorites = null,
  overlay = null,
) {
  // Single-room and marquee multi-room selection both paint the same ring; the
  // old {kind:'room'} shape stays valid for callers and old saves.
  const selectedIds = new Set(
    selected?.kind === 'rooms'
      ? selected.ids || []
      : selected?.kind === 'room' && selected.id
        ? [selected.id]
        : [],
  );
  ctx.fillStyle = '#0c1622';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  graphGrid(ctx, view);
  for (const place of places) {
    const body = place.layout.body,
      active = selectedIds.has(place.room.id),
      favorite = !!favorites && favorites.has(place.room.id);
    // The room itself is the thumbnail: no card shell, no note block.
    ctx.save();
    if (activeCourseId && place.courseId !== activeCourseId && !active) ctx.globalAlpha = 0.82;
    if (favorite) {
      // Obvious favourite highlight, distinct from the current selection ring:
      // a soft gold glow plus a gold star at the card's top-right corner.
      ctx.save();
      ctx.shadowColor = 'rgba(255, 197, 77, 0.95)';
      ctx.shadowBlur = 14 / Math.max(0.05, view.scale);
      ctx.strokeStyle = '#ffc54d';
      ctx.lineWidth = 3 / view.scale;
      ctx.strokeRect(
        place.x + body.x - 2 / view.scale,
        place.y + body.y - 2 / view.scale,
        body.width + 4 / view.scale,
        body.height + 4 / view.scale,
      );
      ctx.restore();
    }
    miniature(ctx, place.room, place.x + body.x, place.y + body.y, body.width, body.height, 0);
    const focused = active || place.courseId === activeCourseId;
    ctx.strokeStyle = active ? '#ffe8a7' : favorite ? '#ffc54d' : place.color;
    ctx.lineWidth = (focused ? 2 : favorite ? 2.5 : 1) / view.scale;
    ctx.strokeRect(place.x + body.x, place.y + body.y, body.width, body.height);
    graphLabel(ctx, place.room, place.x, place.y, place.layout, view.scale, place.color);
    if (favorite) {
      const size = Math.max(9, 12 / view.scale);
      ctx.fillStyle = '#ffc54d';
      ctx.font = size + 'px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(
        '★',
        place.x + body.x + body.width - 2 / view.scale,
        place.y + body.y - size * 0.35,
      );
    }
    ctx.restore();
  }
  // Paint wires over rooms, then endpoints on top: connections stay visible through a thumbnail.
  for (const edge of wires) {
    const ai = !!edge.ai || edge.kind === 'ai',
      curve = graphCurve(edge, edge.from, edge.to),
      focused =
        (selected?.kind === 'wire' || selected?.kind === 'ai-wire') && selected.id === edge.id;
    ctx.save();
    // AI wires are dashed purple so they stay readable on top of player wires
    // and cannot be mistaken for a player route.
    if (ai) ctx.setLineDash([8 / Math.max(view.scale, 0.001), 5 / Math.max(view.scale, 0.001)]);
    ctx.strokeStyle = focused ? '#ffe8a7' : edge.color || (ai ? '#b79cff' : '#79c5be');
    ctx.lineWidth = ai ? (focused ? 3 : 2.5) : focused ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(edge.from.x, edge.from.y);
    ctx.bezierCurveTo(curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y, edge.to.x, edge.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ai && view.scale >= 0.45) {
      const mx = (edge.from.x + edge.to.x) / 2,
        my = (edge.from.y + edge.to.y) / 2,
        font = 10 / Math.max(view.scale, 0.85);
      ctx.font = font + 'px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#171025';
      ctx.fillRect(mx - 12, my - font, 24, font + 4);
      text(ctx, 'AI', mx, my - 2, font, '#d8b4fe', 'center');
    }
    ctx.restore();
  }
  if (wire) {
    const curve = graphCurve(wire, wire, wire.to);
    ctx.strokeStyle = wire.ai ? '#d8b4fe' : '#f5d39b';
    ctx.setLineDash(wire.ai ? [8, 5] : [5, 4]);
    ctx.beginPath();
    ctx.moveTo(wire.x, wire.y);
    ctx.bezierCurveTo(curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y, wire.to.x, wire.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const place of places) {
    for (const p of place.ports.entries) graphPortMarker(ctx, p, true, view.scale);
    for (const p of place.ports.exits) graphPortMarker(ctx, p, false, view.scale);
    // Explicit AI ports stay visible next to player ports; their dashed marker
    // and "AI" label make it obvious which handle starts an AI-only wire.
    for (const p of place.ports.aiEntries || []) graphPortMarker(ctx, p, true, view.scale);
    for (const p of place.ports.aiExits || []) graphPortMarker(ctx, p, false, view.scale);
  }
  if (overlay?.marquee) {
    const from = overlay.marquee.from,
      to = overlay.marquee.to;
    if (from && to) {
      const x = Math.min(from.x, to.x),
        y = Math.min(from.y, to.y),
        width = Math.abs(to.x - from.x),
        height = Math.abs(to.y - from.y);
      ctx.save();
      ctx.fillStyle = 'rgba(255, 232, 167, 0.12)';
      ctx.fillRect(x, y, width, height);
      ctx.setLineDash([6 / Math.max(view.scale, 0.001), 4 / Math.max(view.scale, 0.001)]);
      ctx.strokeStyle = '#ffe8a7';
      ctx.lineWidth = 1.5 / Math.max(view.scale, 0.001);
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    }
  }
  ctx.restore();
}
module.exports = {
  text,
  line,
  fit,
  drawRoom,
  miniature,
  findItem,
  graphPorts,
  graphCurve,
  drawGraph,
  assetId,
  objectVisualRect,
  drawCollisionHint,
};
