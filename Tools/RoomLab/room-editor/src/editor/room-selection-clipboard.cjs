'use strict';
// Glue between the Ctrl+C/V keys and the pure selection clipboard. Room editing
// copies the current selection; the room-wide clipboard remains on the home
// page (room library / wiring board). Text inputs keep the system clipboard
// because app.cjs ignores shortcuts while an input/textarea/select is focused.
const Selection = require('../project/clipboard-selection.cjs');
const keyOf = (ref) =>
  ref.kind === 'tiles' ? ref.kind + ':' + ref.x + ',' + ref.y : ref.kind + ':' + ref.id;
function selectedRefs(app) {
  const s = app.state,
    list = (s.multiSelection || []).filter(Boolean),
    refs = list.length ? list : s.selection ? [s.selection] : [],
    seen = new Set();
  // Native platforms/patrols/signs and entries/exits are copyable now; keep the
  // ref verbatim (native identity may be '@index' for a sign without an id) and
  // only drop duplicates/unknown kinds.
  return refs.filter(
    (ref) =>
      ref &&
      Selection.KINDS.includes(ref.kind) &&
      (seen.has(keyOf(ref)) ? false : seen.add(keyOf(ref))),
  );
}
function copy(app) {
  if (app.state.route !== 'room' || !app.store.hasProject) return false;
  const refs = selectedRefs(app);
  if (!refs.length) return false;
  try {
    const clip = Selection.capture(app.room(), refs);
    app.selectionClipboard = clip;
    app.selectionPasteCount = 0;
    app.message('已复制 ' + clip.items.length + ' 项，Ctrl+V 粘贴到本房间（可撤销）。');
    return true;
  } catch (error) {
    app.message(error.message, true);
    return false;
  }
}
function paste(app) {
  if (app.state.route !== 'room' || !app.selectionClipboard) return false;
  const room = app.room(),
    // Repeated pastes step diagonally so they stay visible without covering the
    // previous copy; the first paste already lands one cell away from the source.
    step = (app.selectionPasteCount = (app.selectionPasteCount || 0) + 1),
    offset = { offsetX: step, offsetY: step };
  let result = null;
  try {
    app.store.change(() => {
      result = Selection.paste(room, app.selectionClipboard, offset);
      app.state.selection = result.refs.find((ref) => ref.kind !== 'tiles') || null;
      app.state.multiSelection = result.refs.filter((ref) => ref.kind !== 'tiles');
      app.state.railNodeId = null;
    });
  } catch (error) {
    app.selectionPasteCount = step - 1;
    app.message('粘贴失败：' + error.message, true);
    return true;
  }
  app.message('已粘贴 ' + result.count + ' 项（偏移 ' + step + ' 格）。Ctrl+Z 可撤销。');
  return true;
}
function clear(app) {
  app.selectionClipboard = null;
  app.selectionPasteCount = 0;
}
module.exports = { copy, paste, clear, selectedRefs };
