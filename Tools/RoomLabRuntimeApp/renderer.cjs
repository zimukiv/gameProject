const {ipcRenderer}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const M=require('./src/project/model.cjs');
const {Engine}=require('./src/runtime/engine.cjs');
const {InputSteps}=require('./src/runtime/input-steps.cjs');
const Draw=require('./src/editor/draw.cjs');
const Camera=require('./src/project/play-camera.cjs');
const DeveloperMap=require('./src/runtime/developer-map.cjs');
const {pathToFileURL}=require('node:url');
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(__dirname,'project.json'),'utf8')));
let g=new Engine(project),steps=new InputSteps();
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
ipcRenderer.on('command',(_,c)=>{
 try{
  if(c.room){const developer=g.developer;g=new Engine(project,c.course,c.room);g.setDeveloperOptions(developer);steps.reset();}
  if(c.developer)g.setDeveloperOptions(c.developer);
  if(c.retry){g.retry();steps.reset();}
  if(c.pause){g.togglePause();steps.reset();}
  const mapView=DeveloperMap.viewMode(g,c);
  if(mapView)steps.reset();else steps.advance(g,c);
  canvas.width=Math.max(200,c.width||1000);canvas.height=Math.max(200,c.height||560);
  const assetURL=id=>{
   const asset=project.assets.find(a=>a.id===id);return asset?pathToFileURL(path.join(__dirname,asset.path)).href:null;
  };
  let map={mapView:'',mapRooms:[],previewRoomName:''};
  if(mapView)map=DeveloperMap.draw(ctx,g,c,assetURL);
  else Draw.drawRoom(ctx,g.project,g.course,g.room,{view:Camera.view(g.room,g.player,canvas.width,canvas.height),game:g,targets:true,assetURL});
  ipcRenderer.send('frame',{id:c.id,state:g.snapshot(),...map,roomName:g.room.name,message:g.messageTime>0?g.message:'',
   rooms:project.courses.flatMap(course=>course.rooms.map(r=>({id:r.id,name:r.name,course:course.id}))),
   png:c.noImage?'':canvas.toDataURL('image/png').split(',')[1]});
 }catch(e){ipcRenderer.send('failure',{id:c.id,error:e.stack});}
});
ipcRenderer.send('ready');
