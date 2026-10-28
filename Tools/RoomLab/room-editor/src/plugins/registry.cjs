'use strict';
const { clone } = require('../shared/utils.cjs');
const RailNodes = require('../project/rail-nodes.cjs');
const modules = [
  require('./physics/jet.cjs'),
  require('./physics/ice.cjs'),
  require('./physics/thermal.cjs'),
  require('./physics/rail.cjs'),
  require('./common.cjs'),
  require('./legacy.cjs'),
].flat();
const definitions = new Map(modules.map((m) => [m.type, m]));
function get(type) {
  return (
    definitions.get(type) || {
      type,
      name: '缺失模块 ' + type,
      glyph: '?',
      category: 'missing',
      slots: ['idle'],
      defaults: {},
      schema: [],
      missing: true,
    }
  );
}
function list(kind = 'physics') {
  return modules.filter((d) => !d.hidden && (d.courses.includes(kind) || d.courses.includes('*')));
}
function params(project, object) {
  const explicit = { ...project.blockDefaults?.[object.type]?.params, ...object.params };
  const values = {
    ...get(object.type).defaults,
    ...project.blockDefaults?.[object.type]?.params,
    ...object.params,
  };
  if (
    object.type === 'physics.thermal' &&
    explicit.initialState === undefined &&
    ['hot', 'cold'].includes(explicit.initial)
  )
    values.initialState = explicit.initial;
  return object.type === 'physics.jet'
    ? require('../project/jet-params.cjs').resolve(values, explicit)
    : values;
}
function instantiate(project, type, id, x, y) {
  const d = get(type);
  const values = clone({ ...d.defaults, ...project.blockDefaults?.[type]?.params });
  if (type === 'physics.rail') {
    if (!values.path?.length) values.path = clone(d.defaults.path);
    const first = values.path[0],
      dx = x + 0.5 - first.x,
      dy = y + 0.5 - first.y;
    values.path.forEach((n) => {
      n.x += dx;
      n.y += dy;
      delete n.id;
      delete n.parentId;
    });
  }
  return RailNodes.ensure({
    id,
    type,
    name: project.blockDefaults?.[type]?.name || d.name,
    notes: '',
    x,
    y,
    w: 1,
    h: 1,
    collision: true,
    params: values,
    trigger: {
      mode: d.trigger || 'foot',
      requiresAI: false,
      distance: 5,
      once: false,
      cooldown: 1,
    },
    aiId: null,
    assetOverrides: {},
    resetPolicy: 'checkpoint',
  });
}
function validateObject(project, o) {
  const def = get(o.type);
  if (def.missing) return ['缺少功能模块：' + o.type];
  const values = params(project, o),
    errors = [];
  for (const f of def.schema) {
    const value = values[f.key];
    if (f.kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
      errors.push(def.name + ' / ' + f.label + ' 参数无效');
    if (f.kind === 'boolean' && typeof value !== 'boolean') errors.push(f.label + ' 必须为布尔值');
    if (f.kind === 'select' && !f.values.includes(value)) errors.push(f.label + ' 选项无效');
    if (['zone', 'text'].includes(f.kind) && typeof value !== 'string')
      errors.push(f.label + ' 需要字符串');
    if (
      f.kind === 'path' &&
      (!Array.isArray(value) ||
        value.length > 64 ||
        value.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    )
      errors.push('轨道节点无效');
  }
  const expected = project.pluginManifest?.[o.type];
  if (
    expected &&
    ![def.version.split('.')[0], ...(def.compatibleMajors || [])].includes(
      String(expected).split('.')[0],
    )
  )
    errors.push(
      o.type +
        ' 模块主版本不匹配：文件 ' +
        expected +
        '，程序 ' +
        def.version +
        '。请升级兼容模块。',
    );
  return errors;
}
module.exports = { get, list, params, instantiate, validateObject, all: () => modules.slice() };
