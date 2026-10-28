'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  M = require('../src/project/model.cjs'),
  { seeds } = require('../src/assets/seeds.cjs'),
  Archive = require('../src/project/archive.cjs');
function generate() {
  const root = path.resolve(__dirname, '../examples'),
    dir = path.join(root, 'physics'),
    project = M.example(),
    seed = seeds();
  project.assets = seed.assets;
  project.courses[0].artBindings = seed.bindings;
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'project.json'),
    JSON.stringify(require('../src/project/collision.cjs').portable(project), null, 2),
  );
  for (const [name, bytes] of seed.files) fs.writeFileSync(path.join(dir, name), bytes);
  fs.writeFileSync(path.join(root, 'physics-project.zip'), Archive.pack(project, seed.files));
  return dir;
}
if (require.main === module) console.log('示例工程：' + generate());
module.exports = { generate };
