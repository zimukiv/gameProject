'use strict';
const M = require('../../project/model.cjs'),
  Registry = require('../../plugins/registry.cjs'),
  D = require('../draw.cjs'),
  { esc, $, field, area, select, check, modal } = require('../dom.cjs');
const { clamp } = require('../../shared/utils.cjs');
const Palette = require('../palette.cjs');
const TraceManager = require('../trace-manager.cjs');
const CameraPanel = require('../room-camera-panel.cjs');
const Collision = require('../../project/collision.cjs');
const Temperature = require('../../project/temperature.cjs');
const Limits = require('../../project/room-limits.cjs');
const Select = require('../../project/selection.cjs');
const Nodes = require('../../project/rail-nodes.cjs'),
  NodePanel = require('../rail-node-panel.cjs'),
  Motion = require('../../project/brick-motion.cjs'),
  BrickPanel = require('../brick-node-panel.cjs'),
  Regions = require('../region-handles.cjs');
const brickRef = (brick) => ({ kind: 'movables', id: brick.id });
const RoomKeys = require('../room-keys.cjs');
const nodeTools = ['path', 'brick-path'];
function expandGroups(room, refs) {
  return Select.combine(
    [],
    refs.flatMap((ref) =>
      ref.kind === 'movables'
        ? Motion.groupMembers(room, Select.get(room, ref)).map(brickRef)
        : [ref],
    ),
  );
}
function selectRepresentative(room, state) {
  if (state.selection?.kind !== 'movables') return;
  const representative = Motion.representative(
    Motion.groupMembers(room, Select.get(room, state.selection)),
  );
  if (representative) state.selection = brickRef(representative);
}
function render(app) {
  let r = app.room();
  const c = app.course(),
    s = app.state;
  if (!s.selection && ['brick-bind', 'brick-path'].includes(s.tool)) s.tool = 'select';
  s.multiSelection = (s.multiSelection || []).filter((ref) => Select.get(r, ref));
  selectRepresentative(r, s);
  if (s.keyHints === undefined) {
    try {
      s.keyHints = localStorage.getItem('room-lab-key-hints') !== 'off';
    } catch {
      s.keyHints = true;
    }
  }
  $('app').innerHTML =
    `<div class="room-shell ${s.keyHints ? 'show-key-hints' : ''}"><div class="room-title"><div><h1>${esc(r.name)}</h1><span class="room-size-tag">${r.cols} × ${r.rows} 格</span></div><div class="actions"><button id="back-course">接线板</button><button id="room-traces">试玩路径</button><button id="room-help">⌨ 按键说明</button><button id="room-hints" aria-pressed="${s.keyHints}">按键提示</button><button id="toggle-inspector">${s.inspectorHidden ? '显示属性' : '收起属性'}</button><button id="play-room" aria-label="试玩此房" class="primary">▶ 试玩此房</button></div></div><div class="room-tabs" aria-label="本大关房间"><span class="room-tabs-label">${esc(c.name)} / 房间</span><div>${c.rooms.map((v) => `<button data-nav-room="${esc(v.id)}" aria-current="${v.id === r.id ? 'page' : 'false'}" class="${v.id === r.id ? 'active' : ''}" title="${esc(v.notes)}">${esc(v.name)}</button>`).join('')}</div></div><div class="room-workspace ${s.inspectorHidden ? 'inspector-hidden' : ''}"><section class="panel canvas-panel room-canvas-panel"><div class="room-toolstrip"><div class="actions"><button data-tool="select">↖ 选择<span class="key-hint" aria-hidden="true">${RoomKeys.tools.select}</span></button><button data-tool="marquee">▧ 框选<span class="key-hint" aria-hidden="true">${RoomKeys.tools.marquee}</span></button><button data-tool="erase">⌫ 擦除<span class="key-hint" aria-hidden="true">${RoomKeys.tools.erase}</span></button><button id="undo">撤销<span class="key-hint" aria-hidden="true">Ctrl Z</span></button><button id="redo">重做<span class="key-hint" aria-hidden="true">Ctrl Y</span></button></div><div class="actions"><button id="fit-room">适应房间</button><label class="check"><input id="targets" type="checkbox" checked>关联目标</label></div></div><div class="block-palette" aria-label="方块选择栏">${Palette.render(app, c)}</div><div class="canvas-heading"><span id="tool-label"></span><span><span id="room-pointer"></span> · <span id="room-zoom"></span></span></div><div class="canvas-wrap"><canvas id="room-canvas" width="960" height="540" tabindex="0" aria-label="房间编辑画布"></canvas></div></section><aside class="panel inspector form" id="room-inspector"></aside></div></div>`;
  const settingsButton = document.createElement('button');
  settingsButton.id = 'room-settings';
  settingsButton.textContent = '房间设置';
  $('room-traces').before(settingsButton);
  settingsButton.onclick = () => {
    s.selection = null;
    s.multiSelection = [];
    s.inspectorHidden = false;
    app.render();
  };
  $('back-course').onclick = () => app.go('course');
  $('play-room').onclick = () => app.startPlay(r.id);
  $('room-traces').onclick = () => TraceManager.open(app, r.id);
  $('undo').onclick = () => app.store.undo();
  $('redo').onclick = () => app.store.redo();
  $('room-hints').onclick = () => {
    s.keyHints = !s.keyHints;
    $('app').querySelector('.room-shell').classList.toggle('show-key-hints', s.keyHints);
    $('room-hints').setAttribute('aria-pressed', String(s.keyHints));
    try {
      localStorage.setItem('room-lab-key-hints', s.keyHints ? 'on' : 'off');
    } catch {}
  };
  $('app').querySelector('.block-palette').onwheel = (e) => {
    const palette = e.currentTarget;
    if (palette.scrollWidth > palette.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      palette.scrollLeft += e.deltaY;
    }
  };
  $('toggle-inspector').onclick = () => {
    s.inspectorHidden = !s.inspectorHidden;
    app.render();
  };
  $('room-help').onclick = () =>
    modal(
      require('../../project/themes.cjs').theme(c.kind).label + ' · 按键说明',
      RoomKeys.help(c.kind),
      [{ label: '知道了' }],
    );
  $('undo').disabled = !app.store.history.past.length;
  $('redo').disabled = !app.store.history.future.length;
  $('app')
    .querySelectorAll('[data-nav-room]')
    .forEach((b) => (b.onclick = () => app.go('room', { roomId: b.dataset.navRoom })));
  require('../room-tab-order.cjs').bind(app, c, $('app').querySelector('.room-tabs > div'));
  const canvas = $('room-canvas'),
    ctx = canvas.getContext('2d');
  let stroke = null,
    hover = null;
  const fit = () => {
    s.roomView = D.fit(r, canvas.width, canvas.height, 22);
  };
  function size() {
    $('app').style.height =
      Math.max(500, window.innerHeight - $('app').getBoundingClientRect().top) + 'px';
    const width = Math.max(200, Math.round(canvas.clientWidth)),
      height = Math.max(200, Math.round(canvas.clientHeight));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }
  size();
  if (!s.roomView || s.roomViewRoom !== r.id) {
    fit();
    s.roomViewRoom = r.id;
  }
  app.currentDraw = () => {
    size();
    D.drawRoom(ctx, app.store.project, c, r, {
      view: s.roomView,
      selection: s.selection,
      selections: expandGroups(
        r,
        s.multiSelection.length ? s.multiSelection : s.selection ? [s.selection] : [],
      ),
      selectedRailNodeId: s.railNodeId,
      selectedBrickNodeIndex: s.brickNodeOwner === s.selection?.id ? s.brickNodeIndex : null,
      hover,
      targets: $('targets')?.checked,
      assetURL: (id) => app.assetURL(id),
    });
    if (stroke?.marquee || (stroke?.rightAction === 'bind' && stroke.moved)) {
      const a = stroke.pixel,
        b = stroke.currentPixel || a;
      ctx.save();
      ctx.fillStyle = '#70d9dd25';
      ctx.strokeStyle = '#80e4e4';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
      );
      ctx.strokeRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
      );
      ctx.restore();
    }
    $('room-zoom').textContent = Math.round(s.roomView.scale * 100) + '%';
    $('room-pointer').textContent = hover ? `X ${hover.x} / Y ${hover.y}` : `${r.cols} × ${r.rows}`;
    app.nodePanelRefresh?.();
  };
  const setTool = (value) => {
    if (nodeTools.includes(value) && !nodeTools.includes(s.tool))
      s.nodeReturnTool = s.tool || 'select';
    if (!nodeTools.includes(value)) s.nodeReturnTool = null;
    s.tool = value;
    if (!['select', 'marquee'].includes(value)) s.multiSelection = [];
    $('tool-label').textContent =
      value === 'brick-bind'
        ? '点击机关砖绑定或解绑 · Z 结束'
        : value === 'brick-path'
          ? '点击格子添加一个节点 · 添加后返回原工具'
          : value === 'path'
            ? '点击添加一个节点 · 添加后返回原工具'
            : value === 'object'
              ? '放置：' + Registry.get(s.objectType).name
              : {
                  select: '选择并移动对象 · Shift 左键追加 / 右键反选',
                  marquee: '拖框选择 · Shift 左键追加 / 右键反选 · 拖动选中对象整体移动',
                  tile: '放置地形 · 拖动画砖',
                  movable: '放置机关砖 · 在节点图规划路径',
                  erase: '擦除地形 / 方块',
                  entry: '放置房间入口',
                  exit: '放置房间出口',
                  zone: '拖画温控区域',
                }[value] || value;
    $('app')
      .querySelectorAll('[data-tool]')
      .forEach((b) => b.classList.toggle('active', b.dataset.tool === value));
    $('app')
      .querySelectorAll('[data-block-type]')
      .forEach((b) => {
        const active = value === 'object' && b.dataset.blockType === s.objectType;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    $('app')
      .querySelectorAll('.block-card[data-tool]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === value)));
    canvas.style.cursor = value === 'select' ? 'default' : 'crosshair';
    $('quick-bind-bricks')?.setAttribute('aria-pressed', String(value === 'brick-bind'));
  };
  $('app')
    .querySelectorAll('[data-tool]')
    .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('app')
    .querySelectorAll('[data-block-type]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          s.objectType = b.dataset.blockType;
          setTool('object');
        }),
    );
  $('fit-room').onclick = fit;
  setTool(s.tool || 'select');
  const pixel = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  const cell = (e) => {
    const p = pixel(e);
    return {
      x: Math.floor((p.x - s.roomView.x) / s.roomView.scale / 32),
      y: Math.floor((p.y - s.roomView.y) / s.roomView.scale / 32),
    };
  };
  const world = (e) => {
    const p = pixel(e);
    return {
      x: (p.x - s.roomView.x) / s.roomView.scale / 32,
      y: (p.y - s.roomView.y) / s.roomView.scale / 32,
    };
  };
  const nodeHit = (e) => {
    if (!['select', 'path'].includes(s.tool)) return null;
    const p = world(e),
      owners = r.objects
        .filter((o) => o.type === 'physics.rail' && !o.locked)
        .sort((a, b) => Number(b.id === s.selection?.id) - Number(a.id === s.selection?.id));
    for (const o of owners)
      for (const n of (o.params.path || []).slice().reverse())
        if (
          Math.abs(n.x - p.x) * 32 * s.roomView.scale <=
            Math.max(
              5,
              (Nodes.label(o.params.path.indexOf(n)).length * 4 + 5) * s.roomView.scale,
            ) &&
          Math.abs(n.y - p.y) * 32 * s.roomView.scale <= Math.max(5, 10 * s.roomView.scale)
        )
          return { owner: o, node: n };
    return null;
  };
  const brickNodeHit = (e) => {
    if (
      !['select', 'brick-path'].includes(s.tool) ||
      s.selection?.kind !== 'movables' ||
      !['nodes', 'behavior'].includes(s.inspectorTab)
    )
      return null;
    const brick = tileItem(s.selection);
    if (!brick || Motion.groupMembers(r, brick).some((member) => member.locked)) return null;
    const p = world(e);
    return Motion.nodes(brick)
      .map((node, index) => ({ node, index }))
      .reverse()
      .find(
        ({ node }) =>
          Math.hypot(node.x + 0.5 - p.x, node.y + 0.5 - p.y) * 32 * s.roomView.scale <= 10 &&
          (node.x !== brick.x || node.y !== brick.y),
      );
  };
  const regionHit = (e) => {
    if (s.tool !== 'select' || s.selection?.kind !== 'zones') return null;
    const z = D.findItem(r, s.selection);
    if (!z || z.locked) return null;
    const p = world(e);
    return (
      Regions.corners(z).find(
        (h) =>
          Math.abs(h.x - p.x) * 32 * s.roomView.scale <= 9 &&
          Math.abs(h.y - p.y) * 32 * s.roomView.scale <= 9,
      ) || null
    );
  };
  const item = () => D.findItem(r, s.selection);
  function hits(pos) {
    const result = [];
    for (const kind of ['entries', 'exits', 'objects', 'movables', 'zones'])
      for (const o of r[kind]) {
        if (pos.x >= o.x && pos.x < o.x + (o.w || 1) && pos.y >= o.y && pos.y < o.y + (o.h || 1))
          result.push({ kind, id: o.id });
      }
    if (r.tiles.some((t) => t.x === pos.x && t.y === pos.y))
      result.push({ kind: 'tiles', x: pos.x, y: pos.y });
    return result;
  }
  function tileItem(ref) {
    return ref?.kind === 'tiles'
      ? r.tiles.find((t) => t.x === ref.x && t.y === ref.y)
      : D.findItem(r, ref);
  }
  function paint(pos, tool = s.tool) {
    if (tool === 'brick-bind') {
      const pad = tileItem(s.selection),
        brick = r.movables.find((b) => b.x === pos.x && b.y === pos.y);
      if (Motion.isPad(pad) && brick) Motion.bind(r, brick, brick.padId === pad.id ? '' : pad.id);
      return;
    }
    if (tool === 'brick-path') {
      const brick = s.selection?.kind === 'movables' && tileItem(s.selection);
      if (!brick || !Motion.inRoom(pos, r.cols, r.rows)) return;
      const members = Motion.groupMembers(r, brick);
      if (members.some((member) => member.locked)) return;
      const path = Motion.nodes(brick);
      if (path.length >= Motion.maxNodes) return;
      const next = [...path, { ...pos, seconds: 0.45, mode: 'linear' }];
      if (!Motion.applyGroupPath(r, members, brick, next)) {
        stroke.error = '新增节点会让组内机关砖越界。';
        return;
      }
      s.brickNodeOwner = brick.id;
      s.brickNodeIndex = next.length - 1;
      stroke.nodeAdded = true;
      return;
    }
    if (pos.x < 0 || pos.y < 0 || pos.x >= r.cols || pos.y >= r.rows) return;
    if (s.tool === 'tile') {
      if (!r.tiles.some((t) => t.x === pos.x && t.y === pos.y))
        r.tiles.push({ ...pos, collision: true });
      return;
    }
    if (s.tool === 'erase') {
      r.tiles = r.tiles.filter((t) => t.x !== pos.x || t.y !== pos.y);
      const covers = (o) =>
        pos.x >= o.x && pos.x < o.x + (o.w || 1) && pos.y >= o.y && pos.y < o.y + (o.h || 1);
      const removed = new Set(r.objects.filter(covers).map((o) => o.id));
      r.objects = r.objects.filter((o) => !removed.has(o.id));
      const gone = new Set(r.movables.filter(covers).flatMap((b) => Motion.groupMembers(r, b)));
      r.movables = r.movables.filter((b) => !gone.has(b));
      for (const b of r.movables) if (removed.has(b.padId)) b.padId = '';
      for (const o of r.objects) if (removed.has(o.params?.unlockPadId)) o.params.unlockPadId = '';
      s.selection = null;
      return;
    }
    if (s.tool === 'entry') {
      const entry = {
        id: M.uid('entry'),
        name: '入口 ' + (r.entries.length + 1),
        notes: '',
        ...pos,
        face: 1,
      };
      r.entries.push(entry);
      s.selection = { kind: 'entries', id: entry.id };
      return;
    }
    if (s.tool === 'movable') {
      let brick = r.movables.find((b) => b.x === pos.x && b.y === pos.y);
      if (!brick) {
        brick = {
          id: M.uid('movable'),
          name: '机关砖',
          ...pos,
          targetX: pos.x,
          targetY: pos.y,
          padId: '',
          collision: true,
          notes: '',
          assetOverrides: {},
          motionPath: [],
        };
        r.movables.push(brick);
      }
      s.selection = { kind: 'movables', id: brick.id };
      s.inspectorTab = 'nodes';
      return;
    }
    if (s.tool === 'exit') {
      const exit = {
        id: M.uid('exit'),
        name: '出口 ' + (r.exits.length + 1),
        notes: '',
        x: pos.x,
        y: Math.min(pos.y, r.rows - 2),
        w: 1,
        h: 2,
      };
      r.exits.push(exit);
      s.selection = { kind: 'exits', id: exit.id };
      return;
    }
    if (s.tool === 'object') {
      let o = r.objects.find((o) => o.x === pos.x && o.y === pos.y && o.type === s.objectType);
      if (!o) {
        o = Registry.instantiate(app.store.project, s.objectType, M.uid('block'), pos.x, pos.y, c);
        r.objects.push(o);
      }
      s.selection = { kind: 'objects', id: o.id };
      return;
    }
    if (s.tool === 'zone') {
      const zone = {
        id: M.uid('zone'),
        name: '温控区 ' + (r.zones.length + 1),
        ...pos,
        w: 1,
        h: 1,
        initial: 'cold',
      };
      r.zones.push(zone);
      s.selection = { kind: 'zones', id: zone.id };
      stroke.zone = zone;
      return;
    }
    if (tool === 'path') {
      const o = tileItem(s.selection);
      if (o?.type !== 'physics.rail' || o.locked) return;
      if ((o.params.path?.length || 0) >= 64) {
        stroke.error = '轨道最多支持 64 个节点';
        return;
      }
      const n = Nodes.add(o, stroke.world);
      Nodes.move(o, n.id, n, r, stroke.fine ? 0.01 : 0.5);
      s.railNodeId = n.id;
      s.inspectorTab = 'nodes';
      stroke.nodeAdded = true;
    }
  }
  canvas.onpointerdown = (e) => {
    const owner = s.multiSelection.length <= 1 ? tileItem(s.selection) : null,
      rightAction =
        e.button === 2 &&
        !e.shiftKey &&
        (Motion.isPad(owner)
          ? 'bind'
          : owner?.type === 'physics.rail'
            ? 'path'
            : c.kind === 'calculus' && owner && s.selection.kind === 'movables'
              ? 'brick-path'
              : null);
    if (
      e.button !== 0 &&
      e.button !== 1 &&
      !rightAction &&
      !(e.button === 2 && e.shiftKey && ['select', 'marquee'].includes(s.tool))
    )
      return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    const pos = cell(e);
    hover = pos;
    stroke = {
      before: app.store.snapshot(),
      world: world(e),
      start: pos,
      last: pos,
      pixel: pixel(e),
      view: { ...s.roomView },
      pan: e.button === 1,
      rightAction,
      fine: e.altKey,
      rectangle: e.shiftKey && ['tile', 'erase'].includes(s.tool),
    };
    canvas.setPointerCapture(e.pointerId);
    if (stroke.pan || rightAction) return;
    const brickNode = brickNodeHit(e);
    if (brickNode && !e.shiftKey && s.multiSelection.length <= 1) {
      s.brickNodeOwner = s.selection.id;
      s.brickNodeIndex = brickNode.index;
      stroke.brickNode = { brick: tileItem(s.selection), index: brickNode.index };
      inspector(app, r, setTool);
      return;
    }
    if (['select', 'marquee'].includes(s.tool)) {
      const existing = s.multiSelection?.length
        ? s.multiSelection
        : s.selection
          ? [s.selection]
          : [];
      if (e.shiftKey) {
        stroke.marquee = {
          mode: e.button === 2 ? 'invert' : 'add',
          existing: expandGroups(r, existing),
        };
        return;
      }
      if (
        s.multiSelection.length &&
        hits(pos).some((ref) => s.multiSelection.some((x) => Select.key(x) === Select.key(ref)))
      ) {
        stroke.group = true;
        return;
      }
      if (s.tool === 'marquee') {
        stroke.marquee = { mode: 'replace', existing: [] };
        return;
      }
    }
    const handle = s.multiSelection.length > 1 ? null : regionHit(e);
    if (handle) {
      const z = D.findItem(r, s.selection);
      stroke.resize = { id: z.id, corner: handle.id, origin: { x: z.x, y: z.y, w: z.w, h: z.h } };
      return;
    }
    const node = s.multiSelection.length > 1 ? null : nodeHit(e);
    if (node) {
      s.selection = { kind: 'objects', id: node.owner.id };
      s.railNodeId = node.node.id;
      s.inspectorTab = 'nodes';
      stroke.node = { owner: node.owner, id: node.node.id };
      inspector(app, r, setTool);
      return;
    }
    if (s.tool === 'select') {
      s.multiSelection = [];
      const list = hits(pos),
        old = list.findIndex((v) => JSON.stringify(v) === JSON.stringify(s.selection));
      if (old >= 0 && !(s.selection.kind === 'zones' && list[0].kind !== 'zones')) {
        stroke.cycle = list.length > 1 ? list[(old + 1) % list.length] : null;
      } else s.selection = list[0] || null;
      selectRepresentative(r, s);
      if (!list.length) stroke.marquee = { mode: 'replace', existing: [] };
      inspector(app, r, setTool);
    } else paint(pos);
  };
  canvas.onpointermove = (e) => {
    hover = cell(e);
    if (!stroke) {
      const handle = regionHit(e);
      canvas.style.cursor = handle
        ? handle.cursor
        : nodeHit(e) || brickNodeHit(e)
          ? 'grab'
          : s.tool === 'select'
            ? 'default'
            : 'crosshair';
      return;
    }
    const pos = hover;
    const movedPixel = pixel(e);
    stroke.moved ||= Math.hypot(movedPixel.x - stroke.pixel.x, movedPixel.y - stroke.pixel.y) > 4;
    if (stroke.pan) {
      const p = pixel(e);
      s.roomView.x = stroke.view.x + p.x - stroke.pixel.x;
      s.roomView.y = stroke.view.y + p.y - stroke.pixel.y;
      return;
    }
    if (stroke.marquee || stroke.rightAction) {
      stroke.last = pos;
      stroke.currentPixel = pixel(e);
      return;
    }
    if (stroke.nodeAdded) return;
    if (stroke.group) {
      const dx = pos.x - stroke.last.x,
        dy = pos.y - stroke.last.y;
      if (Select.move(r, s.multiSelection, dx, dy)) stroke.last = pos;
      return;
    }
    if (stroke.node) {
      Nodes.move(stroke.node.owner, stroke.node.id, world(e), r, e.altKey ? 0.01 : 0.5);
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (stroke.brickNode) {
      const { brick, index } = stroke.brickNode;
      if (stroke.moved && Motion.inRoom(pos, r.cols, r.rows)) {
        const path = Motion.nodes(brick).map((n, i) => (i === index ? { ...n, ...pos } : n));
        Motion.applyGroupPath(r, Motion.groupMembers(r, brick), brick, path);
      }
      return;
    }
    if (stroke.resize) {
      const zone = r.zones.find((z) => z.id === stroke.resize.id);
      Object.assign(zone, Regions.resize(stroke.resize.origin, stroke.resize.corner, world(e), r));
      for (const [id, value] of [
        ['object-x', zone.x],
        ['object-y', zone.y],
        ['object-w', zone.w],
        ['object-h', zone.h],
      ])
        if ($(id)) $(id).value = value;
      return;
    }
    if (s.tool === 'select') {
      const o = tileItem(s.selection);
      if (o && !o.locked) {
        const dx = pos.x - stroke.last.x,
          dy = pos.y - stroke.last.y;
        if (
          s.selection.kind === 'tiles' &&
          r.tiles.some((t) => t !== o && t.x === o.x + dx && t.y === o.y + dy)
        )
          return;
        if (s.selection.kind === 'movables' && o.brickGroup) {
          const members = Motion.groupMembers(r, o);
          if (members.some((member) => member.locked)) return;
          Select.move(r, members.map(brickRef), dx, dy);
        } else if (s.selection.kind === 'movables') Motion.moveOwner(o, o.x + dx, o.y + dy);
        else if (o.type === 'physics.rail') Nodes.moveOwner(o, o.x + dx, o.y + dy);
        else {
          o.x += dx;
          o.y += dy;
        }
        if (s.selection.kind === 'tiles') {
          s.selection.x = o.x;
          s.selection.y = o.y;
        }
      }
    } else if (stroke.zone) {
      stroke.zone.x = Math.min(stroke.start.x, pos.x);
      stroke.zone.y = Math.min(stroke.start.y, pos.y);
      stroke.zone.w = Math.abs(pos.x - stroke.start.x) + 1;
      stroke.zone.h = Math.abs(pos.y - stroke.start.y) + 1;
    } else if (stroke.rectangle) {
      app.store.project = M.clone(stroke.before);
      r = app.room();
      for (let x = Math.min(pos.x, stroke.start.x); x <= Math.max(pos.x, stroke.start.x); x++)
        for (let y = Math.min(pos.y, stroke.start.y); y <= Math.max(pos.y, stroke.start.y); y++)
          paint({ x, y });
    } else if (
      ['tile', 'erase'].includes(s.tool) ||
      (s.tool === 'object' && !['common.portalIn', 'common.portalOut'].includes(s.objectType))
    ) {
      const dx = pos.x - stroke.last.x,
        dy = pos.y - stroke.last.y,
        n = Math.max(Math.abs(dx), Math.abs(dy));
      for (let i = 1; i <= n; i++)
        paint({
          x: Math.round(stroke.last.x + (dx * i) / n),
          y: Math.round(stroke.last.y + (dy * i) / n),
        });
    }
    stroke.last = pos;
  };
  const finish = (event) => {
    if (!stroke) return;
    if (stroke.rightAction) {
      const { rightAction, before, start, moved } = stroke;
      if (event.type === 'pointerup') {
        const end = cell(event);
        if (rightAction === 'bind') {
          const refs = Select.box(r, start, moved ? end : start).filter(
              (ref) => ref.kind === 'movables',
            ),
            bricks = expandGroups(r, refs).map((ref) => Select.get(r, ref)),
            padId = s.selection.id;
          const binding = bricks.every((brick) => brick.padId === padId) ? '' : padId;
          for (const brick of bricks) brick.padId = binding;
        } else if (!moved) {
          paint(start, rightAction);
          if (stroke.nodeAdded && rightAction === 'brick-path') s.inspectorTab = 'nodes';
        }
      }
      const error = stroke.error;
      stroke = null;
      app.store.commit(before);
      if (error) app.message(error, true);
      return;
    }
    if (stroke.marquee) {
      s.multiSelection = Select.combine(
        stroke.marquee.existing,
        expandGroups(r, Select.box(r, stroke.start, stroke.last)),
        stroke.marquee.mode,
      );
      s.selection = s.multiSelection.length === 1 ? s.multiSelection[0] : null;
      const selected = s.multiSelection.map((ref) => ref.kind === 'movables' && Select.get(r, ref));
      if (
        selected.length > 1 &&
        selected[0]?.brickGroup &&
        selected.every((brick) => brick?.brickGroup === selected[0].brickGroup)
      ) {
        s.selection = brickRef(Motion.representative(selected));
        s.multiSelection = [];
      }
      stroke = null;
      inspector(app, r, setTool);
      return;
    }
    if (!stroke.moved && stroke.cycle) s.selection = stroke.cycle;
    selectRepresentative(r, s);
    if (stroke.nodeAdded) setTool(s.nodeReturnTool || 'select');
    const before = stroke.before,
      pan = stroke.pan,
      error = stroke.error;
    stroke = null;
    if (!pan) app.store.commit(before);
    if (error) app.message(error, true);
  };
  canvas.onpointerup = finish;
  canvas.onpointercancel = finish;
  canvas.onlostpointercapture = finish;
  canvas.onwheel = (e) => {
    e.preventDefault();
    const p = pixel(e),
      v = s.roomView,
      next = clamp(v.scale * Math.exp(-e.deltaY * 0.001), 0.01, 3),
      world = { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
    s.roomView = { scale: next, x: p.x - world.x * next, y: p.y - world.y * next };
  };
  canvas.oncontextmenu = (e) => e.preventDefault();
  app.clearRoomSelection = () => {
    stroke = null;
    s.multiSelection = [];
    s.selection = null;
    if (nodeTools.includes(s.tool) || s.tool === 'brick-bind') setTool('select');
    inspector(app, r, setTool);
  };
  app.deleteRoomSelection = () =>
    removeSelection(
      app,
      r,
      expandGroups(
        r,
        s.multiSelection?.length ? s.multiSelection : s.selection ? [s.selection] : [],
      ),
    );
  app.setRoomTool = setTool;
  inspector(app, r, setTool);
}
function inspector(app, r, setTool) {
  app.nodePanelRefresh = null;
  const s = app.state,
    host = $('room-inspector'),
    ref = s.selection,
    o =
      ref?.kind === 'tiles'
        ? r.tiles.find((t) => t.x === ref.x && t.y === ref.y)
        : D.findItem(r, ref),
    tab = s.inspectorTab || 'base';
  if (s.multiSelection.length > 1) {
    const bricks = s.multiSelection.map((item) => item.kind === 'movables' && Select.get(r, item)),
      canGroup =
        app.course().kind === 'calculus' && bricks.every((brick) => brick && !brick.brickGroup),
      samePad = canGroup && bricks.every((brick) => brick.padId === bricks[0].padId),
      pads = r.objects.filter(Motion.isPad);
    host.innerHTML = `<h2>已选中 ${s.multiSelection.length} 项</h2>
      <p class="hint">拖动任一选中项可整体移动。Shift 左键追加，Shift 右键反选。</p>
      ${
        canGroup
          ? `${select('整组绑定踏板', 'group-pad', samePad ? bricks[0].padId : '', [
              ['', '仅编组，暂不绑定'],
              ...pads.map((pad) => [
                pad.id,
                (pad.name || Registry.get(pad.type).name) + ' · ' + pad.x + ', ' + pad.y,
              ]),
            ])}<p class="hint">编组时沿用最靠近中心的砖的路线与逐段参数。其余砖保持相对位置。</p><button id="group-bricks" class="apply primary">编组并应用绑定</button>`
          : ''
      }
      <button id="delete-selection" class="apply danger">删除所选</button><button id="clear-selection" class="apply">清空选择</button>`;
    $('delete-selection').onclick = () =>
      removeSelection(app, r, expandGroups(r, s.multiSelection));
    $('clear-selection').onclick = () => app.clearRoomSelection();
    if (canGroup) {
      $('group-bricks').disabled = bricks.some((brick) => brick.locked);
      $('group-bricks').onclick = () => {
        const anchor = Motion.representative(r.movables.filter((brick) => bricks.includes(brick))),
          padId = $('group-pad').value,
          groupId = M.uid('brick-group');
        let applied;
        app.store.change(() => {
          applied = Motion.applyGroupPath(r, bricks, anchor, Motion.nodes(anchor));
          if (!applied) return;
          for (const brick of bricks) Object.assign(brick, { brickGroup: groupId, padId });
          s.multiSelection = [];
          s.selection = brickRef(anchor);
          s.inspectorTab = 'nodes';
          setTool('select');
        });
        if (!applied) app.message('代表砖的路线会让组内其他砖越界。请先调整路线。', true);
      };
    }
    return;
  }
  if (!o) {
    s.selection = null;
    host.innerHTML = `<h2>房间属性</h2>${field('名称', 'room-name', r.name)}${area('备注', 'room-notes', r.notes)}<div class="row">${field('列数', 'room-cols', r.cols, { type: 'number', min: 6, max: Limits.MAX_COLS })}${field('行数', 'room-rows', r.rows, { type: 'number', min: 5, max: Limits.MAX_ROWS })}</div>${select(
      '阶段',
      'room-phase',
      r.phase,
      [
        ['inherit', '继承'],
        ['slow', '慢节奏'],
        ['fast', '快节奏'],
      ],
    )}${select('AI 入房策略', 'room-ai-policy', r.aiPolicy, [
      ['inherit', '继承大关状态'],
      ['off', '本房关闭'],
      ['start', '本房立即启动'],
    ])}${field('AI ID 覆盖（空白继承大关）', 'room-ai-id', r.aiId || '')}${['calculus', 'slacker'].includes(app.course().kind) ? '' : select('默认温度', 'room-env', r.environment, ['cold', 'hot'])}${CameraPanel.render(r)}<button class="apply primary" id="apply-room">应用房间设置</button><p class="hint">缩小时保留越界对象，不自动裁剪。试玩视角独立保存于本房间。</p>`;
    CameraPanel.bind();
    $('apply-room').onclick = () => {
      const cols = Number($('room-cols').value),
        rows = Number($('room-rows').value);
      if (!Limits.valid(cols, rows)) {
        app.message(Limits.description, true);
        return;
      }
      let playCamera;
      try {
        playCamera = CameraPanel.read();
      } catch (e) {
        app.message(e.message, true);
        return;
      }
      const values = {
        name: $('room-name').value.trim() || r.name,
        notes: $('room-notes').value,
        phase: $('room-phase').value,
        aiPolicy: $('room-ai-policy').value,
        aiId: $('room-ai-id').value.trim() || null,
        environment: $('room-env')?.value ?? r.environment,
        playCamera,
      };
      const result = M.resizeRoom(r, cols, rows),
        apply = () =>
          app.store.change(() => {
            Object.assign(r, result.room, values);
          });
      if (result.out.length)
        modal(
          '缩小房间：越界预览',
          `<p>${result.out.length} 个元素或目标将越界，数据保留并标红，试玩前需移回。</p><ul>${result.out
            .slice(0, 30)
            .map((x) => `<li>${esc(x.kind)} · ${esc(x.id)}</li>`)
            .join('')}</ul>`,
          [
            { label: '取消，先移动对象' },
            { label: '保留越界并应用', primary: true, action: apply },
          ],
        );
      else apply();
    };
    return;
  }
  const d = ref.kind === 'objects' ? Registry.get(o.type) : null,
    brickMotion = ref.kind === 'movables' && app.course().kind === 'calculus',
    hasNodes = d?.type === 'physics.rail' || brickMotion;
  host.innerHTML = `<h2>${esc(d?.name || { entries: '入口', exits: '出口', zones: '温控区域', movables: '机关砖', tiles: '固定砖' }[ref.kind])}</h2><div class="inspector-tabs ${hasNodes ? 'with-nodes' : ''}">${[
    ['base', '基础'],
    ['behavior', '行为'],
    ['links', '关联'],
    ['art', '外观'],
    ...(hasNodes ? [['nodes', '节点图']] : []),
  ]
    .map(
      ([id, name]) =>
        `<button data-inspector="${id}" class="${tab === id ? 'active' : ''}">${name}</button>`,
    )
    .join('')}</div><div id="object-form"></div>`;
  host.querySelectorAll('[data-inspector]').forEach(
    (b) =>
      (b.onclick = () => {
        s.inspectorTab = b.dataset.inspector;
        inspector(app, r, setTool);
      }),
  );
  const body = $('object-form');
  const brickGroup = brickMotion && o.brickGroup ? Motion.groupMembers(r, o) : [];
  if (brickGroup.length) {
    body.insertAdjacentHTML(
      'beforebegin',
      `<p class="hint">机关砖组 · ${brickGroup.length} 块 · 代表砖 (${o.x}, ${o.y})</p>
      <button id="ungroup-bricks" class="apply">解散机关砖组</button>`,
    );
    $('ungroup-bricks').onclick = () =>
      app.store.change(() => {
        for (const brick of brickGroup) delete brick.brickGroup;
      });
  }
  if (Motion.isPad(o)) {
    const color = Motion.colorFor(r, o.id),
      count = r.movables.filter((b) => b.padId === o.id).length;
    body.insertAdjacentHTML(
      'beforebegin',
      `<button id="quick-bind-bricks" class="apply" style="border-color:${color}" aria-pressed="${s.tool === 'brick-bind'}">快捷绑定 · ${count} 块</button>`,
    );
    $('quick-bind-bricks').onclick = () =>
      setTool(s.tool === 'brick-bind' ? 'select' : 'brick-bind');
  }
  host
    .querySelector('.inspector-tabs')
    .insertAdjacentHTML(
      'beforebegin',
      check('锁定位置（禁止移动 / 缩放）', 'object-locked', !!o.locked),
    );
  $('object-locked').onchange = (e) =>
    app.store.change(() => {
      o.locked = e.target.checked;
    });
  if (tab === 'base') {
    body.innerHTML = `${ref.kind !== 'tiles' ? field('名称', 'object-name', o.name || d?.name || '') : ''}${ref.kind !== 'tiles' ? area('备注', 'object-notes', o.notes || '') : ''}<div class="row">${field('列 X', 'object-x', o.x, { type: 'number' })}${field('行 Y', 'object-y', o.y, { type: 'number' })}</div>${o.w ? `<div class="row">${field('宽（格）', 'object-w', o.w, { type: 'number', min: 1 })}${field('高（格）', 'object-h', o.h, { type: 'number', min: 1 })}</div>` : ''}<button id="apply-object" class="apply primary">应用位置与说明</button><button id="delete-object" class="apply danger">删除对象</button>`;
    if (['tiles', 'objects', 'movables'].includes(ref.kind)) {
      body.insertAdjacentHTML(
        'beforeend',
        check('碰撞实体', 'object-collision', Collision.enabled(o, ref.kind, d || {})) +
          '<p class="hint">关闭后可穿过方块，边界显示为虚线。触发体积独立，进入触发范围仍可启动机关。</p>',
      );
      $('object-collision').onchange = (e) => {
        const enabled = e.target.checked;
        app.store.change(() => {
          o.collision = enabled;
        });
      };
    }
    if (o.locked || brickGroup.some((brick) => brick.locked))
      for (const id of ['object-x', 'object-y', 'object-w', 'object-h'])
        if ($(id)) $(id).disabled = true;
    $('apply-object').onclick = () =>
      app.store.change(() => {
        if (o.locked || brickGroup.some((brick) => brick.locked)) return;
        if (o.type === 'physics.rail')
          Nodes.moveOwner(o, Number($('object-x').value), Number($('object-y').value));
        else if (brickGroup.length)
          Select.move(
            r,
            brickGroup.map(brickRef),
            Number($('object-x').value) - o.x,
            Number($('object-y').value) - o.y,
          );
        else if (ref.kind === 'movables')
          Motion.moveOwner(o, Number($('object-x').value), Number($('object-y').value));
        else {
          o.x = Number($('object-x').value);
          o.y = Number($('object-y').value);
        }
        if (ref.kind === 'tiles') {
          ref.x = o.x;
          ref.y = o.y;
        } else {
          o.name = $('object-name').value;
          o.notes = $('object-notes').value;
        }
        if (o.w) {
          o.w = Math.max(1, Number($('object-w').value));
          o.h = Math.max(1, Number($('object-h').value));
        }
      });
    $('delete-object').onclick = () => {
      if (brickGroup.length > 1) {
        removeSelection(app, r, brickGroup.map(brickRef));
        return;
      }
      const linked =
        ref.kind === 'entries'
          ? app.course().connections.filter((w) => w.to.entryId === o.id)
          : ref.kind === 'exits'
            ? app.course().connections.filter((w) => w.from.exitId === o.id)
            : [];
      if (ref.kind === 'entries' && r.entries.length === 1) {
        app.message('每间房至少一个入口', true);
        return;
      }
      const apply = () =>
        app.store.change(() => {
          if (ref.kind === 'tiles') r.tiles = r.tiles.filter((t) => t !== o);
          else r[ref.kind] = r[ref.kind].filter((v) => v.id !== o.id);
          if (ref.kind === 'objects') {
            for (const brick of r.movables) if (brick.padId === o.id) brick.padId = '';
          }
          app.course().connections = app.course().connections.filter((v) => !linked.includes(v));
          s.selection = null;
        });
      if (linked.length)
        modal('移除端口及连线', `这个端口有 ${linked.length} 条关联线，将一起移除，可撤销。`, [
          { label: '取消' },
          { label: '移除端口及连线', primary: true, action: apply },
        ]);
      else apply();
    };
  } else if (tab === 'nodes' && d?.type === 'physics.rail') {
    NodePanel.render(app, o, r, body, setTool);
  } else if (brickMotion && ['nodes', 'behavior'].includes(tab)) {
    BrickPanel.render(app, o, r, body, setTool);
  } else if (tab === 'behavior') {
    if (d) {
      const p = Registry.params(app.store.project, o);
      body.innerHTML =
        (d.type === 'physics.rail'
          ? `<button id="open-node-graph" class="apply">节点图管理 · ${o.params.path?.length || 0} 个子节点</button>`
          : '') +
        d.schema
          .filter((f) => d.type !== 'physics.rail' || f.kind !== 'path')
          .map((f) => schemaField(f, p[f.key], r))
          .join('') +
        select('死亡回退', 'reset-policy', o.resetPolicy, [
          'checkpoint',
          'preserve',
          'life',
          'initial',
        ]) +
        check('需要 AI 靠近该机关', 'requires-ai', o.trigger?.requiresAI) +
        field('AI 激活距离（格）', 'ai-distance', o.trigger?.distance || 5, {
          type: 'number',
          min: 1,
          max: 30,
        }) +
        '<button id="apply-behavior" class="apply primary">应用行为</button>' +
        (d.schema.some((f) => f.kind === 'path')
          ? '<button id="edit-path" class="apply">在画布编辑轨道节点</button>'
          : '');
      const applyBehavior = () => {
        try {
          const values = {};
          for (const f of d.schema)
            if (d.type !== 'physics.rail' || f.kind !== 'path') values[f.key] = readField(f);
          app.store.change(() => {
            o.params = { ...p, ...values };
            o.resetPolicy = $('reset-policy').value;
            o.trigger = {
              ...o.trigger,
              requiresAI: $('requires-ai').checked,
              distance: Number($('ai-distance').value),
            };
          });
        } catch (e) {
          app.message(e.message, true);
        }
      };
      $('apply-behavior').onclick = () => applyBehavior();
      if (d.type === 'physics.thermal') {
        body.insertAdjacentHTML('beforeend', '<p id="thermal-target-preview" class="hint"></p>');
        const refresh = () => {
          const target = $('param-zoneId').value,
            ice = Temperature.affected(r, target);
          $('thermal-target-preview').textContent =
            '当前范围覆盖 ' +
            ice.length +
            ' 个冰块；按空间自动生效，无需绑定。重叠冷热区时热优先。冷态会延迟再生成，并避开玩家或 AI 占位。';
        };
        $('param-zoneId').onchange = refresh;
        refresh();
      }
      if ($('open-node-graph'))
        $('open-node-graph').onclick = () => {
          s.inspectorTab = 'nodes';
          inspector(app, r, setTool);
        };
      if ($('edit-path'))
        $('edit-path').onclick = () => {
          s.inspectorTab = 'nodes';
          inspector(app, r, setTool);
          setTool('path');
        };
    } else if (ref.kind === 'zones') {
      body.innerHTML =
        select('初始温度', 'zone-temp', o.initial, ['cold', 'hot']) +
        '<button id="save-zone" class="apply">应用</button>';
      $('save-zone').onclick = () =>
        app.store.change(() => {
          o.initial = $('zone-temp').value;
        });
    } else body.innerHTML = '<p class="hint">此对象没有独立运行行为。</p>';
  } else if (tab === 'links') {
    if (ref.kind === 'movables') {
      const pads = r.objects.filter(
        (pad) =>
          ['calculus.integral', 'calculus.derivative'].includes(pad.type) || pad.id === o.padId,
      );
      body.innerHTML =
        select('联动机关', 'movable-pad', o.padId || '', [
          ['', '无绑定'],
          ...pads.map((pad) => [
            pad.id,
            (pad.name || Registry.get(pad.type).name) + ' · ' + pad.x + ', ' + pad.y,
          ]),
        ]) +
        (brickMotion
          ? '<p class="hint">路径、时间和运动方式在「节点图」设置。</p>'
          : '<div class="row">' +
            field('目标列 X', 'movable-target-x', o.targetX, {
              type: 'number',
              min: 0,
              max: r.cols - 1,
            }) +
            field('目标行 Y', 'movable-target-y', o.targetY, {
              type: 'number',
              min: 0,
              max: r.rows - 1,
            }) +
            '</div>') +
        '<button id="apply-movable" class="apply primary">应用绑定</button>';
      $('apply-movable').onclick = () => {
        const padId = $('movable-pad').value;
        if (padId && !pads.some((pad) => pad.id === padId)) return;
        if (brickMotion) {
          app.store.change(() => Motion.bind(r, o, padId));
          return;
        }
        const x = $('movable-target-x').valueAsNumber,
          y = $('movable-target-y').valueAsNumber;
        if (
          !Number.isInteger(x) ||
          !Number.isInteger(y) ||
          x < 0 ||
          y < 0 ||
          x >= r.cols ||
          y >= r.rows
        ) {
          app.message('机关砖目标必须是房间内的整数格坐标。', true);
          return;
        }
        app.store.change(() => Object.assign(o, { targetX: x, targetY: y, padId }));
      };
    } else if (ref.kind === 'objects') {
      body.innerHTML =
        field('对应 AI ID（空白继承大关）', 'object-ai', o.aiId || '') +
        '<p class="hint">仅登记 ID，不在编辑器配置 AI 技能。距离量到机关。</p><button id="save-ai-id" class="apply">应用关联</button>';
      $('save-ai-id').onclick = () =>
        app.store.change(() => {
          o.aiId = $('object-ai').value.trim() || null;
        });
    } else if (ref.kind === 'exits') {
      body.innerHTML =
        '<p class="hint">在大关接线板，从此出口拖线到目标房间入口。</p><button id="go-wiring" class="apply">打开接线板</button>';
      $('go-wiring').onclick = () => app.go('course', { courseTab: 'graph' });
    } else if (ref.kind === 'entries') {
      body.innerHTML =
        select('进入朝向', 'entry-face', o.face || 1, [
          [1, '向右'],
          [-1, '向左'],
        ]) +
        '<button id="save-entry" class="apply">应用入口</button><button id="play-entry" class="apply">从此入口试玩</button>';
      $('save-entry').onclick = () =>
        app.store.change(() => {
          o.face = Number($('entry-face').value);
        });
      $('play-entry').onclick = () => app.startPlay(r.id, o.id);
    } else body.innerHTML = '<p class="hint">此对象没有额外关联。</p>';
  } else app.renderObjectArt(o, d, body);
}
function removeSelection(app, r, refs) {
  if (!refs.length) return;
  const course = app.course(),
    ids = new Set(
      refs.filter((ref) => ['entries', 'exits'].includes(ref.kind)).map((ref) => ref.id),
    );
  const wires = course.connections.filter((w) => ids.has(w.from.exitId) || ids.has(w.to.entryId));
  const apply = () => {
    try {
      if (r.entries.every((e) => refs.some((ref) => ref.kind === 'entries' && ref.id === e.id)))
        throw Error('每间房至少保留一个入口。');
      app.store.change(() => {
        Select.remove(course, r, refs);
        app.state.multiSelection = [];
        app.state.selection = null;
      });
    } catch (e) {
      app.message(e.message, true);
    }
  };
  if (wires.length)
    modal('批量移除端口及连线', `所选端口关联 ${wires.length} 条线，将一起移除，可撤销。`, [
      { label: '取消' },
      { label: '移除所选及连线', primary: true, action: apply },
    ]);
  else apply();
}
function schemaField(f, value, r) {
  const id = 'param-' + f.key;
  if (f.kind === 'number')
    return (
      field(f.label, id, value, { type: 'number', step: 'any' }) +
      `<small class="hint">建议 ${esc(f.min)} ～ ${esc(f.max)}，可输入范围外的自定义数值。</small>`
    );
  if (f.kind === 'boolean') return check(f.label, id, value);
  if (f.kind === 'select')
    return select(
      f.label,
      id,
      value,
      f.values.map((v) => [v, f.labels?.[v] || v]),
    );
  if (f.kind === 'zone')
    return select(f.label, id, value, [['', '整个房间'], ...r.zones.map((z) => [z.id, z.name])]);
  if (f.kind === 'path') return area(f.label, id, JSON.stringify(value || []));
  return field(f.label, id, value);
}
function readField(f) {
  const input = $('param-' + f.key);
  if (f.kind === 'boolean') return input.checked;
  if (f.kind === 'number') {
    const n = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(n)) throw new Error(f.label + ' 需要有效数字');
    return n;
  }
  if (f.kind === 'path') {
    const value = JSON.parse(input.value);
    if (!Array.isArray(value)) throw new Error('轨道需要节点数组');
    return value;
  }
  return input.value;
}
module.exports = { render, schemaField, readField };
