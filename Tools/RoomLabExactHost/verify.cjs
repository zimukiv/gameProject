const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');let socket,child;const server=net.createServer();
const connected=new Promise(resolve=>server.once('connection',c=>{socket=c;resolve();}));
const runtime=path.resolve(process.argv[2]),app=path.join(runtime,'resources/app');
const M=require(path.join(app,'src/project/model.cjs'));
const {Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const {InputSteps}=require(path.join(app,'src/runtime/input-steps.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8')));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;env.ELECTRON_NO_ATTACH_CONSOLE="1";
let buffer='',waiter,id=0,checks=0,wroteRespawnPreview=false;
function attach(){socket.on('data',chunk=>{buffer+=chunk;for(;;){let at=buffer.indexOf('\n');if(at<0)break;const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
 if(line.startsWith('ROOMLAB_ERROR ')){waiter?.reject(Error(line));continue;}
 if(line.startsWith('ROOMLAB_FRAME ')){waiter?.resolve(JSON.parse(line.slice(14)));waiter=null;}}});
}
function request(c){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Host response timeout')),20000);waiter={resolve:x=>{clearTimeout(timer);resolve(x);},reject:e=>{clearTimeout(timer);reject(e);}};socket.write(JSON.stringify({id:++id,noImage:true,width:400,height:240,...c})+'\n');});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 child=spawn(path.join(runtime,'RoomLabCore.exe'),['--roomlab-port='+server.address().port],{cwd:runtime,windowsHide:true,env,stdio:'ignore'});
 await Promise.race([connected,new Promise((_,reject)=>setTimeout(()=>reject(Error('Connect timeout')),20000))]);attach();
 for(const course of project.courses)for(const room of course.rooms){
  const reference=new Engine(project,course.id,room.id);let acc=0;
  let reply=await request({room:room.id,course:course.id});
  assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
  assert.equal(reply.state.charges,3);checks++;
  for(let i=0;i<12;i++){
   const input={right:i<8,left:i>=8,up:i%4===0,down:i%5===0,jumpPressed:i===1,dashPressed:i===3||i===6||i===9};
   acc+=.05;let edges={jumpPressed:input.jumpPressed,dashPressed:input.dashPressed};
   while(acc>=1/120){reference.update(1/120,{...input,jumpPressed:false,dashPressed:false,...edges});edges={};acc-=1/120;}
   reply=await request({dt:.05,input});
   assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
  }
  reference.togglePause();reply=await request({pause:true,dt:.05});assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
  reference.retry();reply=await request({retry:true});assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
  if(!wroteRespawnPreview){
   reply=await request({noImage:false,width:1280,height:600});
   assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
   fs.writeFileSync(path.join(runtime,'respawn-preview.png'),Buffer.from(reply.png,'base64'));wroteRespawnPreview=true;
  }
  acc=0;const frozenElapsed=reference.elapsed,frozenDeaths=reference.deaths;
  for(let i=0;i<11;i++){
   const input={right:true,jumpPressed:i<10,dashPressed:i<10};
   acc+=.05;let edges={jumpPressed:input.jumpPressed,dashPressed:input.dashPressed};
   while(acc>=1/120){reference.update(1/120,{...input,jumpPressed:false,dashPressed:false,...edges});edges={};acc-=1/120;}
   reply=await request({dt:.05,input});
   assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
   if(i<10)assert.equal(reply.state.elapsed,frozenElapsed,'World advanced during respawn buffer');
   if(i===9)assert.equal(reply.state.respawnRemaining,0,'Respawn buffer did not end after 0.5 seconds');
  }
  if(reply.state.respawnRemaining>0)assert.equal(reply.state.deaths,frozenDeaths+1,'Unexpected countdown restart');
  assert.equal(reply.state.player.dashCount,0,'Dash input leaked out of the respawn buffer');
  // Exercise the exact batched protocol now emitted by Unity while waiting for PNG replies.
  const batched=new Engine(project,course.id,room.id),steps=new InputSteps();
  reply=await request({room:room.id,course:course.id});
  for(const samples of [
   [{dt:.016,input:{jumpPressed:true,right:true}},{dt:.016,input:{right:true}}],
   [{dt:.001,input:{right:true,dashPressed:true}},{dt:.001,input:{}},{dt:.001,input:{left:true,dashPressed:true}}],
   [{dt:.05,input:{}},{dt:.05,input:{}}],
   [{dt:.016,input:{dashPressed:true}}]
  ]){
   steps.advance(batched,{samples});reply=await request({samples});
   assert.deepEqual(reply.state,JSON.parse(JSON.stringify(batched.snapshot())));checks++;
  }
 }
 // Developer settings are session state, applied even while the menu pauses play.
 let devReply=await request({pause:true,developer:{enabled:true,lockHealth:true}});
 assert.equal(devReply.state.mode,'paused');assert.deepEqual(devReply.state.developer,{enabled:true,lockHealth:true,flight:false});checks++;
 devReply=await request({room:project.courses[0].rooms[0].id,course:project.courses[0].id});
 assert.deepEqual(devReply.state.developer,{enabled:true,lockHealth:true,flight:false});checks++;
 devReply=await request({retry:true});assert.equal(devReply.state.deaths,1);assert.equal(devReply.state.respawnRemaining,.5);assert.equal(devReply.state.developer.lockHealth,true);checks++;
 devReply=await request({developer:{enabled:false,lockHealth:true}});
 assert.deepEqual(devReply.state.developer,{enabled:false,lockHealth:false,flight:false});checks++;
 console.log('ROOMLAB_DEVELOPER_BRIDGE_PASS pausedToggle=true roomSelectionCarry=true manualRetry=true disablingModeClearsLock=true');
 const first=project.courses[0],referenceFlight=new Engine(project,first.id,first.rooms[0].id),flightSteps=new InputSteps();
 referenceFlight.setDeveloperOptions({enabled:true,flight:true});
 devReply=await request({room:first.rooms[0].id,course:first.id,developer:{enabled:true,flight:true}});
 assert.deepEqual(devReply.state,JSON.parse(JSON.stringify(referenceFlight.snapshot())));checks++;
 const flyInput={right:true,up:true,dashPressed:true};flightSteps.advance(referenceFlight,{dt:.05,input:flyInput});
 devReply=await request({dt:.05,input:flyInput});assert.deepEqual(devReply.state,JSON.parse(JSON.stringify(referenceFlight.snapshot())));checks++;
 const beforeMap=devReply.state;
 devReply=await request({mapView:'course',dt:.05,input:flyInput,noImage:false,width:1280,height:720});
 assert.equal(devReply.mapView,'course');assert.equal(devReply.mapRooms.length,11);assert.deepEqual(devReply.state,beforeMap);checks++;
 fs.writeFileSync(path.join(runtime,'developer-map-overview-preview.png'),Buffer.from(devReply.png,'base64'));
 const large=first.rooms.find(r=>r.cols===60&&r.rows===60);
 devReply=await request({mapView:'room',previewRoom:large.id,dt:.05,input:flyInput,noImage:false,width:1280,height:720});
 assert.equal(devReply.mapView,'room');assert.ok(devReply.previewRoomName.includes(large.name));assert.deepEqual(devReply.state,beforeMap);checks++;
 fs.writeFileSync(path.join(runtime,'developer-map-room-preview.png'),Buffer.from(devReply.png,'base64'));
 devReply=await request({mapView:'room',previewRoom:large.id,mapZoom:3,mapPanX:100,mapPanY:-100,dt:.05});
 assert.deepEqual(devReply.state,beforeMap);checks++;
 devReply=await request({developer:{enabled:false,flight:true},mapView:'course'});
 assert.equal(devReply.mapView,'');assert.equal(devReply.state.developer.flight,false);checks++;
 // Preview also clears a press that arrived before the next physics step.
 await request({room:first.rooms[0].id,course:first.id,developer:{enabled:true}});
 devReply=await request({dt:.001,input:{dashPressed:true}});assert.equal(devReply.state.player.dashCount,0);checks++;
 devReply=await request({mapView:'room',dt:.05,input:{dashPressed:true}});assert.equal(devReply.state.player.dashCount,0);checks++;
 devReply=await request({dt:.05});assert.equal(devReply.state.player.dashCount,0);checks++;
 await request({developer:{enabled:false}});
 console.log('ROOMLAB_FLIGHT_MAP_BRIDGE_PASS flight=true atlas=11 mapFrozen=true otherRoomReadOnly=true zoomPan=true modeGate=true noInputLeak=true');
 const checkpointRoom=first.rooms.find(r=>r.objects.some(o=>o.type==='common.checkpoint'));
 if(checkpointRoom){
  const flag=checkpointRoom.objects.find(o=>o.type==='common.checkpoint');
  let reached=await request({room:checkpointRoom.id,course:first.id,developer:{enabled:true,flight:true,lockHealth:true}});
  for(const [axis,target] of [['x',flag.x*32+4],['y',flag.y*32]]){
   let moves=0;
   while(Math.abs(reached.state.player[axis]-target)>=4){
    assert.ok(++moves<200,'Could not fly to the real checkpoint');
    const delta=target-reached.state.player[axis],time=Math.min(.05,Math.abs(delta)/440);
    const input=axis==='x'?{right:delta>0,left:delta<0}:{down:delta>0,up:delta<0};
    reached=await request({dt:time,input});
   }
  }
  reached=await request({developer:{enabled:true,flight:false,lockHealth:true},dt:.05,noImage:false,width:1280,height:720});
  assert.equal(reached.state.checkpointId,flag.id,'Real runtime checkpoint contact did not save');checks++;
  fs.writeFileSync(path.join(runtime,'checkpoint-active-preview.png'),Buffer.from(reached.png,'base64'));
  const savedResources={tokens:reached.state.tokens,charges:reached.state.charges,score:reached.state.score};
  await request({dt:.05,input:{right:true,dashPressed:true}});
  reached=await request({retry:true});
  assert.equal(reached.state.player.x,flag.x*32+4);assert.equal(reached.state.player.y,flag.y*32+4);
  assert.equal(reached.state.checkpointId,flag.id);assert.equal(reached.state.respawnRemaining,.5);checks++;
  for(const [key,value] of Object.entries(savedResources))assert.equal(reached.state[key],value);checks++;
  await request({developer:{enabled:false}});
  console.log('ROOMLAB_CHECKPOINT_BRIDGE_PASS actualFlightToFlag=true contactSave=true retrySpawn=true resourcesRestored=true buffer=0.5s');
 }
 // Real first-room route: stand, jump, free dash, release, reverse paid dash.
 const start=project.courses[0];let reply=await request({room:start.rooms[0].id,course:start.id});
 for(const input of [{},{jumpPressed:true},{}])reply=await request({samples:[{dt:.05,input}]});
 assert.equal(reply.state.player.grounded,false);checks++;
 reply=await request({samples:[{dt:.05,input:{right:true,dashPressed:true}}],noImage:false,width:1280,height:600});
 assert.equal(reply.state.player.dashCount,1);assert.equal(reply.state.charges,3);assert.equal(reply.state.player.paidDashUsed,false);checks++;
 fs.writeFileSync(path.join(runtime,'dash-first-preview.png'),Buffer.from(reply.png,'base64'));
 reply=await request({samples:[{dt:.05,input:{right:true}}]});
 reply=await request({samples:[{dt:.05,input:{left:true,dashPressed:true}}],noImage:false,width:1280,height:600});
 assert.equal(reply.state.player.grounded,false);assert.equal(reply.state.player.dashCount,2);assert.equal(reply.state.charges,2);assert.equal(reply.state.player.dashX,-1);checks++;
 fs.writeFileSync(path.join(runtime,'dash-second-preview.png'),Buffer.from(reply.png,'base64'));
 reply=await request({samples:[{dt:.05,input:{right:true,dashPressed:true}}]});
 assert.equal(reply.state.player.dashCount,2);assert.equal(reply.state.charges,2);checks++;
 console.log('ROOMLAB_REAL_AIR_COMBO_PASS firstPress=free stock=3 secondPress=reverse-paid stock=2 thirdPress=blocked');
 const preview=path.join(runtime,'exact-preview.png');
 for(const room of (process.argv.slice(3).length?process.argv.slice(3):[undefined])){
  const data=project.courses.flatMap(c=>c.rooms).find(r=>r.id===room);
  reply=await request({noImage:false,width:1280,height:data?.rows>30&&data.playCamera?.mode!=='follow'?1280:600,room});
  const png=Buffer.from(reply.png,'base64');fs.writeFileSync(preview,png);
  if(room)fs.writeFileSync(path.join(runtime,'preview-'+room+'.png'),png);
 }
 console.log('ROOMLAB_EXACT_CONFORMANCE_PASS checks='+checks+' rooms='+project.courses.reduce((n,c)=>n+c.rooms.length,0)+' preview='+preview);
 socket.end('{"quit":true}\n');server.close();
})().catch(e=>{console.error(e);child?.kill();socket?.destroy();server.close();process.exitCode=1;});
