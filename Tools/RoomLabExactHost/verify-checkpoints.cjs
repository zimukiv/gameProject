'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(process.argv[2],'resources/app');
const M=require(path.join(app,'src/project/model.cjs')),{Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const Spikes=require(path.join(app,'src/project/spikes.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(process.argv[3]||path.join(app,'project.json'),'utf8'))),dt=1/120;
assert.deepEqual(M.validate(project,{play:true}),{errors:[],warnings:[]});
let checkpoints=0,deaths=0;
for(const course of project.courses)for(const room of course.rooms)for(const source of room.objects.filter(o=>o.type==='common.checkpoint')){
 function activate(){
  const g=new Engine(project,course.id,room.id),flag=g.room.objects.find(o=>o.id===source.id);
  g.tokens=17;g.charges=2;g.recharge=7;g.score=1234;
  g.credited.add(room.id+'/earlier-item');g.courseState.aiActive=true;
  Object.assign(g.player,{x:flag.x*32+4,y:flag.y*32+4,face:-1,invulnerable:1});
  g.update(0);assert.equal(g.checkpoint.id,flag.id,'Touching the actual flag did not save');
  assert.equal(g.visualState(flag),'active');return g;
 }
 const g=activate(),saved=structuredClone(g.checkpoint),elapsed=g.elapsed;
 g.tokens=0;g.charges=0;g.recharge=0;g.score=0;g.credited.clear();
 for(const z of g.room.zones)g.zoneStates.set(z.id,'hot');
 g.retry();
 assert.equal(g.player.x,saved.spawn.x);assert.equal(g.player.y,saved.spawn.y);assert.equal(g.player.face,-1);
 assert.equal(g.checkpoint.id,source.id);assert.equal(g.snapshot().checkpointId,source.id);
 assert.equal(g.tokens,saved.resources.tokens);assert.equal(g.charges,2);assert.equal(g.recharge,7);assert.equal(g.score,saved.score);
 assert.ok(g.credited.has(room.id+'/earlier-item'));assert.equal(g.courseState.aiActive,true);
 assert.equal(g.ai.x,g.player.x+g.player.w/2-165,'AI must restart relative to checkpoint spawn');
 assert.deepEqual(Object.fromEntries(g.zoneStates),saved.state.zones);
 assert.equal(g.respawnRemaining,.5);assert.equal(g.player.freeDash,true);assert.equal(g.player.paidDashUsed,false);
 for(let i=0;i<60;i++)g.update(dt,{dashPressed:true,jumpPressed:true});
 assert.equal(g.respawnRemaining,0);assert.equal(g.elapsed,elapsed);assert.equal(g.player.dashCount,0);
 g.update(0);assert.equal(g.events.filter(e=>e.type==='checkpoint').length,1,'Respawn must not overwrite the save on contact');
 for(const kind of ['fall','spike','ai']){
  const d=activate();
  if(kind==='fall'){d.player.y=d.room.rows*32+100;d.update(0);}
  if(kind==='spike'){
   const spike=d.room.objects.find(o=>o.type==='common.spike'),shape=Spikes.geometry(d.objectRect(spike),spike.params.direction);
   Object.assign(d.player,{x:shape.x-d.player.w/2,y:shape.y-d.player.h/2,vx:0,vy:0});d.update(0);
  }
  if(kind==='ai'){d.tokens=0;d.ai.processing=0;d.ai.cooldown=0;d.player.invulnerable=0;d.catchPlayer();}
  assert.equal(d.deaths,1,kind);assert.equal(d.player.x,d.checkpoint.spawn.x);assert.equal(d.player.y,d.checkpoint.spawn.y);
  assert.equal(d.checkpoint.id,source.id);assert.equal(d.respawnRemaining,.5);deaths++;
 }
 const fly=new Engine(project,course.id,room.id);fly.setDeveloperOptions({enabled:true,flight:true});
 Object.assign(fly.player,{x:source.x*32+4,y:source.y*32+4});fly.update(0);assert.equal(fly.checkpoint.id,null);
 checkpoints++;
}
assert.equal(checkpoints,7);
const course=project.courses[0],room=course.rooms.find(r=>r.objects.filter(o=>o.type==='common.checkpoint').length>1),g=new Engine(project,course.id,room.id);
for(const flag of g.room.objects.filter(o=>o.type==='common.checkpoint')){
 Object.assign(g.player,{x:flag.x*32+4,y:flag.y*32+4});g.update(0);assert.equal(g.checkpoint.id,flag.id);
}
const next=course.rooms.find(r=>r.id!==room.id);g.loadRoom(next.id,undefined,{tokens:0,charges:3,recharge:0,freeDash:true,dashCount:0});
assert.equal(g.checkpoint.id,null,'A new room must start with its own checkpoint/entry');
console.log(`CHECKPOINTS_PASS flags=${checkpoints} deathRoutes=${deaths} actualContact=true position/resources/score/credits/temperature=restored aiSpawnRelative=true latestWins=true respawnBuffer=0.5s inputDropped=true flightDoesNotSave=true roomReset=true`);
