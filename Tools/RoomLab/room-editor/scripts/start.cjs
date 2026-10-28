'use strict';
const { spawn } = require('node:child_process'),
  path = require('node:path');
require('./build.cjs')
  .build()
  .then(() => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [path.resolve(__dirname, '..')], {
      stdio: 'inherit',
      env,
    });
    child.on('error', (e) => {
      console.error(e);
      process.exit(1);
    });
    child.on('exit', (code) => process.exit(code || 0));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
