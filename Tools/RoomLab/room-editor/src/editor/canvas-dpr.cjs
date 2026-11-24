'use strict';
// Canvas backing-store sizing at the real pixel density. The editor used to set
// canvas.width = clientWidth (CSS px), which stretches the same bitmap on HiDPI
// displays and makes room maps / thumbnails look blurry. Backing stores are now
// CSS size * ratio, with a hard pixel budget so a very large room (or many
// thumbnails) cannot allocate an unbounded canvas.
const MAX_PIXELS = 4200000,
  MAX_RATIO = 3;
function ratioFor(width, height, deviceRatio = 1) {
  const wanted = Number.isFinite(Number(deviceRatio)) ? Number(deviceRatio) : 1,
    byBudget = Math.sqrt(
      MAX_PIXELS / Math.max(1, Math.abs(Number(width) || 1) * Math.abs(Number(height) || 1)),
    );
  return Math.max(1, Math.min(MAX_RATIO, wanted, byBudget));
}
function apply(ctx, ratio) {
  if (typeof ctx.setTransform === 'function') ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
// prepare() is pure DOM work with no drawing: it is safe to call on every
// render/redraw. fixed=true pins the CSS box (thumbnails); the main editor
// canvas passes fixed=false so its layout stays driven by CSS.
function prepare(canvas, width, height, deviceRatio = 1, { fixed = true } = {}) {
  const w = Math.max(1, Math.round(width)),
    h = Math.max(1, Math.round(height)),
    ratio = ratioFor(w, h, deviceRatio);
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  if (fixed && canvas.style) {
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  const ctx = canvas.getContext('2d');
  apply(ctx, ratio);
  // dataset already exists on real canvases; guard only for plain test doubles.
  const dataset = canvas.dataset || (canvas.dataset = {});
  dataset.cssWidth = String(w);
  dataset.cssHeight = String(h);
  dataset.dpr = String(ratio);
  return { ctx, width: w, height: h, ratio };
}
// Pointer coordinates in CSS/layout space. Using canvas.width here (as the old
// code did) mixed device pixels with the CSS-space view transform.
function pointer(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect(),
    ratio = Number(canvas.dataset?.dpr) || 1,
    width = Number(canvas.dataset?.cssWidth) || canvas.width / ratio,
    height = Number(canvas.dataset?.cssHeight) || canvas.height / ratio;
  return {
    x: ((clientX - rect.left) * width) / Math.max(1, rect.width),
    y: ((clientY - rect.top) * height) / Math.max(1, rect.height),
  };
}
module.exports = { MAX_PIXELS, MAX_RATIO, ratioFor, apply, prepare, pointer };
