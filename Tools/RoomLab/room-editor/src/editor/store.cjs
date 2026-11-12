'use strict';
const M = require('../project/model.cjs'),
  { History } = require('./history.cjs');
const { seeds, restoreBuiltIns } = require('../assets/seeds.cjs'),
  Assets = require('../assets/manager.cjs');
class Store {
  constructor() {
    this.project = M.themedExample();
    this.history = new History();
    this.assetFiles = new Map();
    this.listeners = [];
    this.nativeSession = null;
    this.dirty = false;
    this.hasProject = false;
    try {
      const saved = JSON.parse(localStorage.getItem('ddl-room-lab-v2'));
      if (saved) {
        const p = M.migrate(saved);
        if (!M.validate(p).errors.length) {
          this.project = p;
          this.hasProject = true;
        }
      }
    } catch (e) {}
    this.seedAllCourseArt(seeds({ allThemes: true }));
    Assets.hydrate(this).then(() => this.notify());
  }
  restoreBuiltIns() {
    restoreBuiltIns(this.project.assets, this.assetFiles);
  }
  seedCourseArt(course, seed = seeds({ allThemes: true })) {
    if (!course || !['physics', 'calculus', 'slacker'].includes(course.kind)) return;
    const bindings = seed.allBindings || seed.bindings;
    for (const asset of seed.assets) {
      if (this.project.assets.some((a) => a.id === asset.id || a.path === asset.path)) continue;
      this.project.assets.push(M.clone(asset));
      this.assetFiles.set(asset.path, seed.files.get(asset.path)?.slice());
    }
    this.restoreBuiltIns();
    course.artBindings ||= {};
    const available = new Set(this.project.assets.map((a) => a.id));
    for (const [type, slots] of Object.entries(bindings)) {
      if (!Object.values(slots).every((id) => available.has(id))) continue;
      course.artBindings[type] = {
        ...M.clone(slots),
        ...(course.artBindings[type] || {}),
      };
    }
  }
  seedAllCourseArt(seed = seeds({ allThemes: true })) {
    for (const course of this.project.courses) this.seedCourseArt(course, seed);
    this.restoreBuiltIns();
  }
  newThemedProject() {
    const project = M.themedExample();
    const seed = seeds({ allThemes: true });
    project.id = M.uid('project');
    project.assets = M.clone(seed.assets);
    for (const course of project.courses) course.artBindings = M.clone(seed.allBindings);
    for (const [path, bytes] of seed.files) this.assetFiles.set(path, bytes);
    this.load(project);
    this.history.clear();
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
    this.seedAllCourseArt();
    this.hasProject = true;
    this.nativeSession = null;
    this.commit(before);
    this.persist();
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
