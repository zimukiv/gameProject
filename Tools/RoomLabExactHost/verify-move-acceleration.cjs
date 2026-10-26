const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(process.argv[2], 'resources/app');
const M = require(path.join(app, 'src/project/model.cjs'));
const { Engine } = require(path.join(app, 'src/runtime/engine.cjs'));
const project = M.migrate(JSON.parse(fs.readFileSync(path.join(app, 'project.json'), 'utf8')));
const dt = 1 / 120, near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
function fixture(grounded = true) {
  const g = new Engine(project);
  for (const key of ['objects','movables','zones','exits']) g.room[key] = [];
  g.room.tiles = grounded ? Array.from({length:g.room.cols}, (_,x)=>({x,y:10})) : [];
  Object.assign(g.player, { x:160, y:grounded?320-g.player.h:160, vx:0, vy:0, grounded, support:grounded?'tile-5-10':null });
  return g;
}
for (const sign of [-1,1]) for (const grounded of [true,false]) {
  const g = fixture(grounded), input = sign>0?{right:true}:{left:true};
  for(let n=1;n<=12;n++) {
    g.update(dt,input);
    near(g.player.vx,sign*g.config.speed*n/12);
  }
  for(let n=0;n<12;n++){g.update(dt,input);near(g.player.vx,sign*g.config.speed);}
  g.update(dt,sign>0?{left:true}:{right:true});
  near(g.player.vx,-sign*g.config.speed/12);
  g.update(dt,{}); near(g.player.vx,0);
  g.update(dt,input);near(g.player.vx,sign*g.config.speed/12);
  g.update(dt,{left:true,right:true});near(g.player.vx,0);
}
const tap = fixture(), start = tap.player.x;
for(let n=0;n<6;n++)tap.update(dt,{right:true});
const distance = tap.player.x-start;
near(distance, tap.config.speed/12*21*dt);
assert.ok(distance<tap.config.speed*.05*.35, 'Short tap should move much less than instant full speed');
tap.update(dt,{});near(tap.player.x,start+distance);
const crouch = fixture();
for(let n=1;n<=12;n++){crouch.update(dt,{right:true,down:true});near(crouch.player.vx,crouch.config.speed*.45*n/12);}
const verticalJet = fixture(false);verticalJet.launchPlayer(0,-400);verticalJet.update(dt,{right:true});near(verticalJet.player.vx,verticalJet.config.speed/12);
const jet = fixture(false);jet.launchPlayer(300,-400);jet.update(dt,{left:true});near(jet.player.vx,255);
const dash = fixture(false);dash.update(dt,{right:true,dashPressed:true});near(dash.player.vx,dash.config.dashSpeed);
const ice = fixture();
const block=JSON.parse(JSON.stringify(project.courses.flatMap(c=>c.rooms).flatMap(r=>r.objects).find(o=>o.type==='physics.ice')));
Object.assign(block,{x:0,y:10,w:ice.room.cols,h:1,collision:true});block.params.meltAfter=100;
ice.room.tiles=[];ice.room.objects=[block];ice.objectStates.set(block.id,{solid:true,standing:0,respawnRemaining:1,generation:0});ice.player.support=block.id;
ice.update(dt,{right:true});near(ice.player.vx,430*dt);
ice.player.vx=100;ice.update(dt,{});near(ice.player.vx,100*Math.exp(-block.params.friction*dt));
console.log(`MOVE_ACCELERATION_PASS ramp=0.1s speed=${tap.config.speed} tap50ms=${distance.toFixed(3)}px previous=${(tap.config.speed*.05).toFixed(3)}px ground/air/left/right/reverse/release/crouch=pass dash/launch/ice=pass`);
