'use strict';
// Stage-1 repair: real Electron protocol acceptance for project import.
// Starts the project's bundled .roomlab-runtime, speaks the exact Unity socket protocol and
// checks id echoes, recoverable failures, paused/developer preservation and the atomic swap.
// The valid archive is produced by the read-only editor `room-editor/src/project/archive.cjs`
// (cross implementation); the native picker itself is only triggered, never auto-answered.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  net = require('node:net'),
  { spawn } = require('node:child_process');
const runtime = path.resolve(process.argv[2] || path.join(__dirname, '../../.roomlab-runtime')),
  app = path.join(runtime, 'resources/app'),
  F = require(path.join(app, 'vendor/fflate/browser.cjs')),
  fixture = path.join(app, 'tests/fixtures/export-255-project.json'),
  editorArchivePath = path.resolve(__dirname, '../../../room-editor/src/project/archive.cjs');
const sample = () => JSON.parse(fs.readFileSync(fixture, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roomlab255-bridge-'));
const server = net.createServer(),
  childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
childEnv.ELECTRON_NO_ATTACH_CONSOLE = '1';
let socket, child, buffer = '', waiter, seq = 0, checks = 0, fatal = [];
const connected = new Promise((resolve) => server.once('connection', (c) => { socket = c; resolve(); }));
function attach() {
  socket.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const at = buffer.indexOf('\n');
      if (at < 0) break;
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      if (line.startsWith('ROOMLAB_ERROR ')) {
        fatal.push(line);
        waiter?.reject(Error('ROOMLAB_ERROR leaked to Unity: ' + line));
        waiter = null;
        continue;
      }
      if (line.startsWith('ROOMLAB_FRAME ')) {
        const frame = JSON.parse(line.slice(14));
        waiter?.resolve(frame);
        waiter = null;
      }
    }
  });
}
function request(command) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Host response timeout for command id=' + id)), 20000);
    waiter = {
      resolve: (frame) => {
        clearTimeout(timer);
        try {
          assert.equal(frame.id, id, 'reply must carry the originating command id');
          checks++;
          resolve(frame);
        } catch (error) { reject(error); }
      },
      reject: (error) => { clearTimeout(timer); reject(error); },
    };
    socket.write(JSON.stringify({ id, noImage: true, width: 400, height: 240, ...command }) + '\n');
  });
}
const same = (frame, room, mode) => {
  assert.equal(frame.state.roomId, room, 'current room must survive a failed import');
  assert.equal(frame.state.mode, mode, 'paused/playing state must survive a failed import');
  checks += 2;
};
(async () => {
  assert.ok(fs.existsSync(path.join(runtime, 'RoomLabCore.exe')), 'runtime must be prepared first');
  assert.ok(fs.existsSync(editorArchivePath), 'read-only editor archive is required for the cross-implementation ZIP');
  const EditorArchive = require(editorArchivePath),
    editorZip = Buffer.from(EditorArchive.pack(sample(), new Map())),
    validZip = path.join(tmp, 'editor-255.zip'),
    validJson = path.join(tmp, 'editor-255.json'),
    corruptZip = path.join(tmp, 'corrupt.zip'),
    oversizedZip = path.join(tmp, 'oversized.zip'),
    missingZip = path.join(tmp, 'missing.zip');
  fs.writeFileSync(validZip, editorZip);
  fs.writeFileSync(validJson, JSON.stringify(sample()));
  fs.writeFileSync(corruptZip, editorZip.subarray(0, Math.floor(editorZip.length * 0.55)));
  fs.writeFileSync(oversizedZip, Buffer.from(F.zipSync({
    'project.json': F.strToU8(JSON.stringify(sample())),
    'assets/big.bin': new Uint8Array(26 * 1024 * 1024),
  })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  child = spawn(path.join(runtime, 'RoomLabCore.exe'), ['--roomlab-port=' + server.address().port], {
    cwd: runtime, windowsHide: true, env: childEnv, stdio: 'ignore',
  });
  await Promise.race([connected, new Promise((_, reject) => setTimeout(() => reject(Error('Connect timeout')), 20000))]);
  attach();
  const baseline = await request({});
  const baseRoom = baseline.state.roomId,
    baseRooms = baseline.rooms.length;
  assert.equal(baseline.state.mode, 'playing');
  // Every rejected import answers the same id with a recoverable message and leaves state intact.
  for (const file of [missingZip, corruptZip, oversizedZip]) {
    const failed = await request({ importProjectPath: file });
    same(failed, baseRoom, 'playing');
    assert.match(failed.message, /导入失败/);
    assert.equal(failed.rooms.length, baseRooms);
  }
  // Paused + developer options, then a cancelled dialog (simulated with the id-less command main
  // injects after the picker closes) and another failure: both keep menu, room and pause state.
  let reply = await request({ developer: { enabled: true, lockHealth: true, flight: false }, pause: true });
  assert.equal(reply.state.mode, 'paused');
  assert.equal(reply.state.developer.enabled, true);
  checks += 2;
  reply = await request({ importProjectError: '已取消导入。' });
  same(reply, baseRoom, 'paused');
  assert.match(reply.message, /已取消导入/);
  reply = await request({ importProjectPath: corruptZip });
  same(reply, baseRoom, 'paused');
  // Valid editor ZIP: atomic swap, pause and developer options preserved.
  reply = await request({ importProjectPath: validZip });
  assert.notEqual(reply.state.roomId, baseRoom, 'a successful import must switch rooms atomically');
  assert.equal(reply.state.mode, 'paused', 'a successful import must respect the paused state');
  assert.equal(reply.state.developer.enabled, true, 'developer options must survive the swap');
  assert.equal(reply.rooms.length, sample().courses[0].rooms.length, 'room list must come from the imported project');
  assert.ok(sample().courses[0].rooms.some((r) => r.id === reply.state.roomId), 'imported room must belong to the imported project');
  checks += 4;
  // The input stream is not blocked while paused and keeps working after the import.
  const pausedElapsed = reply.state.elapsed;
  reply = await request({ dt: .05, input: { right: true } });
  assert.equal(reply.state.mode, 'paused');
  assert.equal(reply.state.elapsed, pausedElapsed, 'paused gameplay time must not advance');
  checks += 2;
  reply = await request({ pause: true });
  assert.equal(reply.state.mode, 'playing');
  checks++;
  const x = reply.state.player.x;
  reply = await request({ dt: .05, input: { right: true } });
  assert.ok(reply.state.player.x > x, 'normal input must keep flowing after an import');
  checks++;
  // A failure after the swap keeps the imported project and playing mode; JSON import also works.
  const playingRoom = reply.state.roomId;
  reply = await request({ importProjectPath: corruptZip });
  same(reply, playingRoom, 'playing');
  assert.equal(reply.state.developer.enabled, true);
  const importedRoom = reply.state.roomId;
  reply = await request({ importProjectPath: validJson });
  assert.notEqual(reply.state.roomId, importedRoom, 'a JSON project import must also swap');
  assert.equal(reply.state.mode, 'playing');
  checks += 2;
  // Unity's import button command must get its normal same-id reply immediately (the native
  // picker is opened by the main process and is never auto-answered here).
  const jsonRoom = reply.state.roomId,
    started = Date.now();
  reply = await request({ importProject: 'dialog', developer: { enabled: true, lockHealth: true, flight: false } });
  assert.ok(Date.now() - started < 5000, 'the dialog trigger must be acknowledged immediately');
  assert.equal(reply.state.roomId, jsonRoom, 'triggering the picker must not change the room');
  assert.equal(reply.state.mode, 'playing');
  assert.equal(reply.rooms.length, sample().courses[0].rooms.length);
  checks += 3;
  assert.equal(fatal.length, 0, 'no ROOMLAB_ERROR may reach Unity: ' + fatal.join(' | '));
  console.log('ROOMLAB_IMPORT_PROTOCOL_PASS checks=' + checks +
    ' idEcho=true invalidKeptState=true pausedPreserved=true developerPreserved=true atomicSwap=true crossImplementationZip=true noFatal=true inputStreamAlive=true');
  try { socket.write('{"quit":true}\n'); } catch {}
  server.close();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(0); }, 300);
})().catch((error) => {
  console.error('ROOMLAB_IMPORT_PROTOCOL_FAIL', error && error.stack || error);
  try { child?.kill(); } catch {}
  try { socket?.destroy(); } catch {}
  try { server.close(); } catch {}
  process.exit(1);
});
