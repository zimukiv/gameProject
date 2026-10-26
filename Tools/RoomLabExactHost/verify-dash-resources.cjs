const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(process.argv[2],'resources/app');
const M=require(path.join(app,'src/project/model.cjs')),{Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8'))),dt=1/120;
function fixture(){
 const g=new Engine(project);
 for(const key of ['tiles','objects','movables','zones','exits'])g.room[key]=[];
 Object.assign(g.player,{x:320,y:160,vx:0,vy:0,grounded:false,support:null});return g;
}
function press(g){g.update(dt,{right:true,dashPressed:true});}
function land(g){
 g.room.tiles=Array.from({length:g.room.cols},(_,x)=>({x,y:10}));
 Object.assign(g.player,{x:320,y:320-g.player.h-1,vx:0,vy:240,dash:0,grounded:false,support:null,launched:false,rail:null});
 g.update(dt);assert.equal(g.player.grounded,true);g.room.tiles=[];
}
const g=fixture();
for(let cycle=0;cycle<3;cycle++){
 const stock=g.charges;
 press(g);assert.equal(g.charges,stock);assert.equal(g.player.freeDash,false);assert.equal(g.player.dashCount,1);
 press(g);assert.equal(g.charges,stock-1);assert.equal(g.player.dashCount,2);
 press(g);assert.equal(g.charges,stock-1,'A third airborne dash consumed a second paid charge');assert.equal(g.player.dashCount,2);
 assert.equal(g.player.paidDashUsed,true);
 land(g);assert.equal(g.player.freeDash,true);assert.equal(g.player.paidDashUsed,false);assert.equal(g.charges,stock-1);
}
assert.equal(g.charges,0);
for(let cycle=0;cycle<20;cycle++){
 press(g);assert.equal(g.player.dashCount,1);assert.equal(g.charges,0);
 press(g);assert.equal(g.player.dashCount,1);assert.equal(g.charges,0);
 land(g);assert.equal(g.player.freeDash,true);
}
// Refilling stock in the air does not reopen the one-paid-dash allowance.
const refill=fixture();press(refill);press(refill);
const coin=project.courses.flatMap(c=>c.rooms).flatMap(r=>r.objects).find(o=>o.type==='common.coin');
refill.collect(coin);assert.equal(refill.charges,3);press(refill);assert.equal(refill.charges,3);assert.equal(refill.player.dashCount,2);
const earned=fixture();earned.charges=0;press(earned);press(earned);assert.equal(earned.player.dashCount,1);
earned.collect(coin);assert.equal(earned.charges,1);press(earned);assert.equal(earned.charges,0);assert.equal(earned.player.paidDashUsed,true);
// Side walls and ceilings are not landings and must not restore either allowance.
const wall=fixture();press(wall);press(wall);wall.room.tiles=[{x:14,y:5}];
Object.assign(wall.player,{x:14*32-wall.player.w-1,y:160});wall.update(dt);
assert.equal(wall.player.freeDash,false);assert.equal(wall.player.paidDashUsed,true);assert.equal(wall.charges,2);
wall.room.tiles=[{x:10,y:3}];Object.assign(wall.player,{x:324,y:129,vy:-200,dash:0});wall.update(dt);
assert.equal(wall.player.vy,0);assert.equal(wall.player.freeDash,false);assert.equal(wall.player.paidDashUsed,true);
// A normal exit must carry the allowance, rather than act as an airborne reset.
const travel=fixture();press(travel);press(travel);
const exit=project.courses[0].rooms[0].exits[0],edge=travel.course.connections.find(e=>e.from.exitId===exit.id);
travel.room.exits=[structuredClone(exit)];travel.exitCooldown=0;
Object.assign(travel.player,{x:exit.x*32+1,y:exit.y*32+1,vx:0,vy:0,dash:0});travel.update(0);
assert.equal(travel.room.id,edge.to.roomId);assert.equal(travel.player.freeDash,false);assert.equal(travel.player.paidDashUsed,true);
// Keep the destination airborne: actually landing at its entry would correctly refresh both allowances.
for(const key of ['tiles','objects','movables','zones','exits'])travel.room[key]=[];
Object.assign(travel.player,{x:320,y:160,grounded:false,support:null});
const charges=travel.charges;press(travel);assert.equal(travel.charges,charges);assert.equal(travel.player.dashCount,2);
travel.retry();assert.equal(travel.player.freeDash,true);assert.equal(travel.player.paidDashUsed,false);assert.equal(travel.player.dashCount,0);assert.equal(travel.respawnRemaining,.5);
// The former total-count gate must not restrict a free dash or an unused paid allowance.
const count=fixture();count.player.dashCount=99;press(count);assert.equal(count.player.dashCount,100);assert.equal(count.charges,3);
press(count);assert.equal(count.charges,2);assert.equal(count.player.paidDashUsed,true);
console.log('DASH_RESOURCES_PASS free=landing-refill-unlimited paidStock=3 paidPerLanding=1 airborneCombo=2 freeOnlyCycles=20 airRefillDoesNotReset=true wall/ceiling=noReset roomCarry=true respawnReset=true noTotalCountGate=true');
