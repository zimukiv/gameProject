'use strict';
const { $, esc, modal } = require('./dom.cjs'),
  Assets = require('../assets/manager.cjs'),
  CloudGraph = require('./cloud-graph-panel.cjs'),
  { merge } = require('../project/merge.cjs');
class CloudController {
  constructor(app) {
    this.app = app;
    this.api = window.desktopAPI;
    this.status = null;
    this.tail = Promise.resolve();
    this.paused = false;
    this.generation = 0;
    this.retryAt = 0;
    this.liveInfo = { online: false, peers: 0 };
    if (!this.api?.cloud) return;
    document.addEventListener(
      'pointerdown',
      () => {
        this.interacting = true;
        this.generation++;
      },
      true,
    );
    document.addEventListener(
      'pointerup',
      () => {
        this.interacting = false;
      },
      true,
    );
    document.addEventListener(
      'pointercancel',
      () => {
        this.interacting = false;
      },
      true,
    );
    app.store.subscribe(() => this.changed());
    this.enqueue(async () => {
      this.status = await this.api.cloud('status');
      this.updateBadge();
    });
    this.interval = setInterval(() => {
      if (
        this.status?.mode === 'live' &&
        this.status.configured &&
        !this.paused &&
        Date.now() > this.retryAt
      )
        this.liveTick();
    }, 1000);
    this.api.onClosing?.(() => {
      const finish = async () => {
        try {
          await this.tail;
          await this.backup();
          clearInterval(this.interval);
          clearTimeout(this.timer);
          this.api.closeReady();
        } catch (e) {
          app.message('退出前草稿备份失败：' + e.message, true);
          this.api.closeFailed();
        }
      };
      if (this.api.isTest) finish();
      else app.confirmUnsaved('退出编辑器', finish);
    });
    this.changed();
  }
  enqueue(fn) {
    const p = this.tail.then(fn);
    this.tail = p.catch((e) => this.app.message('云同步：' + e.message + '（本机草稿保留）', true));
    return p;
  }
  capture() {
    return {
      project: this.app.store.snapshot(),
      files: [...this.app.store.assetFiles].map(([p, b]) => [p, new Uint8Array(b)]),
      treeId: this.status?.current || null,
    };
  }
  changed() {
    if (this.paused) return;
    this.generation++;
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.backup().catch((e) => this.app.message('草稿备份失败：' + e.message, true)),
      1200,
    );
    this.updateBadge();
  }
  updateBadge() {
    if ($('cloud-live-conflict'))
      $('cloud-live-conflict').hidden = !this.liveInfo.conflicts?.length;
    const b = $('open-cloud');
    if (b)
      b.textContent =
        '☁ ' +
        (this.status?.mode === 'live'
          ? this.liveInfo.online
            ? '即时协作 · ' + this.liveInfo.peers + ' 端'
            : '即时协作 · 等待对端'
          : '保存同步');
    const n = $('cloud-live-state');
    if (n)
      n.textContent = this.liveInfo.conflicts?.length
        ? '同一字段冲突，协作已暂停，请选择处理方式'
        : this.liveInfo.online
          ? '双方在线 · 即时协作中'
          : '等待另一端打开同一来源版本';
  }
  async backup() {
    this.status = await this.api.cloud('draft', this.capture());
    this.updateBadge();
    return this.status;
  }
  saveVersion(message = '手动保存同步', capture = this.capture(), parentRevision) {
    return this.enqueue(async () => {
      const saved = await this.api.cloud('draft', capture);
      try {
        this.status = await this.api.cloud('manualSave', {
          message,
          treeId: saved.savedTreeId,
          ...(parentRevision ? { parentRevision } : {}),
        });
        this.app.message(this.status.message);
      } finally {
        this.status = await this.api.cloud('status');
        this.updateBadge();
      }
    });
  }
  async apply(data, live = false) {
    const focused = document.activeElement,
      focus =
        live && focused?.id && /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName)
          ? {
              id: focused.id,
              value: focused.value,
              start: focused.selectionStart,
              end: focused.selectionEnd,
            }
          : null;
    this.paused = true;
    try {
      if (!live) {
        this.app.game = null;
        this.app.clearInputs();
        for (const u of this.app.assetURLs.values()) URL.revokeObjectURL(u);
        this.app.assetURLs.clear();
        this.app.store.assetFiles = new Map();
      }
      for (const [p, b] of data.files) this.app.store.assetFiles.set(p, new Uint8Array(b));
      this.app.store.project = data.project;
      this.app.store.history.clear();
      this.app.store.nativeSession = null;
      this.app.store.dirty = true;
      this.app.store.persist();
      if (data.status) this.status = data.status;
      if (live) {
        if (!this.app.game) this.app.render();
      } else {
        this.app.state.courseId = data.project.courses[0].id;
        this.app.state.roomId = data.project.courses[0].rooms[0].id;
        this.app.go('home');
      }
      if (focus && $(focus.id)) {
        $(focus.id).value = focus.value;
        $(focus.id).focus();
        try {
          $(focus.id).setSelectionRange(focus.start, focus.end);
        } catch {}
      }
    } finally {
      this.paused = false;
      this.updateBadge();
    }
    await Promise.all(data.files.map(([p, b]) => Assets.putBlob(p, b)));
  }
  async liveTick() {
    if (this.liveBusy || this.interacting) return;
    this.liveBusy = true;
    const sent = this.capture();
    try {
      const result = await this.api.cloud('live', sent);
      if (this.interacting)
        await new Promise((resolve) => {
          const done = () => {
            document.removeEventListener('pointerup', done);
            document.removeEventListener('pointercancel', done);
            resolve();
          };
          document.addEventListener('pointerup', done, { once: true });
          document.addEventListener('pointercancel', done, { once: true });
        });
      this.liveInfo = result;
      this.retryAt = 0;
      if (
        result.project &&
        this.status?.mode === 'live' &&
        this.status.current === sent.treeId &&
        sent.project.id === this.app.store.project.id
      ) {
        const combined = merge(sent.project, this.app.store.snapshot(), result.project);
        if (combined.conflicts.length) {
          this.app.message('即时修改有冲突，本机内容已保留。请打开云同步处理。', true);
          await this.api.cloud('holdLive', {
            paths: combined.conflicts,
            project: result.project,
            files: result.files,
          });
          this.liveInfo.conflicts = combined.conflicts;
        }
        await this.apply({ project: combined.value, files: result.files }, true);
        await this.backup();
      }
      this.updateBadge();
    } catch (e) {
      this.retryAt = Date.now() + 10000;
      this.app.message('即时协作：' + e.message, true);
    } finally {
      this.liveBusy = false;
    }
  }
  async show() {
    if (!this.api?.cloud) {
      modal('云同步与工作树', '<p>请使用 Windows 桌面版。</p>', [{ label: '关闭' }]);
      return;
    }
    try {
      await this.enqueue(() => this.backup());
      this.graphSelected = null;
      this.graphView = null;
      this.remoteState = null;
      await this.render();
      // Open the window before network access so an offline relay cannot hide connection controls.
      const epoch = this.dialogEpoch;
      if (this.status.configured) {
        $('cloud-graph-stage').innerHTML = '<p class="cloud-graph-empty">正在读取云端节点…</p>';
        try {
          const state = await this.api.cloud('remote');
          if (this.dialogEpoch === epoch && $('dialog').open && $('cloud-graph-stage')) {
            this.remoteState = state;
            this.graphPanel.draw();
            this.graphPanel.fit();
          }
        } catch (e) {
          if (this.dialogEpoch === epoch && $('dialog').open && $('cloud-feedback')) {
            $('cloud-feedback').textContent = e.message;
            this.graphPanel.draw();
          }
        }
      }
    } catch (e) {
      this.app.message(e.message, true);
    }
  }
  async render(notice = '') {
    this.dialogEpoch = (this.dialogEpoch || 0) + 1;
    this.dialogBusy = false;
    this.status = await this.api.cloud('status');
    const s = this.status,
      t = s.trees.find((t) => t.id === s.current);
    if (this.graphContext && this.graphContext !== s.current) this.graphSelected = null;
    this.graphContext = s.current;
    if ($('dialog').open) $('dialog').close();
    modal(
      '云同步与工作树',
      `<div class="cloud-panel"><p class="cloud-status">${s.configured ? (s.networkState === 'verified' ? '● 已连接私有云端（本次验证成功）' : s.networkState === 'failed' ? '○ 已导入密钥，网络验证失败' : '○ 已导入密钥，尚未验证网络') : s.connectionState === 'unreadable' ? '○ 连接配置读取失败' : '○ 尚未导入连接密钥'} · 设备 ${esc(s.device)}<br>${esc(s.message)}<small>${esc(s.endpoint || '')}</small></p>
      <p id="cloud-feedback" role="status" tabindex="-1">${esc(notice || s.connectionError || (!s.configured ? '请先导入主电脑复制的完整密钥。下方 rlsync1.… 只是占位提示。' : ''))}</p>
      <section class="cloud-section"><h3>① 导出 / 导入连接密钥</h3><details ${s.configured ? '' : 'open'}><summary>连接设置 / 两端共用同一密钥</summary><p>在已配置的电脑复制密钥，在另一端粘贴导入。密钥可访问整个工作区，请私下发送。</p><textarea id="cloud-key" spellcheck="false" autocomplete="off" placeholder="粘贴主电脑复制的完整 rlsync1.… 密钥"></textarea><div class="button-row"><button id="cloud-connect" disabled>导入连接密钥</button><button id="cloud-copy" ${s.configured ? '' : 'disabled'}>复制导出连接密钥</button></div></details>
      <div class="button-row"><button id="cloud-diagnose">检查连接</button><span>检查密钥、配置读取与云端认证；不会上传关卡。</span></div><div class="button-row"><label>同步模式 <select id="cloud-mode"><option value="manual" ${s.mode === 'manual' ? 'selected' : ''}>手动保存同步</option><option value="live" ${s.mode === 'live' ? 'selected' : ''}>即时协作（双方在线）</option></select></label><span id="cloud-live-state"></span></div><p class="muted">即时模式约每秒交换草稿；双方需读取同一云端版本。修改不会自动创建工作树版本，手动保存才从上次读取版本建立子分支。离线保留本机恢复草稿。</p>
      </section>${CloudGraph.render()}<section class="cloud-section"><h3>③ 新建云端分支</h3><div class="button-row"><input id="cloud-version-name" placeholder="版本说明，如：喷气房难度调整"><button id="cloud-sync" class="primary">新建云端分支</button></div>
      <div id="cloud-live-conflict" ${this.liveInfo.conflicts?.length ? '' : 'hidden'}><p>同一字段有不同修改，双方草稿已保留，暂未自动覆盖。先保存本机分支也可再选择。</p><button id="live-keep-local">采用本机草稿继续</button><button id="live-use-remote">采用对端草稿</button></div>
      </section></div>`,
      [{ label: '关闭' }],
    );
    const run = (fn) => async () => {
      const panel = $('dialog-content').querySelector('.cloud-panel'),
        wasOpen = $('dialog').open;
      const stillHere = () => !wasOpen || ($('dialog').open && panel?.isConnected);
      const buttons = [...$('dialog-content').querySelectorAll('button')];
      this.dialogBusy = true;
      buttons.forEach((b) => (b.disabled = true));
      try {
        await fn();
        if (stillHere()) await this.render();
      } catch (e) {
        if (stillHere()) {
          await this.render(e.message);
          $('dialog-content').scrollTop = 0;
          $('cloud-feedback').focus({ preventScroll: true });
        } else this.app.message(e.message, true);
      }
    };
    $('cloud-open-manager').onclick = run(() => this.api.cloud('openManager'));
    $('cloud-diagnose').onclick = run(async () => {
      this.status = await this.api.cloud('diagnose');
    });
    $('cloud-key').oninput = () => {
      $('cloud-connect').disabled = this.dialogBusy || !$('cloud-key').value.trim();
    };
    $('cloud-connect').onclick = run(async () => {
      const key = $('cloud-key').value.trim();
      $('cloud-key').value = '';
      this.status = await this.api.cloud('connect', { key });
      this.graphSelected = null;
      this.graphView = null;
      this.remoteState = await this.api.cloud('remote');
    });
    $('cloud-copy').onclick = async () => {
      try {
        await this.api.cloud('copyKey');
        $('cloud-feedback').textContent = '连接密钥已复制，请私下发送。';
      } catch (e) {
        await this.render(e.message);
      }
    };
    $('cloud-mode').onchange = run(async () => {
      this.status = await this.api.cloud('mode', { mode: $('cloud-mode').value });
      this.liveInfo = { online: false, peers: 0 };
      this.retryAt = 0;
      this.updateBadge();
    });
    $('cloud-sync').onclick = run(() =>
      this.saveVersion(
        $('cloud-version-name').value.trim() || '手动保存同步',
        this.capture(),
        this.graphSelected,
      ).then(async () => {
        this.remoteState = this.status.configured ? await this.api.cloud('remote') : null;
      }),
    );
    for (const [id, choice] of [
      ['live-keep-local', 'local'],
      ['live-use-remote', 'remote'],
    ])
      $(id).onclick = run(async () => {
        const data = await this.api.cloud('resolveLive', { choice });
        if (data.project) await this.apply(data, true);
        this.liveInfo.conflicts = [];
      });
    this.graphPanel = CloudGraph.bind(this, {
      refresh: run(async () => {
        this.remoteState = await this.api.cloud('remote');
        if (
          this.graphSelected &&
          !CloudGraph.layout(this.remoteState).nodes.some((n) => n.id === this.graphSelected)
        )
          this.graphSelected = null;
      }),
      checkout: (id) =>
        this.app.confirmUnsaved('切换到云端版本', () =>
          run(() =>
            this.enqueue(async () => {
              await this.backup();
              await this.apply(await this.api.cloud('checkoutRevision', { id }));
              this.graphSelected = null;
              this.remoteState = await this.api.cloud('remote');
            }),
          )(),
        ),
      upload: (id) =>
        run(async () => {
          await this.saveVersion(
            $('cloud-version-name').value.trim() || '手动保存同步',
            this.capture(),
            id,
          );
          this.remoteState = await this.api.cloud('remote');
        })(),
    });
    $('cloud-open-manager').disabled = !s.configured;
    this.updateBadge();
  }
}
module.exports = { CloudController };
