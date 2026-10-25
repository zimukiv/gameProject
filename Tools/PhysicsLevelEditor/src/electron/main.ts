import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { LevelFiles } from '../editor/persistence.ts';
import { ReleaseProject } from '../editor/release-project.ts';
import { PlaytestService } from '../editor/playtest.ts';
import type {RoomId} from '../model/m1-contract.ts';
import type {RoomOverlay} from '../editor/release-project.ts';

const files = new LevelFiles();
const sample = () => app.isPackaged ? join(app.getAppPath(),'bundled-levels','Level1.phase1.json') :
  resolve(app.getAppPath(), '../../Levels/Physics/Level1.phase1.json');

type CssRect={x:number;y:number;width:number;height:number};
let playtestCssRect:CssRect|null=null;

// The renderer only ever sends a CSS rectangle inside its own content area.
// The native HWND and the physical screen rectangle stay in the main process.
function physicalRect(win:BrowserWindow,rect:CssRect){
  const bounds=win.getContentBounds();
  const clamp=(value:number,max:number)=>Math.max(0,Math.min(value,max));
  let x=clamp(rect.x,bounds.width),y=clamp(rect.y,bounds.height);
  let width=Math.max(1,clamp(rect.width,bounds.width-x));
  let height=Math.max(1,clamp(rect.height,bounds.height-y));
  // The game is authored for 16:9. Letterbox inside the measured stage so the
  // CanvasScaler never crops the HUD; the surrounding stage stays editable UI.
  const aspect=16/9;
  if(width/height>aspect){const fitted=height*aspect;
    x+=(width-fitted)/2;width=fitted;}
  else{const fitted=width/aspect;y+=(height-fitted)/2;height=fitted;}
  return screen.dipToScreenRect(win,{x:bounds.x+x,y:bounds.y+y,
    width:Math.max(1,width),height:Math.max(1,height)});
}
function nativeHandle(win:BrowserWindow){
  const buffer=win.getNativeWindowHandle();
  const value=buffer.length>=8?buffer.readBigUInt64LE(0):BigInt(buffer.readUInt32LE(0));
  return value.toString();
}
function validRect(rect:unknown):rect is CssRect{
  if(!rect||typeof rect!=='object')return false;
  const value=rect as Record<string,unknown>;
  return ['x','y','width','height'].every(key=>
    typeof value[key]==='number'&&Number.isFinite(value[key] as number));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480, height: 900, minWidth: 900, minHeight: 620,
    show: !process.argv.includes('--phase2-smoke') && !process.argv.includes('--phase3-smoke') &&
      !process.argv.includes('--release-smoke'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: join(app.getAppPath(), 'dist-electron/electron/preload.cjs') }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(join(app.getAppPath(), 'dist/index.html'));
  return win;
}

app.whenReady().then(() => {
  const project=new ReleaseProject(app.isPackaged?join(app.getAppPath(),'bundled-levels'):
    resolve(app.getAppPath(),'../../Levels'),join(app.getPath('userData'),'room-work-copies'));
  const playtest=new PlaytestService(project,app.isPackaged?
    join(dirname(process.execPath),'game-runner'):join(app.getAppPath(),'runner-staging'),
    join(app.getPath('userData'),'playtest-sessions'));
  ipcMain.handle('release:overview',()=>project.overview());
  ipcMain.handle('release:open',(_event,roomId:RoomId)=>project.open(roomId));
  ipcMain.handle('release:save',(_event,roomId:RoomId,overlay:RoomOverlay,expected:string|null)=>
    project.save(roomId,overlay,expected));
  ipcMain.handle('release:playtest',(event,roomId:RoomId,overlay:RoomOverlay,
    expected:string|null,rect:CssRect)=>{
    const win=BrowserWindow.fromWebContents(event.sender);
    if(!win)throw Error('试玩需要一个工作台窗口');
    if(!validRect(rect))throw Error('试玩区域无效');
    playtestCssRect={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
    return playtest.launch(roomId,overlay,expected,nativeHandle(win),
      physicalRect(win,playtestCssRect),
      hostEvent=>{if(!win.isDestroyed())win.webContents.send('release:playtest-event',hostEvent);},
      (sessionId,exitCode)=>{
        for(const window of BrowserWindow.getAllWindows())
          window.webContents.send('release:playtest-exit',{sessionId,exitCode});
      });
  });
  ipcMain.handle('release:playtest-resize',(event,rect:CssRect)=>{
    const win=BrowserWindow.fromWebContents(event.sender);
    if(!win||!playtest.isActive||!validRect(rect))return false;
    playtestCssRect={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
    playtest.resize(physicalRect(win,playtestCssRect));
    return true;
  });
  ipcMain.handle('release:playtest-focus',()=>{playtest.focus();});
  ipcMain.handle('release:playtest-stop',()=>{playtest.stop();});
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
  const syncPlaytest=()=>{
    if(!playtest.isActive||!playtestCssRect)return;
    playtest.resize(physicalRect(win,playtestCssRect));
  };
  win.on('resize',syncPlaytest);
  win.on('move',syncPlaytest);
  win.on('minimize',()=>{if(playtest.isActive)playtest.hide();});
  win.on('restore',()=>{if(playtest.isActive){playtest.show();syncPlaytest();playtest.focus();}});
  win.on('close',()=>playtest.stop());
  app.on('before-quit',()=>playtest.stop());
  if(process.argv.includes('--playtest-smoke')){
    win.show();
    win.webContents.once('did-finish-load',async()=>{
      try{
        const result=await win.webContents.executeJavaScript(`(async()=>{
          const wait=ms=>new Promise(r=>setTimeout(r,ms));
          const until=async(fn,n=300)=>{for(let i=0;i<n;i++){if(fn())return true;await wait(80);}return false;};
          await until(()=>document.querySelectorAll('[data-room-id]').length===3);
          document.querySelector('[data-room-id="room1"]')?.click();
          await until(()=>document.querySelectorAll('[data-source-object]').length===71);
          const row=[...document.querySelectorAll('[data-source-object]')]
            .find(b=>b.textContent.includes('Start ground'));
          if(!row)return {error:'Start ground row missing'};
          row.click(); await wait(200);
          const field=[...document.querySelectorAll('.release-field')]
            .find(l=>l.querySelector('input')&&l.textContent.trim().startsWith('X'));
          const input=field?.querySelector('input');
          if(!input)return {error:'X field missing'};
          const before=input.value;
          const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
          setter.call(input,String(Number(before)+0.5));
          input.dispatchEvent(new Event('input',{bubbles:true}));
          input.focus(); input.blur(); await wait(250);
          const findSave=()=>[...document.querySelectorAll('button')]
            .find(b=>b.textContent.includes('保存工作副本'));
          const save=findSave();
          if(!save||save.disabled)return {error:'save not enabled after edit',before};
          save.click();
          await until(()=>findSave()?.disabled===true,200);
          const findPlay=()=>[...document.querySelectorAll('button')]
            .find(b=>b.textContent.includes('试玩 Room 1'));
          const play=findPlay();
          if(!play||play.disabled)return {error:'playtest not enabled',before};
          play.click();
          await until(()=>document.querySelector('[data-playtest-stop]'),100);
          const deadline=Date.now()+40000;
          let applied='';
          while(Date.now()<deadline){
            applied=document.querySelector('.release-footer')?.textContent??'';
            if(applied.includes('已确认应用'))break;
            await wait(150);
          }
          setTimeout(()=>document.querySelector('[data-playtest-stop]')?.click(),
            ${Number(process.env.PLE_SMOKE_HOLD_MS??25000)});
          return {before,after:String(Number(before)+0.5),
            applied:applied.includes('已确认应用'),footer:applied.slice(0,240)};
        })()`);
        console.log('PLAYTEST_SMOKE='+JSON.stringify(result));
      }catch(error){console.error('PLAYTEST_SMOKE_FAIL',error);}
    });
  }
  if(process.argv.includes('--release-smoke')){
    win.webContents.once('did-finish-load',async()=>{
      try{
        const result=await win.webContents.executeJavaScript(`(async()=>{
          for(let n=0;n<100 && document.querySelectorAll('[data-room-id]').length!==3;n++)
            await new Promise(r=>setTimeout(r,60));
          document.querySelector('[data-room-id="room1"]')?.click();
          for(let n=0;n<100 && document.querySelectorAll('[data-source-object]').length!==71;n++)
            await new Promise(r=>setTimeout(r,60));
          return {rooms:document.querySelectorAll('[data-room-id]').length,
            objects:document.querySelectorAll('[data-source-object]').length,
            error:document.querySelector('[data-release-error]')?.textContent??''};
        })()`);
        console.log('RELEASE_ELECTRON_SMOKE='+JSON.stringify(result));
        process.exitCode=result.rooms===3&&result.objects===71&&!result.error?0:1;
      }catch(error){console.error('RELEASE_ELECTRON_SMOKE_FAIL',error);process.exitCode=1;}
      app.quit();
    });
  }
  if (process.argv.includes('--phase2-smoke')) {
    win.webContents.once('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-open-legacy]')?.click();
          await new Promise(resolve => setTimeout(resolve, 80));
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
          document.querySelector('[data-open-legacy]')?.click(); await pause();
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
