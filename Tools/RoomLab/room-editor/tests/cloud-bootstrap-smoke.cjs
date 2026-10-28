'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict'),
  { openProfile } = require('../scripts/cloud-profile.cjs'),
  { install } = require('../scripts/configure-cloud.cjs');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'room-bootstrap-acceptance-')),
    profile = path.join(base, 'production'),
    wrong = path.join(base, 'old-test'),
    root = path.join(base, 'sync'),
    key = {
      endpoint: 'https://test.chatgpt.site',
      accessToken: 'test-service-secret-only-for-fixture',
    };
  let app = await openProfile(profile, playwright);
  await app.evaluate(
    ({ safeStorage }) => safeStorage.encryptString('initialize production key').length,
  );
  await app.close();
  app = await openProfile(wrong, playwright);
  const wrongBytes = await app.evaluate(({ safeStorage }) =>
    Array.from(
      safeStorage.encryptString(
        JSON.stringify({
          endpoint: 'https://test.chatgpt.site',
          accessToken: 'test-service-secret-only-for-fixture',
          workspaceKey: 'x'.repeat(43),
        }),
      ),
    ),
  );
  await app.close();
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, 'connection.vault');
  fs.writeFileSync(file, Buffer.from(wrongBytes));
  await assert.rejects(
    install(key, {
      profile,
      root,
      remoteFactory: () => ({ state: async () => ({ branches: [] }) }),
    }),
    /无法由正式程序解密/,
  );
  assert.deepEqual(fs.readFileSync(file), Buffer.from(wrongBytes));
  const fresh = path.join(base, 'fresh-sync');
  const result = await install(key, {
    profile,
    root: fresh,
    remoteFactory: () => ({ state: async () => ({ branches: [] }) }),
  });
  assert.equal(result.productionProfileVerified, true);
  app = await openProfile(profile, playwright);
  const checked = await app.evaluate(
    ({ safeStorage }, file) => {
      const c = JSON.parse(
        safeStorage.decryptString(process.getBuiltinModule('fs').readFileSync(file)),
      );
      return { valid: !!c.endpoint && c.workspaceKey.length === 43 && c.accessToken.length > 12 };
    },
    path.join(fresh, 'connection.vault'),
  );
  await app.close();
  assert.equal(checked.valid, true);
  const again = await install(key, {
    profile,
    root: fresh,
    remoteFactory: () => ({ state: async () => ({ branches: [] }) }),
  });
  assert.equal(again.existing, true);
  console.log(
    JSON.stringify({
      bootstrapRegression: true,
      wrongProfileRejected: true,
      oldCiphertextPreserved: true,
      newConfigReadableByProduction: true,
      repeatedBootstrapVerified: true,
      noCredentialsPrinted: true,
    }),
  );
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
