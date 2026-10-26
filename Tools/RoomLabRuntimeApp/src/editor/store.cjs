'use strict';
const M = require('../project/model.cjs'),
  { History } = require('./history.cjs');
const { seeds } = require('../assets/seeds.cjs'),
  Assets = require('../assets/manager.cjs');
class Store {
  constructor() {
    this.project = M.example();
    this.history = new History();
    this.assetFiles = new Map();
    this.listeners = [];
    this.nativeSession = null;
    this.dirty = false;
    try {
      const saved = JSON.parse(localStorage.getItem('ddl-room-lab-v2'));
      if (saved) {
        const p = M.migrate(saved);
        if (!M.validate(p).errors.length) this.project = p;
      }
    } catch (e) {}
    const seed = seeds();
    for (const [key, value] of seed.files) this.assetFiles.set(key, value);
    if (!this.project.assets.length) {
      this.project.assets = seed.assets;
      this.project.courses[0].artBindings = {
        ...this.project.courses[0].artBindings,
        ...seed.bindings,
      };
    }
    Assets.hydrate(this).then(() => this.notify());
  }
  subscribe(fn) {
    this.listeners.push(fn);
  }
  notify() {
    for (const fn of this.listeners) fn();
  }
  snapshot() {
    return M.clone(this.project);
  }
  commit(before) {
    if (this.history.commit(before, this.project)) {
      this.dirty = true;
      this.persist();
    }
    this.notify();
  }
  change(fn) {
    const before = this.snapshot();
    fn(this.project);
    this.commit(before);
  }
  load(data) {
    const next = M.migrate(data),
      errors = M.validate(next).errors;
    if (errors.length) throw new Error(errors.join('\n'));
    const before = this.snapshot();
    this.project = next;
    this.nativeSession = null;
    this.commit(before);
  }
  undo() {
    const next = this.history.undo(this.project);
    if (next) {
      this.project = next;
      this.dirty = true;
      this.persist();
      this.notify();
    }
  }
  redo() {
    const next = this.history.redo(this.project);
    if (next) {
      this.project = next;
      this.dirty = true;
      this.persist();
      this.notify();
    }
  }
  persist() {
    try {
      localStorage.setItem('ddl-room-lab-v2', JSON.stringify(this.project));
    } catch (e) {}
  }
  course(id) {
    return this.project.courses.find((c) => c.id === id) || this.project.courses[0];
  }
  room(courseId, roomId) {
    const c = this.course(courseId);
    return c.rooms.find((r) => r.id === roomId) || c.rooms[0];
  }
}
module.exports = { Store };
