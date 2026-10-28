const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const net=require('node:net');
const port=Number(process.argv.find(x=>x.startsWith('--roomlab-port='))?.split('=')[1]);
// Stage-1 import entry: an explicit command-line project path, or a Windows native file
// picker opened from the Unity pause menu (command {importProject:"dialog"}).
const projectArg=(process.argv.find(x=>x.startsWith('--roomlab-project='))||'').split('=').slice(1).join('=');
const projectDialog=process.argv.includes('--roomlab-project-dialog');
const socket=net.createConnection({host:'127.0.0.1',port});
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-renderer-backgrounding');
let win,ready=false;const queue=[];let picking=false;
function send(command){if(ready)win.webContents.send('command',command);else queue.push(command);}
function pickProject(){
 if(picking)return;
 picking=true;
 dialog.showOpenDialog(win,{title:'导入 RoomLab 项目（project.json 或 项目 ZIP）',properties:['openFile'],
  filters:[{name:'RoomLab 项目',extensions:['json','zip']},{name:'全部文件',extensions:['*']}]})
  .then(result=>{
   // The picker result is injected without an id: the renderer validates it, swaps atomically
   // and reports failures as a recoverable message, so the Unity input stream is never blocked.
   if(!result.canceled&&result.filePaths[0])send({importProjectPath:result.filePaths[0]});
   else send({importProjectError:'已取消导入。'});})
  .catch(error=>send({importProjectError:String((error&&error.message)||error)}))
  .finally(()=>{picking=false;});
}
app.whenReady().then(()=>{
 win=new BrowserWindow({show:false,width:1280,height:720,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false,
  additionalArguments:projectArg?['--roomlab-project='+projectArg]:[]}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile('index.html');
 ipcMain.on('ready',()=>{ready=true;for(const c of queue)send(c);queue.length=0;if(projectDialog)pickProject();});
 ipcMain.on('frame',(_,value)=>socket.write('ROOMLAB_FRAME '+JSON.stringify(value)+'\n'));
 ipcMain.on('failure',(_,error)=>socket.write('ROOMLAB_ERROR '+JSON.stringify(error)+'\n'));
});
let buffer='';
socket.on('data',chunk=>{buffer+=chunk;for(;;){const at=buffer.indexOf('\n');if(at<0)break;
 const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
 try{const c=JSON.parse(line);
  // An importProject trigger still travels to the renderer: it answers the original id at
  // once, then the picker resolves later with an id-less importProjectPath result.
  if(c.quit)app.quit();else {if(c.importProject)pickProject();send(c);}
 }catch(e){socket.write('ROOMLAB_ERROR '+JSON.stringify({error:String(e)})+'\n');}
}});
socket.on('close',()=>app.quit());socket.on('error',()=>app.quit());
