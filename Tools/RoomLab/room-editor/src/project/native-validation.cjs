'use strict';
const N = require('./native-compat.cjs');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const bands = ['all', 'awake', 'haze', 'dream'];
function validate(p, { play = false } = {}) {
  const errors = [],
    warnings = [];
  if (!N.enabled(p)) return { errors, warnings };
  function names(a, label) {
    if (
      !Array.isArray(a) ||
      a.length > 32 ||
      a.some((n) => typeof n !== 'string' || !n || n.length > 48) ||
      new Set(a).size !== a.length
    ) {
      errors.push(label + '：开关名称须唯一且最多32项，每项1–48字');
      return [];
    }
    return a;
  }
  for (const c of p.courses || []) {
    if (N.authored(p, c)) continue;
    const signals = names(c.nativeCampaign?.signals, c.name);
    for (const r of c.rooms || []) {
      const m = r.nativeCampaign,
        label = r.name;
      if (!m) {
        errors.push(label + '：缺少测试版房间规则');
        continue;
      }
      const switches = names(m.switches, label);
      for (const key of ['platforms', 'patrols'])
        if (!Array.isArray(m[key])) errors.push(label + '：缺少 ' + key + ' 列表');
      if (
        m.awareness !== undefined &&
        (!finite(m.awareness) || m.awareness < 0 || m.awareness > 100)
      )
        errors.push(label + '：清醒度应为0–100');
      if (
        m.pulseBudget !== undefined &&
        (!Number.isInteger(m.pulseBudget) || m.pulseBudget < 0 || m.pulseBudget > 3)
      )
        errors.push(label + '：困意脉冲应为0–3次');
      if (
        m.checkins !== undefined &&
        (!Number.isInteger(m.checkins) ||
          m.checkins < 0 ||
          m.checkins > r.objects.filter((o) => o.type === 'slacker.checkin').length)
      )
        errors.push(label + '：签到目标超过本房签到板数量');
      if (
        m.requireAI &&
        !r.objects.some((o) => ['common.aiStart', 'common.aiStartHollow'].includes(o.type))
      )
        errors.push(label + '：要求助手但没有AI启动板');
      const platforms = Array.isArray(m.platforms) ? m.platforms : [],
        patrols = Array.isArray(m.patrols) ? m.patrols : [];
      if (
        m.signs !== undefined &&
        (!Array.isArray(m.signs) ||
          m.signs.some((o) => !o || !finite(o.x) || !finite(o.y) || typeof o.text !== 'string'))
      )
        errors.push(label + '：场景标记格式无效');
      if (platforms.length > 128 || patrols.length > 4)
        errors.push(label + '：平台最多128块，巡逻最多4个');
      const ids = new Set([...r.objects, ...r.movables].map((o) => o.id));
      for (const o of [...platforms, ...patrols]) {
        if (!o || typeof o !== 'object' || !o.id || ids.has(o.id)) {
          errors.push(label + '：扩展实体ID缺失或重复');
          continue;
        }
        ids.add(o.id);
      }
      for (const o of platforms) {
        if (
          !o ||
          !finite(o.x) ||
          !finite(o.y) ||
          !finite(o.w ?? 1) ||
          !finite(o.h ?? 1) ||
          (o.w ?? 1) < 0.25 ||
          (o.h ?? 1) < 0.25
        )
          errors.push(label + '：平台尺寸无效');
        if (o?.seconds !== undefined && (!finite(o.seconds) || o.seconds < 0.1 || o.seconds > 10))
          errors.push(label + '：平台运动时间应为0.1–10秒');
      }
      for (const o of patrols)
        if (
          !o ||
          !Array.isArray(o.nodes) ||
          o.nodes.length < 2 ||
          o.nodes.length > 16 ||
          o.nodes.some((n) => !n || !finite(n.x) || !finite(n.y)) ||
          !finite(o.speed) ||
          o.speed < 30 ||
          o.speed > 220
        )
          errors.push(label + '：巡逻需要2–16个节点，速度30–220');
      function rule(o) {
        if (!o || typeof o !== 'object') {
          errors.push(label + '：扩展规则格式错误');
          return;
        }
        if (o.band !== undefined && !bands.includes(o.band)) errors.push(label + '：清醒层无效');
        for (const k of ['signal', 'visibleSignal'])
          if (o[k] !== undefined && !signals.includes(o[k]))
            errors.push(label + '：未知跨房信号 ' + o[k]);
        if (o.switch !== undefined && !switches.includes(o.switch))
          errors.push(label + '：未知本房开关 ' + o.switch);
        for (const k of ['value', 'visibleValue'])
          if (o[k] !== undefined && typeof o[k] !== 'boolean')
            errors.push(label + '：' + k + ' 必须是真或假');
        for (const k of ['states', 'signals'])
          if (o[k] !== undefined) {
            if (!o[k] || Array.isArray(o[k]) || typeof o[k] !== 'object')
              errors.push(label + '：组合条件格式错误');
            else
              for (const [n, v] of Object.entries(o[k]))
                if (!(k === 'states' ? switches : signals).includes(n) || typeof v !== 'boolean')
                  errors.push(label + '：组合条件引用无效 ' + n);
          }
        if (
          o.allSwitches !== undefined &&
          (!Array.isArray(o.allSwitches) || o.allSwitches.some((n) => !switches.includes(n)))
        )
          errors.push(label + '：多开关条件引用无效');
        if (
          o.clarityDelta !== undefined &&
          (!finite(o.clarityDelta) ||
            !o.clarityDelta ||
            Math.abs(o.clarityDelta) > 100 ||
            o.clarityTarget !== undefined)
        )
          errors.push(label + '：清醒度增减无效或与目标值冲突');
        if (
          o.clarityTarget !== undefined &&
          (!finite(o.clarityTarget) || o.clarityTarget < 0 || o.clarityTarget > 100)
        )
          errors.push(label + '：清醒度目标无效');
      }
      for (const o of platforms) if (o) rule(o);
      for (const k of ['objects', 'tiles', 'movables', 'exits'])
        for (const o of r[k] || [])
          if (o.rework !== undefined) {
            rule(o.rework);
            if (
              o.rework?.clarityDelta !== undefined &&
              (!c.nativeCampaign?.resourceAwareness ||
                o.trigger?.once !== true ||
                o.resetPolicy !== 'checkpoint')
            )
              errors.push(label + '：清醒道具须启用资源模式、一次性、检查点回退');
          }
      if (!errors.length)
        for (const o of N.outOfBounds(r))
          (play ? errors : warnings).push(label + '：' + o.kind + ' ' + o.id + ' 越界');
    }
    if (!errors.length) warnings.push(...N.dependencyWarnings(c));
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
module.exports = { validate };
