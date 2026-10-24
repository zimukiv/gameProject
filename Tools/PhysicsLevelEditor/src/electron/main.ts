import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LevelFiles } from '../editor/persistence.ts';

const files = new LevelFiles();
const sample = () => resolve(app.getAppPath(), '../../Levels/Physics/Level1.phase1.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1480, height: 900, minWidth: 900, minHeight: 620,
    show: !process.argv.includes('--phase2-smoke') && !process.argv.includes('--phase3-smoke'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: join(app.getAppPath(), 'dist-electron/electron/preload.cjs') }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(join(app.getAppPath(), 'dist/index.html'));
  return win;
}

app.whenReady().then(() => {
  ipcMain.handle('level:open-dialog', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Level JSON', extensions: ['json'] }] });
    return result.canceled ? null : files.open(result.filePaths[0]);
  });
  ipcMain.handle('level:open-sample', () => files.open(sample()));
  ipcMain.handle('level:save-dialog', async (_event, text: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: 'Level1.edited.json', filters: [{ name: 'Level JSON', extensions: ['json'] }] });
    return result.canceled || !result.filePath ? null : files.save(result.filePath, text, files.knownFingerprint(result.filePath));
  });
  ipcMain.handle('level:save', (_event, path: string, text: string, expected: string) => files.save(path, text, expected));
  ipcMain.handle('template:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Template JSON', extensions: ['json'] }] });
    return result.canceled ? null : { path: result.filePaths[0], text: await readFile(result.filePaths[0], 'utf8') };
  });
  ipcMain.handle('template:save', async (_event, text: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: 'objects.template.json', filters: [{ name: 'Template JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return null;
    // Templates are user-authored files; never overwrite one silently.
    await writeFile(result.filePath, text, { flag: 'wx' });
    return result.filePath;
  });
  const win = createWindow();
  if (process.argv.includes('--phase2-smoke')) {
    win.webContents.once('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const button = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('打开 Phase 1 样本'));
          button?.click();
          for (let n = 0; n < 100; n++) {
            await new Promise(resolve => setTimeout(resolve, 50));
            if (document.querySelectorAll('.tree-row').length === 3) break;
          }
          return { title: document.title, objects: document.querySelectorAll('.tree-row').length,
            partial: Boolean(document.querySelector('.badge')), error: document.querySelector('.error')?.textContent ?? null };
        })()`);
        console.log('PHASE2_ELECTRON_SMOKE=' + JSON.stringify(result));
        process.exitCode = result.objects === 3 && result.partial && !result.error ? 0 : 1;
      } catch (error) { console.error('PHASE2_ELECTRON_SMOKE_FAIL', error); process.exitCode = 1; }
      app.quit();
    });
  }
  if (process.argv.includes('--phase3-smoke')) {
    win.webContents.once('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const pause = () => new Promise(resolve => setTimeout(resolve, 80));
          const button = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('打开 Phase 1 样本'));
          button?.click();
          for (let n=0;n<100 && document.querySelectorAll('.tree-row').length!==3;n++) await pause();
          const rows=[...document.querySelectorAll('.tree-row')];
          rows[0]?.dispatchEvent(new MouseEvent('click',{bubbles:true})); await pause();
          rows[1]?.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})); await pause();
          const multi=document.querySelector('.right')?.textContent?.includes('选中 2 个对象') ?? false;
          const mixed=Boolean(document.querySelector('.right input[placeholder="Mixed"]'));
          const active=document.querySelector('.right input[type="checkbox"]');
          active?.click(); await pause();
          const changed=document.querySelectorAll('.object.inactive').length;
          [...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='撤销')?.click(); await pause();
          const undone=document.querySelectorAll('.object.inactive').length;
          return {objects:rows.length,partial:Boolean(document.querySelector('.badge')),multi,mixed,changed,undone,
            error:document.querySelector('.error')?.textContent ?? null};
        })()`);
        console.log('PHASE3_ELECTRON_GUI=' + JSON.stringify(result));
        process.exitCode=result.objects===3 && result.partial && result.multi && result.mixed &&
          result.changed===2 && result.undone===0 && !result.error ? 0 : 1;
      } catch(error) { console.error('PHASE3_ELECTRON_GUI_FAIL',error); process.exitCode=1; }
      app.quit();
    });
  }
});
app.on('window-all-closed', () => app.quit());
