'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(process.argv[2],'resources/app');
const M=require(path.join(app,'src/project/model.cjs')),{Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const MapPreview=require(path.join(app,'src/runtime/developer-map.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8'))),dt=1/120;
function fixture(){
 const g=new Engine(project);for(const key of ['tiles','objects','movables','zones','exits'])g.room[key]=[];
 Object.assign(g.player,{x:320,y:160,grounded:false,invulnerable:0});
 g.setDeveloperOptions({enabled:true,flight:true});return g;
}
for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){
 const g=fixture();g.update(dt,{right:x>0,left:x<0,down:y>0,up:y<0,dashPressed:true,jumpPressed:true});
 assert.ok(Math.abs(Math.hypot(g.player.x-320,g.player.y-160)-g.config.speed*2*dt)<1e-8);
 assert.equal(g.charges,3);assert.equal(g.player.freeDash,true);assert.equal(g.player.dashCount,0);
}
const hover=fixture();for(let i=0;i<120;i++)hover.update(dt);
assert.equal(hover.player.x,320);assert.equal(hover.player.y,160);assert.equal(hover.player.vy,0);
hover.room.tiles=[{x:12,y:5}];for(let i=0;i<60;i++)hover.update(dt,{right:true});
assert.ok(hover.player.x>416,'Flight did not pass through the wall');
for(let i=0;i<300;i++)hover.update(dt,{up:true,left:true});assert.equal(hover.player.x,0);assert.equal(hover.player.y,0);
for(let i=0;i<600;i++)hover.update(dt,{down:true,right:true});
assert.equal(hover.player.x,hover.room.cols*32-hover.player.w);assert.equal(hover.player.y,hover.room.rows*32-hover.player.h);
assert.equal(hover.deaths,0);
const safe=fixture();safe.room.tiles=[{x:12,y:5}];Object.assign(safe.player,{x:390,y:160});
safe.setDeveloperOptions({enabled:true,flight:false});assert.equal(safe.player.x,320);assert.equal(safe.player.y,160);
safe.update(dt);assert.ok(safe.player.vy>0,'Gravity did not resume');
const changed=fixture();changed.room.tiles=[{x:10,y:5},{x:12,y:5}];Object.assign(changed.player,{x:390,y:160});
changed.setDeveloperOptions({enabled:false,flight:true});assert.equal(changed.developer.flight,false);
assert.equal(changed.player.x,changed.entry.x*32+4,'Blocked anchor must fall back to a safe entry');
const open=fixture();Object.assign(open.player,{x:500,y:200});open.setDeveloperOptions({enabled:true});assert.equal(open.player.x,500);assert.equal(open.player.y,200);
const cleanup=fixture();Object.assign(cleanup.player,{dash:.2,rail:{id:'test'},launched:true});
cleanup.setDeveloperOptions({enabled:false});cleanup.setDeveloperOptions({enabled:true,flight:true});
assert.equal(cleanup.player.dash,0);assert.equal(cleanup.player.rail,null);assert.equal(cleanup.player.launched,false);
cleanup.ai.processing=0;cleanup.ai.cooldown=0;cleanup.tokens=0;cleanup.catchPlayer();assert.equal(cleanup.deaths,0);
cleanup.tokens=7;cleanup.catchPlayer();assert.equal(cleanup.tokens,7);
cleanup.retry();assert.equal(cleanup.respawnRemaining,.5);assert.equal(cleanup.developer.flight,true);
const items=fixture(),coin=structuredClone(project.courses.flatMap(c=>c.rooms).flatMap(r=>r.objects).find(o=>o.type==='common.coin'));
Object.assign(coin,{x:10,y:5});items.room.objects=[coin];items.objectStates.set(coin.id,{cooldown:0});items.update(0);assert.equal(items.tokens,0);
items.room.objects=[];const exit=project.courses[0].rooms[0].exits[0];items.room.exits=[exit];items.exitCooldown=0;
Object.assign(items.player,{x:exit.x*32+2,y:exit.y*32+2});items.update(0);assert.equal(items.room.id,project.courses[0].rooms[0].id);
let rooms=0;
for(const course of project.courses)for(const room of course.rooms){
 const g=new Engine(project,course.id,room.id);g.setDeveloperOptions({enabled:true,flight:true});
 g.togglePause();const frozen=g.snapshot();g.update(dt,{up:true});assert.deepEqual(g.snapshot(),frozen);g.togglePause();
 g.retry();assert.equal(g.developer.flight,true);assert.equal(g.respawnRemaining,.5);rooms++;
 for(const [width,height] of [[400,240],[1280,720],[1920,1080]]){
  const v=MapPreview.roomCamera(room,width,height);
  assert.ok(v.x>=-1e-8&&v.y>=84-1e-8);assert.ok(v.x+room.cols*32*v.scale<=width+1e-8);
  assert.ok(v.y+room.rows*32*v.scale<=height-24+1e-8);
 }
}
const g=new Engine(project),before=g.snapshot();
assert.equal(MapPreview.viewMode(g,{mapView:'course'}),'');g.setDeveloperOptions({enabled:true});
for(const [width,height] of [[400,240],[1280,720],[1920,1080]]){
 const cards=MapPreview.layout(g.course,width,height);assert.equal(cards.length,g.course.rooms.length);assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
 for(const c of cards)assert.ok(c.x>=0&&c.y>=84&&c.w>0&&c.h>0&&c.x+c.w<=width&&c.y+c.h<=height);
}
const ctx=new Proxy({canvas:{width:1280,height:720}},{get:(o,k)=>k in o?o[k]:k==='measureText'?s=>({width:String(s).length*7}):()=>{}});
const state=JSON.parse(JSON.stringify(g.snapshot()));
assert.equal(MapPreview.draw(ctx,g,{mapView:'course'},()=>null).mapRooms.length,11);
const other=g.course.rooms.find(r=>r.cols===60&&r.rows===60);
assert.ok(MapPreview.draw(ctx,g,{mapView:'room',previewRoom:other.id,mapZoom:3,mapPanX:100,mapPanY:-100},()=>null).previewRoomName.includes(other.name));
assert.deepEqual(JSON.parse(JSON.stringify(g.snapshot())),state,'Map rendering must not mutate the run');
console.log(`FLIGHT_MAP_PASS rooms=${rooms} directions=8 diagonalNormalized=true hover=true noclip=true bounds=true resourcesUnchanged=true safeExit=true normalGravityRestored=true pauseAndRetry=true atlas=11 roomFit=true mapReadOnly=true`);
