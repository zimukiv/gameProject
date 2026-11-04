'use strict';
const Themes = require('./themes.cjs');
// Append a theme template without rewriting the current courses.
function add(project, kind = 'physics', { blank = false } = {}) {
  if (project.courses.length >= 12) throw new Error('最多 12 个大关，请先删除或合并旧大关。');
  const theme = Themes.theme(kind);
  const course = Themes.buildCourse(theme.kind, {
    name: '新大关 ' + (project.courses.length + 1) + ' · ' + theme.label,
    examples: true,
    blank,
  });
  const versions = Themes.pluginVersions();
  if (theme.kind === 'slacker' && !blank) versions['common.checkpoint'] = '1.0.0';
  for (const [type, version] of Object.entries(versions)) project.pluginManifest[type] ??= version;
  project.courses.push(course);
  return course;
}
module.exports = { add };
