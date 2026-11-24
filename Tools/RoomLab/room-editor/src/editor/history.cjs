'use strict';
const { clone } = require('../shared/utils.cjs');
class History {
  constructor(limit = 60) {
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.lastMerge = null;
  }
  commit(before, after, merge = null) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    const now = Date.now();
    // Rapid edits to the same live field collapse into one undo step: the oldest
    // snapshot already stored for that run is kept, so Ctrl+Z restores the value
    // from before the typing started.
    if (
      merge?.key &&
      this.lastMerge &&
      this.lastMerge.key === merge.key &&
      now - this.lastMerge.at <= (merge.window ?? 900)
    ) {
      this.lastMerge.at = now;
      this.future = [];
      return true;
    }
    this.past.push(clone(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.lastMerge = merge?.key ? { key: merge.key, at: now } : null;
    return true;
  }
  // Undo/redo/clear end the current typing burst. Without resetting lastMerge a
  // field edited again right after Ctrl+Z would be merged into the previous run
  // and the restored value would be lost instead of staying as its own step.
  undo(current) {
    this.lastMerge = null;
    if (!this.past.length) return null;
    this.future.push(clone(current));
    return this.past.pop();
  }
  redo(current) {
    this.lastMerge = null;
    if (!this.future.length) return null;
    this.past.push(clone(current));
    return this.future.pop();
  }
  clear() {
    this.past = [];
    this.future = [];
    this.lastMerge = null;
  }
}
module.exports = { History };
