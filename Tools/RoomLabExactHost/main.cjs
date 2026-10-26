const {app,BrowserWindow,ipcMain}=require('electron');
const net=require('node:net');
const port=Number(process.argv.find(x=>x.startsWith('--roomlab-port='))?.split('=')[1]);
const socket=net.createConnection({host:'127.0.0.1',port});
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-renderer-backgrounding');
let win,ready=false;const queue=[];
function send(command){if(ready)win.webContents.send('command',command);else queue.push(command);}
app.whenReady().then(()=>{
 win=new BrowserWindow({show:false,width:1280,height:720,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile('index.html');
 ipcMain.on('ready',()=>{ready=true;for(const c of queue)send(c);queue.length=0;});
 ipcMain.on('frame',(_,value)=>socket.write('ROOMLAB_FRAME '+JSON.stringify(value)+'\n'));
 ipcMain.on('failure',(_,error)=>socket.write('ROOMLAB_ERROR '+JSON.stringify(error)+'\n'));
});
let buffer='';
socket.on('data',chunk=>{buffer+=chunk;for(;;){const at=buffer.indexOf('\n');if(at<0)break;
 const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
 try{const c=JSON.parse(line);if(c.quit)app.quit();else send(c);}catch(e){socket.write('ROOMLAB_ERROR '+JSON.stringify({error:String(e)})+'\n');}
}});
socket.on('close',()=>app.quit());socket.on('error',()=>app.quit());
