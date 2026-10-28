'use strict';
const { Store } = require('./store.cjs'),
  M = require('../project/model.cjs'),
  { esc, $, download, modal } = require('./dom.cjs');
const Home = require('./pages/home.cjs'),
  Course = require('./pages/course.cjs'),
  Room = require('./pages/room.cjs');
const Assets = require('../assets/manager.cjs'),
  Archive = require('../project/archive.cjs'),
  AssetPage = require('./pages/assets.cjs'),
  DefinitionPage = require('./pages/definitions.cjs'),
  Bindings = require('./pages/bindings.cjs'),
  { seeds } = require('../assets/seeds.cjs');
const { Engine } = require('../runtime/engine.cjs'),
  PlayPage = require('./pages/play.cjs');
const { Recorder } = require('../project/play-traces.cjs');
class App {
  constructor() {
    this.store = new Store();
    this.state = {
      route: 'home',
      courseId: this.store.project.courses[0].id,
      roomId: this.store.project.courses[0].rooms[0].id,
      courseTab: 'graph',
      tool: 'select',
      selection: null,
      inspectorTab: 'base',
      roomView: null,
    };
    const preview = new URL(window.location.href).searchParams;
    if (['room', 'course', 'assets'].includes(preview.get('preview'))) {
      this.state.route = preview.get('preview');
      const roomId = preview.get('room');
      if (this.course().rooms.some((r) => r.id === roomId)) this.state.roomId = roomId;
    }
    this.currentDraw = null;
    this.assetURLs = new Map();
    this.game = null;
    this.keys = new Set();
    this.edges = {};
    this.acc = 0;
    this.last = 0;
    this.store.subscribe(() => this.render());
    this.bind();
    this.cloud = new (require('./cloud-controller.cjs').CloudController)(this);
    $('open-cloud').onclick = () => this.cloud.show();
    this.render();
    requestAnimationFrame(() => this.frame());
  }
  course() {
    return this.store.course(this.state.courseId);
  }
  room() {
    return this.store.room(this.state.courseId, this.state.roomId);
  }
  go(route, values = {}) {
    if (route !== 'play' && this.game) {
      this.stopPlay(() => this.go(route, values));
      return;
    }
    this.state = { ...this.state, ...values, route };
    this.state.selection = null;
    this.state.multiSelection = [];
    this.state.roomView = null;
    this.render();
  }
  message(value, error = false) {
    $('status').textContent = value;
    $('status').classList.toggle('error', error);
  }
  assetURL(id) {
    const a = this.store.project.assets.find((a) => a.id === id);
    if (!a) return null;
    const data = this.store.assetFiles.get(a.path);
    if (!data) return null;
    const key = a.path;
    if (!this.assetURLs.has(key))
      this.assetURLs.set(
        key,
        URL.createObjectURL(new Blob([data], { type: a.mime || 'image/png' })),
      );
    return this.assetURLs.get(key);
  }
  bind() {
    require('./room-transfer.cjs').bind(this);
    $('home').onclick = () => this.go('home');
    $('new-project').onclick = () => this.newCourse();
    $('open-project').onclick = () =>
      this.confirmUnsaved('打开项目', () => {
        if (window.desktopAPI) this.openNative();
        else $('project-file').click();
      });
    $('import-project').onclick = () =>
      this.confirmUnsaved('导入项目包', () => {
        $('project-file').click();
      });
    $('project-file').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        if (file.size > 80 * 1024 * 1024) throw new Error('项目文件不能超过 80 MiB');
        if (file.name.toLowerCase().endsWith('.zip')) {
          const pack = Archive.unpack(new Uint8Array(await file.arrayBuffer()));
          for (const [key, value] of pack.files) {
            this.store.assetFiles.set(key, value);
            await Assets.putBlob(key, value);
          }
          this.store.load(pack.project);
        } else this.store.load(JSON.parse(await file.text()));
        this.state.courseId = this.store.project.courses[0].id;
        this.go('home');
        this.message('项目已载入，旧格式已迁移。');
      } catch (error) {
        this.message('打开失败：' + error.message, true);
      }
    };
    $('save-project').onclick = () => this.saveNative(false);
    $('save-as').onclick = () => this.saveNative(true);
    $('export-room').onclick = () => {
      const id =
        this.state.route === 'course'
          ? this.state.graphSelection?.kind === 'room' && this.state.graphSelection.id
          : this.state.route === 'room'
            ? this.state.roomId
            : null;
      if (id) this.exportRoom(this.state.courseId, id);
    };
    $('export-project').onclick = async () => {
      try {
        const bytes = Archive.pack(this.store.project, this.store.assetFiles);
        if (window.desktopAPI) {
          const saved = await window.desktopAPI.exportArchive({
            name: this.store.project.name,
            bytes,
          });
          if (saved) this.message('项目包已导出：' + saved.path);
        } else {
          download(this.store.project.name + '.zip', bytes, 'application/zip');
          this.message('项目包已导出，包含项目数据和素材。');
        }
      } catch (e) {
        this.message(e.message, true);
      }
    };
    $('open-assets').onclick = () => this.go('assets');
    $('open-definitions').onclick = () => this.go('definitions');
    $('asset-files').onchange = async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      await this.addAssetInputs(files.map((file) => ({ name: file.name, file })));
    };
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea,select') || $('dialog').open) return;
      if (this.game) {
        if (
          [
            'Space',
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'ShiftLeft',
            'ShiftRight',
          ].includes(e.code)
        )
          e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'Escape') {
          this.game.togglePause();
          this.clearInputs();
          return;
        }
        if (e.code === 'KeyR') {
          this.game.retry();
          this.clearInputs();
          return;
        }
        this.keys.add(e.code);
        if (['Space', 'KeyW', 'ArrowUp'].includes(e.code)) this.edges.jumpPressed = true;
        if (['ShiftLeft', 'ShiftRight'].includes(e.code)) this.edges.dashPressed = true;
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        e.shiftKey ? this.store.redo() : this.store.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        this.store.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        $('save-project').click();
      } else if (this.state.route === 'room') {
        if (e.code === 'KeyM') this.setRoomTool?.('marquee');
        if (e.code === 'Escape') this.clearRoomSelection?.();
        if (['Delete', 'Backspace'].includes(e.code)) {
          e.preventDefault();
          this.deleteRoomSelection?.();
        }
        if (e.code === 'KeyB') this.setRoomTool?.('tile');
        if (e.code === 'KeyV') this.setRoomTool?.('select');
        if (e.code === 'KeyX') this.setRoomTool?.('erase');
      }
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      if (this.game?.mode === 'playing') this.game.togglePause();
      this.clearInputs();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game?.mode === 'playing') this.game.togglePause();
      this.clearInputs();
    });
  }
  render() {
    document.body.classList.toggle('room-editing', ['room', 'play'].includes(this.state.route));
    $('app').style.height = '';
    this.currentDraw = null;
    this.setRoomTool = null;
    this.nodePanelRefresh = null;
    const p = this.store.project,
      c = this.course();
    if (!p.courses.some((c) => c.id === this.state.courseId)) this.state.courseId = p.courses[0].id;
    $('breadcrumbs').innerHTML =
      '<button id="crumb-project">项目</button>' +
      (this.state.route !== 'home' ? ` / <button id="crumb-course">${esc(c.name)}</button>` : '') +
      (this.state.route === 'room' ? ` / <span>${esc(this.room().name)}</span>` : '');
    $('crumb-project').onclick = () => this.go('home');
    if ($('crumb-course')) $('crumb-course').onclick = () => this.go('course');
    if (this.state.route === 'home') Home.render(this);
    else if (this.state.route === 'course') Course.render(this);
    else if (this.state.route === 'room') Room.render(this);
    else if (this.state.route === 'play') PlayPage.render(this);
    else if (this.state.route === 'assets') AssetPage.render(this);
    else if (this.state.route === 'definitions') DefinitionPage.render(this);
    this.updateRoomExport();
    if ($('back-home')) $('back-home').onclick = () => this.go('home');
    const v = M.validate(p);
    this.message(
      v.errors.length
        ? v.errors[0]
        : v.warnings.length
          ? '设计提示：' + v.warnings[0]
          : this.store.dirty
            ? '修改已保存到本地草稿'
            : '项目数据有效',
      !!v.errors.length,
    );
  }
  updateRoomExport() {
    const id =
      this.state.route === 'room'
        ? this.state.roomId
        : this.state.route === 'course' && this.state.graphSelection?.kind === 'room'
          ? this.state.graphSelection.id
          : null;
    const room = this.course().rooms.find((r) => r.id === id);
    $('export-room').disabled = !room;
    $('export-room').title = room
      ? '导出 ' + room.name + '（含素材）'
      : '编辑房间或在接线板选择一个房间后导出';
  }
  async exportRoom(courseId, roomId) {
    try {
      const project = require('../project/room-export.cjs').standalone(
          this.store.project,
          courseId,
          roomId,
        ),
        bytes = Archive.pack(project, this.store.assetFiles);
      if (window.desktopAPI) {
        const saved = await window.desktopAPI.exportArchive({
          name: project.name + '-单房间',
          bytes,
        });
        if (saved) this.message('单房间项目包已导出：' + saved.path);
      } else {
        download(project.name + '-单房间.zip', bytes, 'application/zip');
        this.message('单房间已导出，包含机关参数和所需素材。');
      }
    } catch (e) {
      this.message('导出房间失败：' + e.message, true);
    }
  }
  renderBindings(c, host) {
    Bindings.renderCourse(this, c, host);
  }
  renderObjectArt(o, d, host) {
    Bindings.renderObject(this, o, d, host);
  }
  async pickAssets(replaceId = null) {
    this.state.replacingAssetId = replaceId;
    if (window.desktopAPI) {
      try {
        const inputs = await window.desktopAPI.importAssets();
        await this.addAssetInputs(replaceId ? inputs.slice(0, 1) : inputs);
      } catch (e) {
        this.message(e.message, true);
      }
    } else {
      $('asset-files').multiple = !replaceId;
      $('asset-files').click();
    }
  }
  async addAssetInputs(inputs) {
    try {
      for (const input of inputs) {
        const bytes = input.bytes
            ? new Uint8Array(input.bytes)
            : new Uint8Array(await input.file.arrayBuffer()),
          ext = input.name.split('.').at(-1).toLowerCase(),
          size = await Assets.dimensions(bytes, Assets.MIME[ext]);
        await Assets.importAsset(this.store, {
          name: input.name,
          bytes,
          ...size,
          courseId: this.course().id,
          ...(this.state.assetImportFolder || {}),
          replaceId: this.state.replacingAssetId,
        });
        this.state.replacingAssetId = null;
      }
      this.message('素材已导入，保存/导出项目包会带上图片。');
    } catch (e) {
      this.message('素材导入失败：' + e.message, true);
    }
  }
  async openNative() {
    try {
      const loaded = await window.desktopAPI.openProject();
      if (!loaded) return;
      if (loaded.archive) {
        const pack = Archive.unpack(new Uint8Array(loaded.archive));
        for (const [key, bytes] of pack.files) {
          this.store.assetFiles.set(key, bytes);
          await Assets.putBlob(key, bytes);
        }
        this.store.load(pack.project);
      } else {
        for (const file of loaded.files) {
          this.store.assetFiles.set(file.path, new Uint8Array(file.bytes));
          await Assets.putBlob(file.path, file.bytes);
        }
        this.store.load(loaded.project);
        this.store.nativeSession = loaded.session;
        if (loaded.cloudStatus) this.cloud.status = loaded.cloudStatus;
      }
      this.store.history.clear();
      this.store.dirty = false;
      this.state.courseId = this.store.project.courses[0].id;
      this.go('home');
      this.message(
        loaded.missing?.length
          ? '已打开，缺失 ' + loaded.missing.length + ' 个素材：' + loaded.missing.join(', ')
          : '项目已打开：' + (loaded.path || loaded.name),
      );
    } catch (e) {
      this.message('打开失败：' + e.message, true);
    }
  }
  confirmUnsaved(label, action) {
    if (this.game) {
      this.stopPlay(() => this.confirmUnsaved(label, action));
      return;
    }
    if (!this.store.dirty) {
      action();
      return;
    }
    if ($('dialog').open) $('dialog').close();
    modal(
      '是否保存当前修改？',
      `<p>当前项目有未保存的修改。${esc(label)}前是否先保存？</p><p class="muted">本机草稿和云备份不能替代你选择位置保存的项目文件。</p><p id="save-guard-feedback" role="status"></p>`,
      [
        { label: '取消' },
        { label: '不保存并继续', action },
        {
          label: '保存后继续',
          primary: true,
          close: false,
          action: async () => {
            const buttons = [...$('dialog-actions').querySelectorAll('button')];
            buttons.forEach((b) => (b.disabled = true));
            const saved = await this.saveNative(false, true);
            if (saved) {
              $('dialog').close();
              action();
            } else {
              $('save-guard-feedback').textContent = '尚未完成保存，操作已保留在当前页面。';
              buttons.forEach((b) => (b.disabled = false));
            }
          },
        },
      ],
    );
  }
  newCourse() {
    this.confirmUnsaved('新建大关', () => {
      let course;
      this.store.change((p) => {
        course = require('../project/courses.cjs').add(p);
      });
      this.go('course', { courseId: course.id, roomId: course.rooms[0].id });
      this.message('已在当前项目中新建大关，其他大关与房间保留。');
    });
  }
  async saveNative(saveAs = false, complete = false) {
    this.store.persist();
    if (!window.desktopAPI) {
      if (complete) {
        try {
          download(
            this.store.project.name + '.zip',
            Archive.pack(this.store.project, this.store.assetFiles),
            'application/zip',
          );
          this.store.dirty = false;
          return true;
        } catch (e) {
          this.message('保存失败：' + e.message, true);
          return false;
        }
      }
      download(
        this.store.project.name + '.json',
        JSON.stringify(require('../project/collision.cjs').portable(this.store.project), null, 2),
      );
      this.store.dirty = false;
      this.message('浏览器草稿已保存；完整素材请导出项目包。');
      return true;
    }
    try {
      const files = this.store.project.assets
        .filter((a) => this.store.assetFiles.has(a.path))
        .map((a) => ({ path: a.path, bytes: this.store.assetFiles.get(a.path) }));
      const result = await window.desktopAPI.saveProject({
        project: this.store.snapshot(),
        files,
        session: this.store.nativeSession,
        saveAs,
      });
      if (result) {
        this.store.nativeSession = result.session;
        if (result.cloudStatus) this.cloud.status = result.cloudStatus;
        this.store.dirty = false;
        this.message('项目与素材已保存：' + result.file);
        if (window.desktopAPI?.cloud) this.cloud.saveVersion('保存项目').catch(() => {});
        return true;
      }
    } catch (e) {
      this.message('保存失败：' + e.message, true);
    }
    return false;
  }
  clearInputs() {
    this.keys.clear();
    this.edges = {};
    this.acc = 0;
  }
  startPlay(roomId, entryId) {
    try {
      this.game = new Engine(this.store.project, this.course().id, roomId, entryId);
      this.traceRecorder = new Recorder(this.game);
      this.clearInputs();
      this.go('play');
    } catch (e) {
      this.message('不能试玩：' + e.message, true);
    }
  }
  stopPlay(after = null) {
    if (!this.game) {
      after?.();
      return;
    }
    const game = this.game,
      roomId = game.room.id,
      wasPlaying = game.mode === 'playing';
    if (wasPlaying) game.togglePause();
    this.clearInputs();
    const finish = () => {
      this.game = null;
      this.traceRecorder = null;
      this.clearInputs();
      if (after) after();
      else this.go('room', { roomId });
    };
    if ($('dialog').open) $('dialog').close();
    const lives = require('../project/play-traces.cjs').pendingLives(this.traceRecorder);
    modal(
      '是否保存这次试玩路径？',
      `<p>展开本次试玩的每条命，勾选要保存的路径；可自定义名称，默认使用生命编号。已有记录保留。</p><div class="trace-life-choices">${lives.map((l) => `<label class="check"><input type="checkbox" data-exit-life="${l.number}" checked><b>${l.number}</b><span>${l.points} 点 · ${l.rooms} 个房间</span></label>`).join('') || '<p>本次尚无录制。</p>'}</div><p id="exit-trace-feedback" role="status"></p>`,
      [
        {
          label: '继续试玩',
          action: () => {
            if (wasPlaying && game.mode === 'paused') game.togglePause();
            this.clearInputs();
          },
        },
        { label: '不保存并退出', action: finish },
        {
          label: '保存路径并退出',
          primary: true,
          close: false,
          action: () => {
            try {
              const chosen = [...document.querySelectorAll('[data-exit-life]:checked')].map((n) =>
                Number(n.dataset.exitLife),
              );
              this.store.change(() => {
                require('../project/play-traces.cjs').saveRecording(
                  this.course(),
                  this.traceRecorder,
                  require('./trace-names.cjs').read($('dialog-content'), 'data-exit-life-name'),
                  chosen,
                );
              });
              $('dialog').close();
              finish();
            } catch (e) {
              $('exit-trace-feedback').textContent = e.message;
            }
          },
        },
      ],
    );
    require('./trace-names.cjs').install(
      $('dialog-content'),
      '[data-exit-life]',
      'data-exit-life-name',
      this.course(),
      this.traceRecorder,
    );
    require('./trace-selection-buttons.cjs').install(
      $('dialog-content'),
      '[data-exit-life]',
      'exit-trace',
      $('dialog-content').querySelector('.trace-life-choices'),
    );
    $('dialog').addEventListener(
      'cancel',
      () => {
        if (wasPlaying && this.game === game && game.mode === 'paused') game.togglePause();
        this.clearInputs();
      },
      { once: true },
    );
  }
  frame() {
    const now = performance.now(),
      dt = Math.min((now - (this.last || now)) / 1000, 0.05);
    this.last = now;
    if (this.game?.mode === 'playing') {
      this.acc += dt;
      while (this.acc >= 1 / 120) {
        this.game.update(1 / 120, {
          left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
          right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
          up: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
          down: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
          ...this.edges,
        });
        this.edges = {};
        this.traceRecorder?.capture(this.game);
        this.acc -= 1 / 120;
      }
    } else this.acc = 0;
    this.currentDraw?.();
    requestAnimationFrame(() => this.frame());
  }
  snapshot() {
    return {
      project: this.store.snapshot(),
      state: { ...this.state },
      history: { undo: this.store.history.past.length, redo: this.store.history.future.length },
      game: this.game?.snapshot() || null,
    };
  }
}
const app = new App();
window.__ROOM_LAB__ = { snapshot: () => app.snapshot() };
