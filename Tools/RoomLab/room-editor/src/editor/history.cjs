'use strict';
const { clone } = require('../shared/utils.cjs');
class History {
  constructor(limit = 60) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  commit(before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.past.push(clone(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(clone(current));
    return this.past.pop();
  }
  redo(current) {
    if (!this.future.length) return null;
    this.past.push(clone(current));
    return this.future.pop();
  }
  clear() {
    this.past = [];
    this.future = [];
  }
}
module.exports = { History };
