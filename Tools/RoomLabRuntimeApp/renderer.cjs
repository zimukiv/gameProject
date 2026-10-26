const {ipcRenderer}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const M=require('./src/project/model.cjs');
const {Engine}=require('./src/runtime/engine.cjs');
const Draw=require('./src/editor/draw.cjs');
const Camera=require('./src/project/play-camera.cjs');
const {pathToFileURL}=require('node:url');
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(__dirname,'project.json'),'utf8')));
let g=new Engine(project),acc=0,edges={};
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
ipcRenderer.on('command',(_,c)=>{
 try{
  if(c.room){g=new Engine(project,c.course,c.room);acc=0;edges={};}
  if(c.retry){g.retry();edges={};}
  if(c.pause){g.togglePause();edges={};}
  edges.jumpPressed ||= !!c.input?.jumpPressed;edges.dashPressed ||= !!c.input?.dashPressed;
  if(g.mode==='playing'){
   acc+=Math.max(0,Math.min(c.dt||0,.05));
   while(acc>=1/120){g.update(1/120,{...c.input,...edges});edges={};acc-=1/120;}
  }else acc=0;
  canvas.width=Math.max(200,c.width||1000);canvas.height=Math.max(200,c.height||560);
  const camera=Camera.view(g.room,g.player,canvas.width,canvas.height);
  Draw.drawRoom(ctx,g.project,g.course,g.room,{view:camera,game:g,targets:true,assetURL:id=>{
   const asset=project.assets.find(a=>a.id===id);return asset?pathToFileURL(path.join(__dirname,asset.path)).href:null;
  }});
  ipcRenderer.send('frame',{id:c.id,state:g.snapshot(),roomName:g.room.name,message:g.messageTime>0?g.message:'',
   rooms:project.courses.flatMap(course=>course.rooms.map(r=>({id:r.id,name:r.name,course:course.id}))),
   png:c.noImage?'':canvas.toDataURL('image/png').split(',')[1]});
 }catch(e){ipcRenderer.send('failure',{id:c.id,error:e.stack});}
});
ipcRenderer.send('ready');
