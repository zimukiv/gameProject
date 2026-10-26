'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(process.argv[2],'resources/app');
const M=require(path.join(app,'src/project/model.cjs')),{Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8'))),dt=1/120;
function fixture(lock){
 const g=new Engine(project);
 for(const key of ['tiles','objects','movables','zones','exits'])g.room[key]=[];
 g.setDeveloperOptions({enabled:lock,lockHealth:lock});
 Object.assign(g.player,{x:320,y:160,invulnerable:0});return g;
}
function spike(g){
 const o=structuredClone(project.courses.flatMap(c=>c.rooms).flatMap(r=>r.objects).find(o=>o.type==='common.spike'));
 Object.assign(o,{x:10,y:8,params:{...o.params,direction:'up'}});
 g.room.objects=[o];g.objectStates.set(o.id,{cooldown:0});
 Object.assign(g.player,{x:326,y:280,vx:0,vy:0});
}
for(const lock of [false,true])for(const kind of ['spike','fall','ai']){
 const g=fixture(lock);g.tokens=7;g.charges=2;g.score=1234;
 if(kind==='spike'){spike(g);g.update(dt);}
 if(kind==='fall'){g.player.y=g.room.rows*32+100;g.update(dt);}
 if(kind==='ai'){g.ai.processing=0;g.ai.cooldown=0;g.catchPlayer();}
 if(lock){
  assert.equal(g.deaths,0,kind);assert.equal(g.respawnRemaining,0);assert.equal(g.tokens,7);assert.equal(g.charges,2);assert.equal(g.score,1234);assert.equal(g.steals,0);
  if(kind==='fall'){assert.equal(g.player.x,g.entry.x*32+4);assert.equal(g.player.y,g.entry.y*32+4);assert.equal(g.player.vy,0);}
 }else if(kind==='ai'){assert.equal(g.tokens,6);assert.equal(g.steals,1);}
 else{assert.equal(g.deaths,1,kind);assert.equal(g.respawnRemaining,.5);}
}
for(const lock of [false,true]){
 const g=fixture(lock);g.tokens=0;g.ai.processing=0;g.ai.cooldown=0;g.catchPlayer();
 assert.equal(g.deaths,lock?0:1);assert.equal(g.respawnRemaining,lock?0:.5);
}
const enabled=fixture(true);spike(enabled);enabled.update(dt);assert.equal(enabled.deaths,0);
enabled.setDeveloperOptions({enabled:true,lockHealth:false});enabled.update(dt);assert.equal(enabled.deaths,1,'Turning off lock must immediately restore spike deaths');
const gated=fixture(false);gated.setDeveloperOptions({enabled:false,lockHealth:true});assert.equal(gated.developer.lockHealth,false);
spike(gated);gated.update(dt);assert.equal(gated.deaths,1);
let rooms=0;
for(const course of project.courses)for(const room of course.rooms){
 const g=new Engine(project,course.id,room.id);
 assert.deepEqual(g.developer,{enabled:false,lockHealth:false,flight:false});
 g.setDeveloperOptions({enabled:true,lockHealth:true});g.togglePause();g.togglePause();
 g.retry();assert.equal(g.deaths,1);assert.equal(g.respawnRemaining,.5);assert.equal(g.developer.lockHealth,true);
 g.loadRoom(room.id,undefined,{tokens:0,charges:3,recharge:0,freeDash:true,dashCount:0});
 assert.equal(g.developer.lockHealth,true,'Room load must preserve session developer options');rooms++;
}
console.log(`DEVELOPER_MODE_PASS default=off rooms=${rooms} spikeImmune=true aiDeathAndTheftImmune=true fall=entryWithoutReset manualRetry=preserved offRestoresDeaths=true modeGate=true roomAndPauseCarry=true`);
