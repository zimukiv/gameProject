'use strict';
const Registry = require('../plugins/registry.cjs'),
  { clamp } = require('../shared/utils.cjs');
const GraphLayout = require('./graph-layout.cjs');
const Temperature = require('../project/temperature.cjs');
const Collision = require('../project/collision.cjs');
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
    selectedRailNodeId = null,
    traces = null,
    hover = null,
    targets = true,
    assetURL = () => null,
    grid = true,
  } = {},
) {
  if (r.artBindings)
    course = { ...course, artBindings: { ...course.artBindings, ...r.artBindings } };
  const w = ctx.canvas.width,
    h = ctx.canvas.height,
    v = view || fit(r, w, h);
  ctx.fillStyle = '#09121d';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.scale(v.scale, v.scale);
  const bg = course.artBindings?.background,
    backgroundAsset = project.assets.find((a) => a.id === bg);
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
  for (const t of r.tiles) {
    const tileObject = { type: 'common.solid', assetOverrides: {} },
      id = assetId(project, course, tileObject, 'idle'),
      a = project.assets.find((a) => a.id === id);
    if (!drawImage(ctx, assetURL(id), { x: t.x * T, y: t.y * T, w: T, h: T }, a)) {
      ctx.fillStyle = '#263d51';
      ctx.fillRect(t.x * T, t.y * T, T, T);
      ctx.strokeStyle = '#7892a7';
      ctx.strokeRect(t.x * T + 0.5, t.y * T + 0.5, T - 1, T - 1);
    }
    if (!Collision.enabled(t, 'tiles')) ghostBorder(ctx, { x: t.x * T, y: t.y * T, w: T, h: T });
    if (!game && (t.x < 0 || t.y < 0 || t.x >= r.cols || t.y >= r.rows)) {
      ctx.strokeStyle = '#f17f77';
      ctx.strokeRect(t.x * T, t.y * T, T, T);
    }
  }
  if (targets)
    for (const b of r.movables) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#6acc9877';
      ctx.strokeRect(b.targetX * T, b.targetY * T, T, T);
      line(
        ctx,
        (b.x + 0.5) * T,
        (b.y + 0.5) * T,
        (b.targetX + 0.5) * T,
        (b.targetY + 0.5) * T,
        '#6acc9855',
      );
      ctx.setLineDash([]);
    }
  for (const b of r.movables) {
    const rect = game?.movableRect?.(b) || { x: b.x * T, y: b.y * T, w: T, h: T };
    ctx.fillStyle = '#364153';
    ctx.fillRect(rect.x, rect.y, T, T);
    ctx.strokeStyle = '#b9c7d5';
    ctx.strokeRect(rect.x, rect.y, T, T);
    text(ctx, '□', rect.x + 16, rect.y + 23, 16, '#d4e2ec', 'center');
    if (!Collision.enabled(b, 'movables')) ghostBorder(ctx, rect);
  }
  for (const o of r.objects) {
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
    const rect = {
      x: o.x * T,
      y: o.y * T,
      w: (o.w || 1) * T,
      h: (o.h || 1) * T,
    };
    if (
      ['common.coin', 'common.small', 'common.collectible'].includes(o.type) &&
      game?.credited?.has(r.id + '/' + o.id)
    )
      continue;
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
        o.type === 'physics.thermal' ? 17 : 20,
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
    if (!Collision.enabled(o, 'objects', d)) ghostBorder(ctx, rect);
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
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
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
    ctx.strokeStyle = '#72d8ac';
    ctx.strokeRect(entry.x * T + 3, entry.y * T + 3, T - 6, T - 6);
    text(ctx, 'IN', entry.x * T + 16, entry.y * T + 21, 10, '#72d8ac', 'center');
    if (!game) text(ctx, entry.name, entry.x * T, entry.y * T - 6, 9, '#72d8ac');
  }
  for (const exit of r.exits) {
    ctx.fillStyle = '#dd9e4633';
    ctx.fillRect(exit.x * T, exit.y * T, exit.w * T, exit.h * T);
    ctx.strokeStyle = '#f6bb73';
    ctx.strokeRect(exit.x * T, exit.y * T, exit.w * T, exit.h * T);
    text(ctx, 'OUT', exit.x * T + 16, exit.y * T + 24, 10, '#f6bb73', 'center');
    if (!game) text(ctx, exit.name, exit.x * T, exit.y * T - 6, 9, '#f6bb73');
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
    if (game.ai.active) {
      ctx.fillStyle = '#edae73';
      ctx.fillRect(game.ai.x - 22, game.ai.y - 14, 44, 28);
      text(ctx, '[AI]', game.ai.x, game.ai.y + 5, 15, '#21150c', 'center');
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
        !Collision.enabled(item, selection.kind, item.type ? Registry.get(item.type) : {})
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
  ctx.strokeStyle = '#7ba3c4';
  ctx.strokeRect(0, 0, r.cols * T, r.rows * T);
  ctx.restore();
}
function findItem(r, selection) {
  if (!selection) return null;
  if (['tile', 'tiles'].includes(selection.kind))
    return r.tiles.find((t) => t.x === selection.x && t.y === selection.y);
  return (r[selection.kind] || []).find((o) => o.id === selection.id);
}
function graphPorts(r) {
  const x = r.graph?.x || 0,
    y = r.graph?.y || 0;
  const thumb = GraphLayout.card(r).thumb,
    view = fit(r, thumb.width, thumb.height, 0);
  const projected = (e) => ({
    roomId: r.id,
    id: e.id,
    x: x + thumb.x + view.x + (e.x + 0.5) * T * view.scale,
    y: y + thumb.y + view.y + (e.y + (e.h || 1) / 2) * T * view.scale,
    label: e.name,
  });
  return {
    entries: r.entries.map(projected),
    exits: r.exits.map(projected),
  };
}
function graphCurve(c, p, q) {
  const bend = Math.min(100, Math.abs(q.x - p.x) * 0.45),
    direction = Math.sign(q.x - p.x) || 1;
  return { c1: { x: p.x + bend * direction, y: p.y }, c2: { x: q.x - bend * direction, y: q.y } };
}
function graphNotes(ctx, value, x, y, width) {
  let remaining = Array.from(String(value || '无备注'));
  for (let row = 0; row < 3 && remaining.length; row++) {
    if (row === 2) {
      text(ctx, shortText(ctx, remaining.join(''), width, 12), x, y + row * 16, 12, '#b0c2d2');
      break;
    }
    ctx.font = '12px Consolas,"Microsoft YaHei",sans-serif';
    let line = '';
    while (remaining.length && ctx.measureText(line + remaining[0]).width <= width)
      line += remaining.shift();
    text(ctx, line, x, y + row * 16, 12, '#b0c2d2');
  }
}
function graphPortMarker(ctx, p, entry, scale) {
  const color = entry ? '#70ebbe' : '#ffb55d',
    radius = Math.min(16, 9 / scale);
  ctx.fillStyle = '#07121e';
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#e3f7f5';
  ctx.lineWidth = 1.5 / scale;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  text(
    ctx,
    entry ? '入' : '出',
    p.x,
    p.y + 3 / scale,
    Math.min(14, 9 / scale),
    '#0e2630',
    'center',
  );
  if (scale < 0.55) return;
  const label = (entry ? '入口' : '出口') + ' · ' + (p.label || '未命名').slice(0, 6),
    font = 10 / Math.max(scale, 0.85);
  ctx.font = font + 'px "Microsoft YaHei",sans-serif';
  const width = ctx.measureText(label).width + 10;
  const x = entry ? p.x + radius + 7 : p.x - radius - 7 - width,
    y = entry ? p.y + radius + 5 / scale : p.y - radius - 23 / scale;
  ctx.fillStyle = '#081420';
  ctx.fillRect(x, y, width, 18 / scale);
  text(ctx, label, x + 5, y + 12 / scale, font, color);
}
function drawGraph(ctx, project, c, selected, wire, view = { x: 0, y: 0, scale: 1 }) {
  ctx.fillStyle = '#0c1622';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let x = 0; x < ctx.canvas.width; x += 30)
    for (let y = 0; y < ctx.canvas.height; y += 30) {
      ctx.fillStyle = '#284053';
      ctx.fillRect(x, y, 1, 1);
    }
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  ctx.lineWidth = 1;
  for (const r of c.rooms) {
    const x = r.graph?.x || 0,
      y = r.graph?.y || 0,
      layout = GraphLayout.card(r),
      height = layout.height;
    ctx.fillStyle = '#1b2b3b';
    ctx.fillRect(x, y, layout.width, height);
    ctx.strokeStyle = selected?.kind === 'room' && selected.id === r.id ? '#e4c392' : '#466079';
    ctx.strokeRect(x, y, layout.width, height);
    text(ctx, shortText(ctx, r.name, layout.width - 16, 17), x + 8, y + 23, 17, '#dbeaf4');
    const thumb = layout.thumb;
    miniature(ctx, r, x + thumb.x, y + thumb.y, thumb.width, thumb.height, 0);
    graphNotes(ctx, r.notes, x + 8, y + layout.notesY + 12, layout.width - 16);
  }
  // Paint wires over cards, then endpoints on top: connections stay visible through a thumbnail.
  for (const edge of c.connections) {
    const a = c.rooms.find((r) => r.id === edge.from.roomId),
      b = c.rooms.find((r) => r.id === edge.to.roomId);
    if (!a || !b) continue;
    const p = graphPorts(a).exits.find((p) => p.id === edge.from.exitId),
      q = graphPorts(b).entries.find((p) => p.id === edge.to.entryId);
    if (!p || !q) continue;
    const curve = graphCurve(c, p, q);
    ctx.strokeStyle = selected?.kind === 'wire' && selected.id === edge.id ? '#ffe8a7' : '#79c5be';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.bezierCurveTo(curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y, q.x, q.y);
    ctx.stroke();
  }
  if (wire) {
    const curve = graphCurve(c, wire, wire.to);
    ctx.strokeStyle = '#f5d39b';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(wire.x, wire.y);
    ctx.bezierCurveTo(curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y, wire.to.x, wire.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const r of c.rooms) {
    const ports = graphPorts(r);
    for (const p of ports.entries) graphPortMarker(ctx, p, true, view.scale);
    for (const p of ports.exits) graphPortMarker(ctx, p, false, view.scale);
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
};
