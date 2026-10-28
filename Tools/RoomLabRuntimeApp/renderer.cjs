const {ipcRenderer}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const M=require('./src/project/model.cjs');
const {Engine}=require('./src/runtime/engine.cjs');
const {InputSteps}=require('./src/runtime/input-steps.cjs');
const Draw=require('./src/editor/draw.cjs');
const Camera=require('./src/project/play-camera.cjs');
const DeveloperMap=require('./src/runtime/developer-map.cjs');
const Import=require('./src/runtime/project-import.cjs');
const {pathToFileURL}=require('node:url');
// The bundled project.json and the imported source file stay read-only for this flow.
const bundled=M.migrate(JSON.parse(fs.readFileSync(path.join(__dirname,'project.json'),'utf8')));
let project=bundled;
let assetUrl=id=>{const asset=project.assets.find(a=>a.id===id);return asset?pathToFileURL(path.join(__dirname,asset.path)).href:null;};
let g=new Engine(project),steps=new InputSteps();
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const cliProject=(process.argv.find(x=>x.startsWith('--roomlab-project='))||'').split('=').slice(1).join('=');
function importProject(file){
 // Read, migrate, validate and construct the replacement engine *before* any live state is
 // touched: a broken project never replaces the running game and never leaves a half swap.
 const loaded=Import.loadProjectFile(file);
 const candidate=new Engine(loaded.project);
 const wasPaused=g.mode!=='playing',developer={...g.developer};
 project=loaded.project;assetUrl=loaded.assetUrl;
 g=candidate;steps.reset();
 g.setDeveloperOptions(developer);
 if(wasPaused)g.togglePause();
 g.say('已导入项目：'+path.basename(loaded.source.path),5);
}
if(cliProject){
 try{importProject(cliProject);}catch(e){g.say('导入失败：'+(e.message||e),8);}
}
function paint(c){
 const mapView=DeveloperMap.viewMode(g,c);
 canvas.width=Math.max(200,c.width||1000);canvas.height=Math.max(200,c.height||560);
 if(mapView)return DeveloperMap.draw(ctx,g,c,assetUrl);
 Draw.drawRoom(ctx,g.project,g.course,g.room,{view:Camera.view(g.room,g.player,canvas.width,canvas.height),game:g,targets:true,assetURL:assetUrl});
 return {mapView:'',mapRooms:[],previewRoomName:''};
}
function reply(c,map){
 ipcRenderer.send('frame',{id:c.id,state:g.snapshot(),...map,roomName:g.room.name,message:g.messageTime>0?g.message:'',
  rooms:project.courses.flatMap(course=>course.rooms.map(r=>({id:r.id,name:r.name,course:course.id}))),
  png:c.noImage?'':canvas.toDataURL('image/png').split(',')[1]});
}
ipcRenderer.on('command',(_,c)=>{
 // Only commands that came from Unity (which always stamps a positive id) get a reply.
 // The main process injects dialog results without an id: their outcome is reported by the
 // next normal frame, so an unsolicited frame can never clear an in-flight pending command.
 const wantsReply=typeof c.id==='number'&&c.id>0;
 // Import commands never advance gameplay or mutate the room, and they are always answered
 // with the same id, so Unity's pending flag clears while the native picker is still open.
 if(c.importProject||c.importProjectPath||c.importProjectError){
  try{
   if(c.importProjectPath)importProject(c.importProjectPath);
   else if(c.importProjectError)g.say('导入失败：'+c.importProjectError,8);
  }catch(e){g.say('导入失败：'+(e.message||e),8);}
  try{
   const map=paint(c);
   if(wantsReply)reply(c,map);
  }catch(e){
   if(wantsReply)ipcRenderer.send('failure',{id:c.id,error:e.stack});
  }
  return;
 }
 try{
  if(c.room){const developer=g.developer;g=new Engine(project,c.course,c.room);g.setDeveloperOptions(developer);steps.reset();}
  if(c.developer)g.setDeveloperOptions(c.developer);
  if(c.retry){g.retry();steps.reset();}
  if(c.pause){g.togglePause();steps.reset();}
  const mapView=DeveloperMap.viewMode(g,c);
  if(mapView)steps.reset();else steps.advance(g,c);
  reply(c,paint(c));
 }catch(e){ipcRenderer.send('failure',{id:c.id,error:e.stack});}
});
ipcRenderer.send('ready');
