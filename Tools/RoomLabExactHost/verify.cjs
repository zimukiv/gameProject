const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');let socket,child;const server=net.createServer();
const connected=new Promise(resolve=>server.once('connection',c=>{socket=c;resolve();}));
const runtime=path.resolve(process.argv[2]),app=path.join(runtime,'resources/app');
const M=require(path.join(app,'src/project/model.cjs'));
const {Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8')));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;env.ELECTRON_NO_ATTACH_CONSOLE="1";
let buffer='',waiter,id=0,checks=0;
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
   const input={right:i<8,left:i>=8,up:i%4===0,down:i%5===0,jumpPressed:i===1,dashPressed:i===3||i===6};
   acc+=.05;let edges={jumpPressed:input.jumpPressed,dashPressed:input.dashPressed};
   while(acc>=1/120){reference.update(1/120,{...input,...edges});edges={};acc-=1/120;}
   reply=await request({dt:.05,input});
   assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
  }
  reference.togglePause();reply=await request({pause:true,dt:.05});assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
  reference.retry();reply=await request({retry:true});assert.deepEqual(reply.state,JSON.parse(JSON.stringify(reference.snapshot())));checks++;
 }
 const reply=await request({noImage:false,width:1280,height:600});
 const preview=path.join(runtime,'exact-preview.png');fs.writeFileSync(preview,Buffer.from(reply.png,'base64'));
 console.log('ROOMLAB_EXACT_CONFORMANCE_PASS checks='+checks+' rooms='+project.courses.reduce((n,c)=>n+c.rooms.length,0)+' preview='+preview);
 socket.end('{"quit":true}\n');server.close();
})().catch(e=>{console.error(e);child?.kill();socket?.destroy();server.close();process.exitCode=1;});
