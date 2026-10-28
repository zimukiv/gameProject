'use strict';
// safeStorage is bound to Chromium's Local State key. Bootstrap with the production key,
// using an isolated copy when the editor is already running.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
async function openProfile(profile, playwright) {
  const state = path.join(profile, 'Local State');
  let selected = profile;
  if (fs.existsSync(state)) {
    selected = fs.mkdtempSync(path.join(os.tmpdir(), 'room-cloud-key-profile-'));
    fs.copyFileSync(state, path.join(selected, 'Local State'));
  } else fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, ROOMLAB_BOOTSTRAP_PROFILE: selected };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await playwright._electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, 'cloud-bootstrap-main.cjs')],
    env,
  });
  await app.evaluate(async ({ app }) => {
    if (!app.isReady()) await app.whenReady();
  });
  return app;
}
module.exports = { openProfile };
