'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(process.argv[2],'resources/app');
const M=require(path.join(app,'src/project/model.cjs')),Registry=require(path.join(app,'src/plugins/registry.cjs'));
const Temperature=require(path.join(app,'src/project/temperature.cjs')),{Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8'))),dt=1/120;
let plates=0,blocks=0,overlappingActors=0;
for(const course of project.courses)for(const room of course.rooms){
 for(const source of room.objects.filter(o=>o.type==='physics.thermal')){
  const g=new Engine(project,course.id,room.id),plate=g.room.objects.find(o=>o.id===source.id),ctx=g.context(plate);
  // Ensure every zone starts hot, including intersections of multiple zones.
  g.roomEnvironment='hot';for(const z of g.room.zones)g.zoneStates.set(z.id,'hot');
  for(const o of g.room.objects.filter(o=>o.type==='physics.ice')){
   o.params.respawnDelay=30;
   const s=g.objectStates.get(o.id);s.standing=2;
   Registry.get(o.type).tick(g.context(o),o,s,dt);
   assert.equal(s.solid,false);
  }
  plate.params.mode='cold';
  const expected=Temperature.affected(g.room,plate.params.zoneId).filter(o=>{
   const states=new Map(g.zoneStates);if(plate.params.zoneId)states.set(plate.params.zoneId,'cold');
   return Temperature.at(g.room,o,states,plate.params.zoneId?g.roomEnvironment:'cold')==='cold';
  });
  if(expected.length){
   // A character inside the restored area must not turn an instant toggle into an indefinite wait.
   Object.assign(g.player,{x:expected[0].x*32+2,y:expected[0].y*32+2});overlappingActors++;
  }
  const elapsed=g.elapsed;g.fire(plate);
  assert.equal(g.elapsed,elapsed,'A temperature toggle must not require advancing time');
  const colliderIds=new Set(g.colliders().map(b=>b.id));
  for(const o of expected){
   const s=g.objectStates.get(o.id);
   assert.equal(s.solid,true,`${room.name}: ${o.id} did not freeze during the cold toggle`);
   assert.equal(s.standing,0);assert.equal(s.respawnRemaining,0);assert.equal(g.visualState(o),'solid');
   if(o.collision!==false)assert.equal(colliderIds.has(o.id),true);
   blocks++;
  }
  for(const o of g.room.objects.filter(o=>o.type==='physics.ice'&&g.context(o).temperature(o)==='hot'))
   assert.equal(g.objectStates.get(o.id).solid,false,'A still-hot overlapping zone froze unexpectedly');
  plates++;
 }
}
// Standing melt in a continuously cold zone retains its configured regeneration delay.
const course=project.courses.find(c=>c.rooms.some(r=>r.objects.some(o=>o.type==='physics.ice'))),room=course.rooms.find(r=>r.objects.some(o=>o.type==='physics.ice'));
const g=new Engine(project,course.id,room.id),ice=g.room.objects.find(o=>o.type==='physics.ice'),def=Registry.get(ice.type),ctx=g.context(ice),s=g.objectStates.get(ice.id);
g.roomEnvironment='cold';for(const z of g.room.zones)g.zoneStates.set(z.id,'cold');
ice.params.respawnDelay=1;ice.params.meltAfter=.1;
Object.assign(g.player,{x:0,y:0,grounded:true,support:ice.id});Object.assign(s,{solid:true,standing:.1});
def.tick(ctx,ice,s,dt);assert.equal(s.solid,false);assert.equal(s.respawnRemaining,1);
ctx.setTemperature('','cold');assert.equal(s.solid,false,'An unchanged cold state must not bypass standing regeneration');
g.player.support=null;g.player.grounded=false;def.tick(ctx,ice,s,.5);assert.equal(s.solid,false);
def.tick(ctx,ice,s,.5);assert.equal(s.solid,true);
// Synthetic intersecting zones: cold in one zone cannot override hot in another.
g.room.zones=[{id:'a',x:ice.x,y:ice.y,w:1,h:1},{id:'b',x:ice.x,y:ice.y,w:1,h:1}];
g.zoneStates=new Map([['a','hot'],['b','hot']]);s.solid=false;s.respawnRemaining=1;
ctx.setTemperature('a','cold');assert.equal(s.solid,false);
ctx.setTemperature('b','cold');assert.equal(s.solid,true);assert.equal(s.respawnRemaining,0);
console.log(`INSTANT_FREEZE_PASS plates=${plates} blocks=${blocks} actorOverlapCases=${overlappingActors} sameCall=true collisionAndVisual=true overlappingZones=true standingMeltDelay=preserved`);
