'use strict';
const M = require('./model.cjs');
function add(project) {
  const r = M.room(M.uid('room'), '新房间');
  M.floor(r, 0, r.cols - 1, r.rows - 3);
  r.exits = [
    { id: M.uid('exit'), name: '大关结束', notes: '', x: r.cols - 2, y: r.rows - 5, w: 1, h: 2 },
  ];
  const course = {
    id: M.uid('course'),
    name: '新大关 ' + (project.courses.length + 1),
    kind: 'physics',
    notes: '本版本只提供物理机制。',
    aiId: 'demo-ai',
    defaultSize: { cols: 30, rows: 17 },
    artBindings: {},
    rooms: [r],
    connections: [],
  };
  project.courses.push(course);
  return course;
}
module.exports = { add };
