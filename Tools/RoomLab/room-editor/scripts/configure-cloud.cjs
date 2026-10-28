'use strict';
// Owner provisioning. Secrets arrive through hidden stdin and never enter argv or logs.
const path = require('node:path'),
  crypto = require('node:crypto'),
  { openProfile } = require('./cloud-profile.cjs'),
  { Remote, parse, format } = require('../src/cloud/connection.cjs');
async function install(c, options = {}) {
  const appData = process.env.APPDATA,
    profile = options.profile || path.join(appData, require('../package.json').name),
    root = options.root || path.join(appData, 'RoomLabSync'),
    file = path.join(root, 'connection.vault');
  const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
    app = await openProfile(profile, playwright);
  try {
    const existing = await app.evaluate(({ safeStorage }, file) => {
      const fs = process.getBuiltinModule('fs');
      if (!fs.existsSync(file)) return null;
      try {
        return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      } catch {
        throw Error('现有连接无法由正式程序解密；已保留原配置，请先修复加密配置。');
      }
    }, file);
    const connection =
      existing ||
      parse(
        format({
          v: 1,
          endpoint: c.endpoint,
          accessToken: c.accessToken,
          workspaceKey: crypto.randomBytes(32).toString('base64url'),
        }),
      );
    if (c.endpoint && connection.endpoint !== c.endpoint)
      throw Error('已有连接属于其他云服务，已保留原配置。');
    await (
      options.remoteFactory ? options.remoteFactory(connection) : new Remote(connection)
    ).state();
    if (existing)
      return {
        configured: true,
        existing: true,
        productionProfileVerified: true,
        cloudAuthenticated: true,
      };
    return await app.evaluate(
      ({ safeStorage }, { connection, file }) => {
        const fs = process.getBuiltinModule('fs'),
          path = process.getBuiltinModule('path');
        if (!safeStorage.isEncryptionAvailable()) throw Error('Windows 加密不可用');
        const bytes = safeStorage.encryptString(JSON.stringify(connection));
        if (safeStorage.decryptString(bytes) !== JSON.stringify(connection))
          throw Error('正式加密配置校验失败');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', bytes);
        fs.renameSync(file + '.tmp', file);
        return {
          configured: true,
          encrypted: true,
          productionProfileVerified: true,
          cloudAuthenticated: true,
        };
      },
      { connection, file },
    );
  } finally {
    await app.close();
  }
}
if (require.main === module) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  console.log('Ready for encrypted cloud setup JSON on stdin (input is hidden).');
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
    if (!/[\r\n]/.test(input)) return;
    let c;
    try {
      c = JSON.parse(input.trim());
    } catch {
      console.error('Invalid setup JSON');
      process.exitCode = 1;
      return;
    }
    input = '';
    process.stdin.pause();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    install(c)
      .then((r) => console.log(JSON.stringify(r)))
      .catch((e) => {
        console.error(e.message);
        process.exitCode = 1;
      });
  });
}
module.exports = { install };
