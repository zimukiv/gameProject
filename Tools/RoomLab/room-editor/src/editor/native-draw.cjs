'use strict';
const N = require('../project/native-compat.cjs');
const colors = { all: '#abc8dc', awake: '#ffcf65', haze: '#9ce0d2', dream: '#bb9be3' };
function signalColor(n) {
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ['#80d9e5', '#d4a8ee', '#ffc67d', '#9ddca6', '#f3a5ba'][h % 5];
}
function draw(
  ctx,
  r,
  { scale = 1, band = 'all', selection = null, selections = [], targets = true, mini = false } = {},
) {
  const refs = selection ? [selection, ...selections] : selections;
  const text = (s, x, y) => {
    ctx.font = Math.max(9, 12 / scale) + 'px "Microsoft YaHei",sans-serif';
    ctx.fillText(s, x * 32, y * 32);
  };
  for (const kind of N.kinds)
    N.list(r, kind).forEach((o, i) => {
      const selected = refs.some((s) => s.kind === kind && s.id === N.identity(o, i)),
        b = N.rect(kind, o),
        color = selected
          ? '#fff278'
          : o.signal || o.switch
            ? signalColor(o.signal || o.switch)
            : colors[o.band || 'all'];
      ctx.save();
      ctx.lineWidth = (selected ? 3 : 1) / scale;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      if (band !== 'all' && o.band && o.band !== 'all' && o.band !== band) {
        ctx.globalAlpha = 0.22;
        ctx.setLineDash([5 / scale, 4 / scale]);
      }
      if (kind === 'platforms') {
        ctx.fillStyle = color + '55';
        ctx.fillRect(b.x * 32, b.y * 32, b.w * 32, b.h * 32);
        ctx.strokeRect(b.x * 32, b.y * 32, b.w * 32, b.h * 32);
        ctx.fillStyle = color;
        if (!mini && o.label) text(o.label, b.x + 0.1, b.y + 0.65);
        if (!mini && targets && (o.toX !== undefined || o.toY !== undefined)) {
          const x = o.toX ?? o.x,
            y = o.toY ?? o.y;
          ctx.setLineDash([5 / scale, 4 / scale]);
          ctx.strokeRect(x * 32, y * 32, b.w * 32, b.h * 32);
          ctx.beginPath();
          ctx.moveTo((b.x + 0.5) * 32, (b.y + 0.5) * 32);
          ctx.lineTo((x + 0.5) * 32, (y + 0.5) * 32);
          ctx.stroke();
          ctx.setLineDash([]);
          if (selected) {
            ctx.fillRect(
              (x + 0.5) * 32 - 5 / scale,
              (y + 0.5) * 32 - 5 / scale,
              10 / scale,
              10 / scale,
            );
            text('终点', x + 0.7, y + 0.5);
          }
        }
        if (selected && !mini)
          for (const h of require('./region-handles.cjs').corners(b))
            ctx.fillRect(h.x * 32 - 4 / scale, h.y * 32 - 4 / scale, 8 / scale, 8 / scale);
      } else if (kind === 'patrols') {
        ctx.beginPath();
        for (const [j, n] of o.nodes.entries()) {
          j ? ctx.lineTo(n.x * 32, n.y * 32) : ctx.moveTo(n.x * 32, n.y * 32);
        }
        ctx.stroke();
        for (const [j, n] of o.nodes.entries()) {
          ctx.beginPath();
          ctx.arc(n.x * 32, n.y * 32, (selected ? 5 : 3) / scale, 0, Math.PI * 2);
          ctx.fill();
          if (!mini) text(String(j + 1), n.x + 0.15, n.y - 0.15);
        }
      } else if (!mini) {
        text(o.text || '标记', o.x, o.y + 0.65);
        if (selected) ctx.strokeRect(o.x * 32, o.y * 32, 32, 32);
      }
      ctx.restore();
    });
  if (!mini)
    for (const kind of ['objects', 'tiles', 'movables', 'exits'])
      for (const o of r[kind] || []) {
        const m = o.rework;
        if (!m) continue;
        ctx.save();
        if (band !== 'all' && m.band && m.band !== band && m.band !== 'all') {
          ctx.fillStyle = '#09121dcc';
          ctx.fillRect(o.x * 32, o.y * 32, (o.w || 1) * 32, (o.h || 1) * 32);
        }
        ctx.strokeStyle = colors[m.band || 'all'];
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash(m.band ? [4 / scale, 3 / scale] : []);
        ctx.strokeRect(o.x * 32, o.y * 32, (o.w || 1) * 32, (o.h || 1) * 32);
        ctx.fillStyle =
          m.signal || m.switch ? signalColor(m.signal || m.switch) : colors[m.band || 'all'];
        if (m.clarityDelta !== undefined)
          text((m.clarityDelta > 0 ? '+' : '') + m.clarityDelta, o.x, o.y - 0.1);
        if (targets && (m.signal || m.switch))
          text((m.signal ? '跨房 ' : '本房 ') + (m.signal || m.switch), o.x, o.y - 0.15);
        ctx.restore();
      }
}
function hitNode(r, ref, p, scale) {
  const o = ref && N.get(r, ref);
  if (!o || o.locked) return null;
  const points =
    ref.kind === 'patrols'
      ? o.nodes
      : ref.kind === 'platforms' && (o.toX !== undefined || o.toY !== undefined)
        ? [{ x: (o.toX ?? o.x) + 0.5, y: (o.toY ?? o.y) + 0.5 }]
        : [];
  for (let i = points.length - 1; i >= 0; i--)
    if (Math.hypot(p.x - points[i].x, p.y - points[i].y) * 32 * scale < 10)
      return { kind: ref.kind, id: ref.id, index: i };
  return null;
}
module.exports = { draw, hitNode };
