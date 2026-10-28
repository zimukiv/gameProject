'use strict';
// Electron 44 downloads its platform binary explicitly after dependency installation.
const { spawnSync } = require('node:child_process'),
  path = require('node:path');
const install = path.join(path.dirname(require.resolve('electron/package.json')), 'install.js');
const result = spawnSync(process.execPath, [install], { stdio: 'inherit' });
process.exit(result.status ?? 1);
