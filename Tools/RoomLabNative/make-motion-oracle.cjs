// Offline validation only. No JS or process runner is included in the Unity player.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),reference=path.resolve(root,'../.project-backups/roomlab255-reference-a0ecb6a/Tools/RoomLabRuntimeApp');
const {Engine}=require(path.join(reference,'src/runtime/engine.cjs'));
const project=JSON.parse(fs.readFileSync(path.join(root,'Assets/RoomLabNative/Resources/NativePrototype.json'),'utf8'));
// The frozen 2.5.2 oracle implements rail 1.0.0. This case uses only common 1/2
// semantics, sideTrigger is explicitly false; the runtime still loads the original v2 manifest.
project.pluginManifest['physics.rail']='1.0.0';
const g=new Engine(project),o=g.room.objects.find(o=>o.id==='prototype-rail');
Object.assign(g.player,{x:o.x*32+4,y:o.y*32-28,grounded:true});g.events=[];
const frames=[];
for(let i=0;i<1000;i++){
 g.events=[];g.update(1/120,{});const p=g.player;
 frames.push({x:p.x,y:p.y,vx:p.vx,vy:p.vy,grounded:p.grounded,launched:p.launched,rail:p.rail?{speed:p.rail.speed,distance:p.rail.distance,total:p.rail.total}:null,tokens:g.tokens,charges:g.charges,recharge:g.recharge,score:g.score,events:g.events});
 if(i>0&&!p.rail)break;
}
if(frames.length>=1000||!frames[0].rail||g.tokens===0)throw Error('Golden case did not exercise rail and pickup');
const target=path.join(root,'Validation/Native/P2/rail-oracle.json'),bytes=JSON.stringify({sourceCommit:'a0ecb6aa4517f14afaa2e32c825fdc71b0d246b6',dt:1/120,description:'Actual native prototype rail top contact, all segment movement, token pickup and angle exit against frozen JS rules',frames},null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==bytes)throw Error('P2 rail oracle differs');console.log('P2_RAIL_ORACLE_CHECK_PASS frames='+frames.length);}else{fs.writeFileSync(target,bytes);console.log('P2_RAIL_ORACLE_GENERATE_PASS frames='+frames.length);}
