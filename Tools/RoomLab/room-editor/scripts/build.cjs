'use strict';
const path = require('node:path'),
  fs = require('node:fs');
const root = path.resolve(__dirname, '..');
async function build() {
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  await require('esbuild').build({
    entryPoints: [path.join(root, 'src/editor/app.cjs')],
    outfile: path.join(root, 'build/ui.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    sourcemap: true,
    target: 'chrome130',
    logLevel: 'info',
  });
  fs.copyFileSync(path.join(root, 'src/editor/index.html'), path.join(root, 'build/index.html'));
  fs.copyFileSync(path.join(root, 'src/editor/style.css'), path.join(root, 'build/style.css'));
}
if (require.main === module)
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
module.exports = { build };
