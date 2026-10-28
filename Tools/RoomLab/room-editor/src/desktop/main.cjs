'use strict';
const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    safeStorage,
    clipboard,
    shell,
    net,
    session,
  } = require('electron'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const Files = require('./project-files.cjs');
const root = path.resolve(__dirname, '../..'),
  testing = process.env.ROOM_EDITOR_TEST === '1',
  sessions = new Map();
let window;
let cloud;
let closing = false;
let rendererReady = false;
if (!testing && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
});
if (testing) {
  app.disableHardwareAcceleration();
  const profile = path.join(require('node:os').tmpdir(), 'room-lab-test-profile-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}
function trusted(event) {
  if (event.sender !== window.webContents || !event.senderFrame?.url.startsWith('file:'))
    throw new Error('不是编辑器页面。');
}
function testPath(payload) {
  return testing && typeof payload?.testPath === 'string' ? path.resolve(payload.testPath) : null;
}
async function acknowledge(payload, message, detail) {
  if (testing) return payload?.testConfirm !== false;
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    message,
    detail,
    buttons: ['取消', '确认继续'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return result.response === 1;
}
function fileHash(file) {
  return fs.existsSync(file)
    ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    : null;
}
function recordFile(file, project, files) {
  const t = cloud.repo.draft(
    project,
    files.map((f) => [f.path, f.bytes]),
  );
  cloud.repo.linkFile(t.id, file, project);
  return cloud.status();
}
function register() {
  ipcMain.on('cloud:renderer-ready', (event) => {
    trusted(event);
    rendererReady = true;
  });
  ipcMain.on('cloud:close-ready', (event) => {
    trusted(event);
    closing = true;
    window.close();
  });
  ipcMain.on('cloud:close-failed', (event) => {
    trusted(event);
    dialog.showMessageBox(window, {
      type: 'error',
      message: '退出前本机备份未成功，请先保存项目或导出项目包，再重试关闭。',
    });
  });
  ipcMain.handle('cloud:action', async (event, payload) => {
    trusted(event);
    if (!payload || typeof payload.name !== 'string') throw new Error('同步请求无效');
    if (payload.name === 'copyDiagnostics') {
      const report = await cloud.action('diagnostics');
      report.version = app.getVersion();
      report.online = net.isOnline();
      if (report.network?.endpoint) {
        try {
          const proxy = await Promise.race([
            session.defaultSession.resolveProxy(report.network.endpoint),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('proxy inspection timeout')), 2500),
            ),
          ]);
          report.proxyMode = proxy === 'DIRECT' ? 'direct' : 'system-proxy';
        } catch {
          report.proxyMode = 'unavailable';
        }
      }
      clipboard.writeText(JSON.stringify(report, null, 2));
      return { copied: true };
    }
    if (payload.name === 'copyKey') {
      const key = await cloud.action('copyKey');
      clipboard.writeText(key);
      return { copied: true };
    }
    if (payload.name === 'openManager') {
      const { parse, format } = require('../cloud/connection.cjs'),
        c = parse(format(cloud.vault.load()), testing),
        t = cloud.repo.tree();
      const url = new URL(c.endpoint);
      url.hash = new URLSearchParams({
        current: t.base || t.head || t.readRevision || '',
        branch: t.branch,
      }).toString();
      if (!testing) await shell.openExternal(url.href);
      return { opened: true, url: testing ? url.href : undefined };
    }
    if (payload.name === 'linkFile') {
      const p = payload.data || {},
        t = cloud.repo.tree(p.id),
        forced = testPath(p);
      const chosen = forced
        ? { canceled: false, filePaths: [forced] }
        : await dialog.showOpenDialog(window, {
            title: '关联本地大关项目文件（不替换草稿）',
            properties: ['openFile'],
            filters: [{ name: 'Room Lab 项目 JSON', extensions: ['json'] }],
          });
      if (chosen.canceled) return cloud.status();
      const file = chosen.filePaths[0],
        loaded = Files.readProject(file);
      if (loaded.project.id !== t.projectId)
        throw new Error('所选文件属于其他项目，不能关联到该工作树。');
      const duplicates = cloud.repo
        .status()
        .trees.filter(
          (x) => x.id !== t.id && x.localFile?.path.toLowerCase() === file.toLowerCase(),
        );
      if (
        !(await acknowledge(
          p,
          duplicates.length ? '此文件已关联其他工作树，是否继续？' : '确认关联此本地文件？',
          file + '\n只记录位置，不会替换草稿或自动覆盖文件。',
        ))
      )
        return cloud.status();
      cloud.repo.linkFile(t.id, file, loaded.project);
      return cloud.status();
    }
    if (payload.name === 'revealFile') {
      const file = cloud.repo.tree(payload.data?.id).localFile?.path;
      if (!file || !fs.existsSync(file)) throw new Error('关联文件不存在，请重新关联。');
      shell.showItemInFolder(file);
      return cloud.status();
    }
    return cloud.action(payload.name, payload.data || {});
  });
  ipcMain.handle('traces:export', async (event, payload) => {
    trusted(event);
    if (typeof payload?.text !== 'string' || Buffer.byteLength(payload.text) > 8 * 1024 * 1024)
      throw new Error('路径数据无效或超过 8 MiB');
    const forced = testPath(payload),
      chosen = forced
        ? { canceled: false, filePath: forced }
        : await dialog.showSaveDialog(window, {
            title: '保存试玩路径',
            defaultPath: (payload.name || '试玩路径') + '-路径.json',
            filters: [{ name: 'Room Lab 路径', extensions: ['json'] }],
          });
    if (chosen.canceled) return null;
    let file = chosen.filePath;
    if (!file.toLowerCase().endsWith('.json')) file += '.json';
    fs.writeFileSync(file, payload.text, 'utf8');
    return { path: file };
  });
  ipcMain.handle('traces:import', async (event, payload) => {
    trusted(event);
    const forced = testPath(payload),
      chosen = forced
        ? { canceled: false, filePaths: [forced] }
        : await dialog.showOpenDialog(window, {
            title: '读取试玩路径',
            properties: ['openFile'],
            filters: [{ name: 'Room Lab 路径', extensions: ['json'] }],
          });
    if (chosen.canceled) return null;
    const file = chosen.filePaths[0];
    if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('路径文件不能超过 8 MiB');
    return { text: fs.readFileSync(file, 'utf8') };
  });
  ipcMain.handle('project:open', async (event, payload) => {
    trusted(event);
    const forced = testPath(payload),
      chosen = forced
        ? { canceled: false, filePaths: [forced] }
        : await dialog.showOpenDialog(window, {
            title: '打开项目 JSON 或项目包',
            properties: ['openFile'],
            filters: [{ name: 'Room Lab 项目', extensions: ['json', 'zip'] }],
          });
    if (chosen.canceled) return null;
    const file = chosen.filePaths[0];
    if (file.toLowerCase().endsWith('.zip'))
      return { archive: new Uint8Array(fs.readFileSync(file)), name: path.basename(file) };
    const loaded = Files.readProject(file),
      session = crypto.randomUUID();
    const matches = cloud.repo
      .status()
      .trees.filter(
        (t) =>
          t.projectId === loaded.project.id ||
          t.localFile?.path.toLowerCase() === file.toLowerCase(),
      );
    if (
      matches.length &&
      !(await acknowledge(
        payload,
        '该项目已有本地工作树记录，是否继续打开？',
        '将从文件读取，现有工作树草稿保留；同一路径关联会在管理页提示。\n' + file,
      ))
    )
      return null;
    // Opening a file must never replace a different tree's unsaved recovery draft.
    if (matches.length && !loaded.missing.length)
      cloud.repo.create(
        loaded.project.name + ' / 本地读取',
        'open-' + crypto.randomUUID().slice(0, 8),
        { projectId: loaded.project.id },
      );
    // Keep the original missing-asset warning workflow: a cloud snapshot requires all assets.
    const cloudStatus = loaded.missing.length
      ? null
      : recordFile(file, loaded.project, loaded.files);
    sessions.set(session, { file, projectId: loaded.project.id, hash: fileHash(file) });
    return { ...loaded, session, path: file, cloudStatus };
  });
  ipcMain.handle('project:save', async (event, payload) => {
    trusted(event);
    const saved = sessions.get(payload.session);
    let file = !payload.saveAs && saved?.projectId === payload.project.id ? saved.file : null;
    const forced = testPath(payload);
    if (forced) file = forced;
    if (!file) {
      const chosen = await dialog.showSaveDialog(window, {
        title: '保存项目（素材随项目存放）',
        defaultPath: (payload.project.name || 'project') + '.json',
        filters: [{ name: 'Room Lab 项目', extensions: ['json'] }],
      });
      if (chosen.canceled) return null;
      file = chosen.filePath;
    }
    if (!file.toLowerCase().endsWith('.json')) file += '.json';
    if (fs.existsSync(file)) {
      const linked = cloud.repo
        .status()
        .trees.filter((t) => t.localFile?.path.toLowerCase() === file.toLowerCase());
      const expected =
        saved?.file === file
          ? saved.hash
          : linked.find((t) => t.id === cloud.repo.data.current)?.localFile.hash;
      const changed = expected && expected !== fileHash(file);
      if (
        !(await acknowledge(
          payload,
          changed ? '文件已被其他程序修改，仍要覆盖？' : '目标文件已存在，是否覆盖？',
          file +
            (linked.length > 1
              ? '\n多个工作树关联此文件，覆盖会影响它们再次打开时读到的内容。'
              : '') +
            '\n覆盖前会保留 JSON 备份；取消则不写入。',
        ))
      )
        return null;
    }
    const result = Files.writeProject(file, payload.project, payload.files || []),
      session =
        payload.session && sessions.has(payload.session) ? payload.session : crypto.randomUUID();
    const complete = Files.readProject(file);
    const cloudStatus = recordFile(file, payload.project, complete.files);
    sessions.set(session, { file, projectId: payload.project.id, hash: fileHash(file) });
    return { ...result, session, cloudStatus };
  });
  ipcMain.handle('assets:import', async (event, payload) => {
    trusted(event);
    const forced = testing && Array.isArray(payload?.testFiles) ? payload.testFiles : null,
      chosen = forced
        ? { canceled: false, filePaths: forced }
        : await dialog.showOpenDialog(window, {
            title: '导入美术素材',
            properties: ['openFile', 'multiSelections'],
            filters: [
              { name: '图片/图集', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
            ],
          });
    if (chosen.canceled) return [];
    return chosen.filePaths.map((file) => {
      if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('素材不能超过 20 MiB');
      return { name: path.basename(file), bytes: new Uint8Array(fs.readFileSync(file)) };
    });
  });
  ipcMain.handle('project:export', async (event, payload) => {
    trusted(event);
    const forced = testPath(payload),
      chosen = forced
        ? { canceled: false, filePath: forced }
        : await dialog.showSaveDialog(window, {
            title: '导出包含素材的项目包',
            defaultPath: payload.name + '.zip',
            filters: [{ name: 'Room Lab 项目包', extensions: ['zip'] }],
          });
    if (chosen.canceled) return null;
    fs.writeFileSync(chosen.filePath, new Uint8Array(payload.bytes));
    return { path: chosen.filePath };
  });
}
app.whenReady().then(() => {
  app.setName('Room Lab');
  const { Repository } = require('../cloud/repository.cjs'),
    { Vault } = require('../cloud/connection.cjs'),
    { Service } = require('../cloud/service.cjs');
  const cloudRoot = path.join(
    testing ? app.getPath('userData') : app.getPath('appData'),
    'RoomLabSync',
  );
  cloud = new Service(new Repository(cloudRoot), new Vault(cloudRoot, safeStorage), {
    allowLocal: testing,
    fetcher: require('../cloud/chromium-http.cjs').create(net),
  });
  window = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 900,
    minHeight: 650,
    show: !testing,
    backgroundColor: '#0e1521',
    title: 'Room Lab · 物理大关编辑器',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: testing,
      backgroundThrottling: !testing,
      additionalArguments: testing ? ['--room-editor-test'] : [],
    },
  });
  if (testing) window.webContents.setFrameRate(60);
  register();
  window.on('close', (event) => {
    if (closing || !rendererReady || !window.webContents.getURL().startsWith('file:')) return;
    event.preventDefault();
    window.webContents.send('cloud:prepare-close');
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(root, 'build/index.html'));
});
app.on('window-all-closed', () => app.quit());
