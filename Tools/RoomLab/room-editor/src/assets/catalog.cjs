'use strict';
const Registry = require('../plugins/registry.cjs');
const GROUPS = [
  { id: 'terrain', name: '地形', glyph: '▦' },
  { id: 'mechanism', name: '机关', glyph: '⚙' },
  { id: 'item', name: '道具与危险', glyph: '★' },
  { id: 'character', name: '角色', glyph: '♟' },
  { id: 'scene', name: '场景', glyph: '▧' },
  { id: 'unsorted', name: '未分类', glyph: '□' },
];
function groupForType(type) {
  if (type === 'common.solid') return 'terrain';
  if (
    type.startsWith('physics.') ||
    type.startsWith('calculus.') ||
    type.startsWith('slacker.') ||
    type.startsWith('legacy.') ||
    ['common.aiStart', 'common.aiStartHollow', 'common.portalIn', 'common.portalOut'].includes(type)
  )
    return 'mechanism';
  if (type.startsWith('common.')) return 'item';
  return type === 'background' ? 'scene' : 'unsorted';
}
function children(group, kind) {
  if (group === 'terrain')
    return [
      { id: 'common.solid', name: '固定地形' },
      { id: 'shared', name: '通用地形' },
    ];
  if (['mechanism', 'item'].includes(group))
    return [
      ...(kind ? Registry.list(kind) : Registry.all())
        .filter((d) => !d.hidden && groupForType(d.type) === group)
        .map((d) => ({ id: d.type, name: d.name })),
      { id: 'shared', name: '本类通用' },
    ];
  if (group === 'character')
    return [
      { id: 'player', name: '玩家' },
      { id: 'ai', name: 'AI' },
    ];
  if (group === 'scene')
    return [
      { id: 'background', name: '背景' },
      { id: 'decoration', name: '装饰' },
    ];
  return [{ id: 'unsorted', name: '待归类' }];
}
function classification(project, a) {
  const canonical = (type) => (type === 'common.aiStartHollow' ? 'common.aiStart' : type);
  if (a.category && a.subcategory)
    return { category: a.category, subcategory: canonical(a.subcategory) };
  // Older v2 artwork has no folder metadata. Infer it from existing bindings without changing IDs.
  for (const c of project.courses) {
    for (const [type, config] of Object.entries(c.blockDefaults || {}))
      if (Object.values(config.assets || {}).includes(a.id))
        return { category: groupForType(type), subcategory: canonical(type) };
    for (const [type, slots] of Object.entries(c.artBindings || {}))
      if (slots === a.id || Object.values(slots || {}).includes(a.id))
        return { category: groupForType(type), subcategory: canonical(type) };
    for (const r of c.rooms) {
      for (const [type, slots] of Object.entries(r.artBindings || {}))
        if (slots === a.id || Object.values(slots || {}).includes(a.id))
          return { category: groupForType(type), subcategory: canonical(type) };
      for (const o of r.objects)
        if (Object.values(o.assetOverrides || {}).includes(a.id))
          return { category: groupForType(o.type), subcategory: o.type };
    }
  }
  return { category: 'unsorted', subcategory: 'unsorted' };
}
function inCourse(a, course) {
  if (a.courseId === 'common') return true;
  if (!course) return false;
  if (a.courseId === course.id) return true;
  const seed = a.id?.startsWith('seed-') && a.hash === a.id;
  return seed && (a.id === 'seed-metal' || a.courseId === course.kind);
}
function available(project, courseId, type) {
  const group = groupForType(type),
    course = project.courses.find((c) => c.id === courseId);
  return project.assets.filter((a) => {
    const folder = classification(project, a);
    return (
      inCourse(a, course) &&
      folder.category === group &&
      (folder.subcategory === type || folder.subcategory === 'shared')
    );
  });
}
module.exports = { GROUPS, groupForType, children, classification, inCourse, available };
