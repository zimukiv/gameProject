'use strict';
const N = require('../project/native-compat.cjs'),
  { clone } = require('../shared/utils.cjs');
const { $, field, area, select, check, esc } = require('./dom.cjs');
const bandOptions = [
  ['all', '常驻'],
  ['awake', '清醒'],
  ['haze', '朦胧'],
  ['dream', '梦境'],
];
const number = (label, id, value, min, max) =>
  field(label, id, value, { type: 'number', step: 'any', min, max });
function change(app, fn) {
  try {
    app.store.change(fn);
  } catch (e) {
    app.message(e.message, true);
  }
}
function addPanel(host, title, html) {
  const el = document.createElement('details');
  el.className = 'native-panel';
  el.innerHTML = '<summary>' + title + '</summary><div class="form">' + html + '</div>';
  host.append(el);
  return el;
}
function thumbnail(o, kind) {
  const points =
    kind === 'patrols'
      ? o.nodes
      : [
          { x: o.x, y: o.y },
          { x: o.toX ?? o.x, y: o.toY ?? o.y },
        ];
  const xs = points.map((n) => n.x),
    ys = points.map((n) => n.y),
    x = Math.min(...xs),
    y = Math.min(...ys),
    w = Math.max(1, Math.max(...xs) - x),
    h = Math.max(1, Math.max(...ys) - y),
    s = Math.min(240 / w, 110 / h),
    loc = (n) => ({ x: 20 + (n.x - x) * s, y: 20 + (n.y - y) * s });
  return `<svg viewBox="0 0 280 150" style="width:100%;background:#0b1722" aria-label="机关砖节点图"><polyline points="${points
    .map((n) => {
      const p = loc(n);
      return p.x + ',' + p.y;
    })
    .join(' ')}" fill="none" stroke="#8adbd7"/>${points
    .map((n, i) => {
      const p = loc(n);
      return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#ffda8a"/><text x="${p.x + 6}" y="${p.y - 5}" fill="#d7eff2">${kind === 'platforms' ? (i ? 'I' : '0') : i + 1}</text>`;
    })
    .join('')}</svg>`;
}
function entity(app, r, ref, host, setTool) {
  const o = N.get(r, ref);
  if (!o) return;
  const kind = ref.kind,
    b = N.rect(kind, o),
    c = app.course();
  host.innerHTML = `<h2>${{ platforms: c.kind === 'calculus' ? '机关砖' : '平台', patrols: '巡逻路线', signs: '场景标记' }[kind]}</h2>${kind !== 'signs' ? thumbnail(o, kind) : ''}${check('锁定位置', 'native-lock', !!o.locked)}${number('X', 'native-x', kind === 'patrols' ? o.nodes[0].x : o.x, 0, r.cols)}${number('Y', 'native-y', kind === 'patrols' ? o.nodes[0].y : o.y, 0, r.rows)}${kind === 'platforms' ? `${number('宽', 'native-w', o.w ?? 1, 0.25, r.cols)}${number('高', 'native-h', o.h ?? 1, 0.25, r.rows)}${number('终点 X（空白保持原位）', 'native-tx', o.toX ?? '', 0, r.cols)}${number('终点 Y（空白保持原位）', 'native-ty', o.toY ?? '', 0, r.rows)}${number('运动时间（秒）', 'native-seconds', o.seconds ?? 0.9, 0.1, 10)}${field('标记', 'native-label', o.label || '')}` : kind === 'patrols' ? number('速度（像素/秒）', 'native-speed', o.speed, 30, 220) : field('文字', 'native-text', o.text || '')}<button id="native-apply" class="primary">应用</button><div class="button-row"><button id="native-copy">复制</button><button id="native-delete" class="danger">删除</button></div>`;
  if (kind === 'platforms') {
    const button = document.createElement('button');
    button.id = 'native-node-place';
    button.textContent = '在画布设置节点 I';
    button.onclick = () => setTool?.('native-target');
    host.querySelector('svg').after(button);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent =
      '0 为关闭位置，I 为开启位置。选中后右键设置 I；移动砖时两点一起移动。当前关卡按一段平滑运动往返。';
    button.after(hint);
  }
  $('native-lock').onchange = () => change(app, () => (o.locked = $('native-lock').checked));
  $('native-apply').onclick = () => {
    const next = clone(o);
    if (!o.locked) {
      const x = +$('native-x').value,
        y = +$('native-y').value;
      N.move(
        kind,
        next,
        x - (kind === 'patrols' ? o.nodes[0].x : o.x),
        y - (kind === 'patrols' ? o.nodes[0].y : o.y),
      );
      if (kind === 'platforms') {
        next.w = +$('native-w').value;
        next.h = +$('native-h').value;
        for (const [key, id] of [
          ['toX', 'native-tx'],
          ['toY', 'native-ty'],
        ]) {
          if ($(id).value === '') delete next[key];
          else if (+$(id).value !== o[key]) next[key] = +$(id).value;
        }
      }
    }
    if (kind === 'platforms') {
      next.seconds = +$('native-seconds').value;
      next.label = $('native-label').value;
    } else if (kind === 'patrols') next.speed = +$('native-speed').value;
    else next.text = $('native-text').value;
    const project = app.store.snapshot(),
      room = project.courses.find((x) => x.id === c.id).rooms.find((x) => x.id === r.id);
    const candidate = N.get(room, ref);
    for (const key of Object.keys(candidate)) if (!Object.hasOwn(next, key)) delete candidate[key];
    Object.assign(candidate, next);
    const report = require('../project/native-validation.cjs').validate(project, { play: true });
    if (report.errors.length) {
      app.message(report.errors[0], true);
      return;
    }
    change(app, () => {
      for (const key of Object.keys(o)) if (!Object.hasOwn(next, key)) delete o[key];
      Object.assign(o, next);
    });
  };
  $('native-copy').onclick = () =>
    change(app, () => {
      const next = clone(o);
      if (next.id) next.id = require('../shared/utils.cjs').uid(kind);
      N.list(r, kind).push(next);
      app.state.selection = { kind, id: N.identity(next, N.list(r, kind).length - 1) };
    });
  $('native-delete').onclick = () => {
    if (o.locked) {
      app.message('请先解除锁定', true);
      return;
    }
    change(app, () => {
      r.nativeCampaign[kind] = N.list(r, kind).filter((x) => x !== o);
      app.state.selection = null;
    });
  };
  if (kind === 'platforms') rulesPanel(app, r, o, host, true);
  if (kind === 'patrols') {
    const el = addPanel(
      host,
      '节点（可在画布拖动）',
      o.nodes
        .map(
          (n, i) =>
            `<div class="row">${number('节点 ' + (i + 1) + ' X', 'np-x-' + i, n.x, 0.5, r.cols - 0.5)}${number('Y', 'np-y-' + i, n.y, 0.5, r.rows - 0.5)}<button data-np-remove="${i}">删除</button></div>`,
        )
        .join('') + '<button id="np-save">应用节点</button><button id="np-add">追加节点</button>',
    );
    el.open = true;
    $('np-save').onclick = () => {
      if (o.locked) return;
      const nodes = o.nodes.map((n, i) => ({
        ...n,
        x: +$('np-x-' + i).value,
        y: +$('np-y-' + i).value,
      }));
      if (
        nodes.some(
          (n) =>
            !Number.isFinite(n.x) ||
            !Number.isFinite(n.y) ||
            n.x < 0.5 ||
            n.y < 0.5 ||
            n.x > r.cols - 0.5 ||
            n.y > r.rows - 0.5,
        )
      ) {
        app.message('巡逻节点越界', true);
        return;
      }
      change(app, () => (o.nodes = nodes));
    };
    $('np-add').onclick = () => {
      if (o.locked || o.nodes.length >= 16) return;
      change(app, () => o.nodes.push({ ...o.nodes.at(-1) }));
    };
    el.querySelectorAll('[data-np-remove]').forEach(
      (b) =>
        (b.onclick = () => {
          if (o.locked || o.nodes.length <= 2) return;
          change(app, () => o.nodes.splice(+b.dataset.npRemove, 1));
        }),
    );
  }
}
function rulesPanel(app, r, o, host, platform = false) {
  if (!N.active(app.store.project, app.course())) return;
  const c = app.course(),
    m = platform ? o : o.rework || {},
    prefix = 'nr-',
    local = r.nativeCampaign?.switches || [],
    signals = c.nativeCampaign?.signals || [];
  const options = (values) => [['', '未绑定'], ...values.map((n) => [n, n])];
  const html = `${select('所属清醒层', prefix + 'band', m.band || 'all', bandOptions)}${select('本房开关', prefix + 'switch', m.switch || '', options(local))}${select('跨房信号', prefix + 'signal', m.signal || '', options(signals))}${select(
    '设置／要求的状态',
    prefix + 'value',
    String(m.value ?? true),
    [
      ['true', '真'],
      ['false', '假'],
    ],
  )}${select('可见性信号', prefix + 'visibleSignal', m.visibleSignal || '', options(signals))}${select(
    '可见性要求',
    prefix + 'visibleValue',
    String(m.visibleValue ?? true),
    [
      ['true', '真'],
      ['false', '假'],
    ],
  )}${!platform ? `${field('短标签', 'nr-label', m.label || '')}${field('触发短提示', 'nr-message', m.message || '')}${field('锁门短提示', 'nr-lockedText', m.lockedText || '')}` : ''}${o.type === 'slacker.awake' ? `${number('清醒度增减（空白不使用）', 'nr-delta', m.clarityDelta ?? '', -100, 100)}<p class="hint">资源道具使用一次性与检查点回退；不会改成加速板。</p>` : ''}<button id="nr-save">应用控制设置</button>`;
  const el = addPanel(host, '机关控制与显示条件', html);
  const Bricks = require('../project/native-bricks.cjs');
  if (platform) {
    $('nr-value').hidden = true;
    $('nr-value').previousElementSibling.hidden = true;
  }
  if (Bricks.isPad(o)) {
    el.open = true;
    $('nr-value').options[0].textContent = '开启：移动到节点 I';
    $('nr-value').options[1].textContent = '关闭：返回节点 0';
    const matched = N.list(r, 'platforms').filter((b) => Bricks.bound(b, o));
    const block = document.createElement('section');
    block.className = 'native-binding-summary';
    block.innerHTML =
      '<strong>机关砖绑定 · ' +
      matched.length +
      ' 块</strong><p class="hint">选中此板后，右键点击或拖框绑定机关砖；重复操作取消绑定。同一开关的积分、求导板共同控制这一组砖。</p><button id="native-quick-bind">在画布快捷绑定</button>';
    el.before(block);
    $('native-quick-bind').onclick = () => app.setRoomTool?.('brick-bind');
  }
  $('nr-save').onclick = () => {
    const next = clone(m);
    for (const key of ['band', 'switch', 'signal', 'visibleSignal']) {
      const val = $('nr-' + key).value;
      if (!val || (key === 'band' && val === 'all')) delete next[key];
      else next[key] = val;
    }
    for (const key of ['value', 'visibleValue'])
      if (key === 'value' ? next.signal || next.switch : next.visibleSignal)
        next[key] = $('nr-' + key).value === 'true';
      else delete next[key];
    for (const key of ['label', 'message', 'lockedText'])
      if ($('nr-' + key)) {
        if ($('nr-' + key).value) next[key] = $('nr-' + key).value;
        else delete next[key];
      }
    if ($('nr-delta')) {
      if ($('nr-delta').value === '') delete next.clarityDelta;
      else {
        const n = +$('nr-delta').value;
        if (!Number.isFinite(n) || !n || Math.abs(n) > 100) {
          app.message('增减值须在-100至100且不能为0', true);
          return;
        }
        if (!c.nativeCampaign.resourceAwareness) {
          app.message('请先在大关规则启用清醒度资源模式', true);
          return;
        }
        next.clarityDelta = n;
        delete next.clarityTarget;
      }
    }
    change(app, () => {
      if (platform) {
        for (const k of ['band', 'switch', 'signal', 'value', 'visibleSignal', 'visibleValue'])
          delete o[k];
        Object.assign(o, next);
      } else {
        o.rework = next;
        if (next.clarityDelta !== undefined) {
          o.trigger = { ...o.trigger, once: true, mode: 'region' };
          o.resetPolicy = 'checkpoint';
        }
      }
    });
  };
  if (r.exits.includes(o)) {
    const conditions = addPanel(
      host,
      '出口 · 同时满足以下条件',
      local
        .map((n, i) =>
          select(
            n,
            'nc-l-' + i,
            Object.hasOwn(m.states || {}, n)
              ? String(m.states[n])
              : (m.allSwitches || []).includes(n)
                ? 'true'
                : '',
            [
              ['', '不要求'],
              ['true', '真'],
              ['false', '假'],
            ],
          ),
        )
        .join('') +
        signals
          .map((n, i) =>
            select(n, 'nc-s-' + i, Object.hasOwn(m.signals || {}, n) ? String(m.signals[n]) : '', [
              ['', '不要求'],
              ['true', '真'],
              ['false', '假'],
            ]),
          )
          .join('') +
        '<button id="nc-save">应用组合条件</button>',
    );
    $('nc-save').onclick = () => {
      const states = {},
        values = {};
      local.forEach((n, i) => {
        if ($('nc-l-' + i).value) states[n] = $('nc-l-' + i).value === 'true';
      });
      signals.forEach((n, i) => {
        if ($('nc-s-' + i).value) values[n] = $('nc-s-' + i).value === 'true';
      });
      change(app, () => {
        o.rework = { ...o.rework, states, signals: values };
        delete o.rework.allSwitches;
      });
    };
  }
}
function namesPanel(app, c, r, host, scope) {
  const names = scope === 'signal' ? c.nativeCampaign.signals : r.nativeCampaign.switches;
  const usage = (name) => {
    const rooms = scope === 'signal' ? c.rooms : [r];
    return (
      rooms
        .map((room) => {
          const controls = room.objects.filter((o) => o.rework?.[scope] === name).length,
            targets = N.rules(room).filter(
              (o) =>
                o[scope] === name ||
                (scope === 'signal' &&
                  (o.visibleSignal === name || Object.hasOwn(o.signals || {}, name))) ||
                (scope === 'switch' &&
                  ((o.allSwitches || []).includes(name) || Object.hasOwn(o.states || {}, name))),
            ).length;
          return controls || targets
            ? esc(room.name) + '：' + controls + ' 个控制源 / ' + targets + ' 处引用'
            : '';
        })
        .filter(Boolean)
        .join('<br>') || '尚无引用'
    );
  };
  const el = addPanel(
    host,
    scope === 'signal' ? '跨房信号管理' : '本房开关管理',
    names
      .map(
        (n, i) =>
          `<div class="row">${field('名称', 'nn-' + scope + i, n)}<button data-nn-rename="${i}">改名</button></div><small>${usage(n)}</small>`,
      )
      .join('') +
      field('新名称', 'nn-new-' + scope, '') +
      `<button id="nn-add-${scope}">添加</button><p class="hint">改名会同步更新绑定。删除控制板不会抹除信号声明，缺少来源会在校验中提示。</p>`,
  );
  el.querySelectorAll('[data-nn-rename]').forEach(
    (b) =>
      (b.onclick = () => {
        const old = names[+b.dataset.nnRename],
          next = $('nn-' + scope + b.dataset.nnRename).value.trim();
        change(app, () => N.rename(c, r, scope, old, next));
      }),
  );
  $('nn-add-' + scope).onclick = () => {
    const name = $('nn-new-' + scope).value.trim();
    if (!name || name.length > 48 || names.includes(name) || names.length >= 32) {
      app.message('名称为空、重复或超出限制', true);
      return;
    }
    change(app, () => names.push(name));
  };
}
function room(app, r, host) {
  if (!N.active(app.store.project, app.course())) return;
  const m = r.nativeCampaign || {};
  const el = addPanel(
    host,
    '测试版 · 房间规则与短提示',
    number('初始清醒度', 'nm-awareness', m.awareness ?? 50, 0, 100) +
      number('本房困意脉冲次数', 'nm-pulses', m.pulseBudget ?? 1, 0, 3) +
      number('所需签到数', 'nm-checkins', m.checkins ?? 0, 0, 32) +
      check('要求助手', 'nm-ai', !!m.requireAI) +
      ['objective', 'arrivalHint', 'progressHint', 'softHint']
        .map((k, i) =>
          area(['设计目标', '入房提示', '进度提示', '停滞提示'][i], 'nm-' + k, m[k] || ''),
        )
        .join('') +
      '<button id="nm-save">应用扩展房间设置</button>',
  );
  $('nm-save').onclick = () => {
    const a = +$('nm-awareness').value,
      p = +$('nm-pulses').value,
      n = +$('nm-checkins').value,
      ai = $('nm-ai').checked;
    const texts = Object.fromEntries(
      ['objective', 'arrivalHint', 'progressHint', 'softHint'].map((k) => [k, $('nm-' + k).value]),
    );
    if (
      !Number.isFinite(a) ||
      a < 0 ||
      a > 100 ||
      !Number.isInteger(p) ||
      p < 0 ||
      p > 3 ||
      !Number.isInteger(n) ||
      n < 0 ||
      n > r.objects.filter((o) => o.type === 'slacker.checkin').length ||
      (ai && !r.objects.some((o) => ['common.aiStart', 'common.aiStartHollow'].includes(o.type)))
    ) {
      app.message('清醒度、次数或助手条件无效', true);
      return;
    }
    change(app, () =>
      Object.assign(
        r.nativeCampaign,
        { awareness: a, pulseBudget: p, checkins: n, requireAI: ai },
        texts,
      ),
    );
  };
  namesPanel(app, app.course(), r, host, 'switch');
  const list = addPanel(
    host,
    '扩展对象清单',
    N.kinds
      .map(
        (kind) =>
          `<details><summary>${{ platforms: '平台', patrols: '巡逻', signs: '标记' }[kind]} · ${N.list(r, kind).length}</summary>${N.list(
            r,
            kind,
          )
            .map(
              (o, i) =>
                `<button data-native-kind="${kind}" data-native-id="${esc(N.identity(o, i))}">${esc(o.label || o.text || o.id || String(i + 1))}</button>`,
            )
            .join('')}</details>`,
      )
      .join(''),
  );
  list.querySelectorAll('[data-native-id]').forEach(
    (b) =>
      (b.onclick = () => {
        app.state.selection = { kind: b.dataset.nativeKind, id: b.dataset.nativeId };
        app.state.multiSelection = [];
        app.render();
      }),
  );
}
function course(app, c, host) {
  if (!N.active(app.store.project, app.course())) return;
  namesPanel(app, c, null, host, 'signal');
  if (c.kind === 'slacker') {
    const el = addPanel(
      host,
      '测试版 · 水课资源规则',
      check(
        '清醒度跨房携带／一次性资源模式',
        'native-resource',
        !!c.nativeCampaign.resourceAwareness,
      ),
    );
    $('native-resource').onchange = () => {
      const value = $('native-resource').checked;
      if (
        !value &&
        c.rooms.some((r) => r.objects.some((o) => o.rework?.clarityDelta !== undefined))
      ) {
        app.message('仍有一次性清醒道具，不能关闭资源模式', true);
        $('native-resource').checked = true;
        return;
      }
      change(app, () => (c.nativeCampaign.resourceAwareness = value));
    };
  }
}
module.exports = { entity, rulesPanel, room, course };
