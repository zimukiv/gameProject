'use strict';
// Headless protocol harness for the packaged renderer: it loads the real
// `<runtime>/resources/app/renderer.cjs` with a stubbed Electron ipc channel and a stub canvas,
// then replays the exact commands main.cjs forwards. This exists because the Electron browser
// process itself cannot start inside the restricted DSH sandbox (see the ACL FATAL in
// stage1-runtime-log.md); `verify-import-protocol.cjs` is the same protocol over the real
// Chromium runtime and runs unchanged in an unrestricted desktop session.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const runtime = path.resolve(process.argv[2] || path.join(__dirname, '../../.roomlab-runtime')),
  app = path.join(runtime, 'resources/app'),
  F = require(path.join(app, 'vendor/fflate/browser.cjs')),
  editorArchivePath = path.resolve(__dirname, '../../../room-editor/src/project/archive.cjs'),
  fixturePath = path.join(app, 'tests/fixtures/export-255-project.json'),
  sample = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8')));
