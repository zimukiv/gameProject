'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(process.argv[2],'resources/app');
const M=require(path.join(app,'src/project/model.cjs')),{Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const {InputSteps}=require(path.join(app,'src/runtime/input-steps.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8'))),dt=1/120;
function fixture(){
 const g=new Engine(project);
 for(const key of ['tiles','objects','movables','zones','exits'])g.room[key]=[];
 Object.assign(g.player,{x:320,y:160,vx:0,vy:0,grounded:false,support:null});
 return g;
}
const sample=(input={},time=dt)=>({dt:time,input});
const presses=[sample({right:true,dashPressed:true}),sample({right:true}),sample({right:true,dashPressed:true})];
// Reproduce the shipped Unity edgeDash |= WasPressed collapse during a pending frame.
const old=fixture();let edgeDash=false;
for(const s of presses)edgeDash ||= !!s.input.dashPressed;
for(let i=0;i<3;i++)old.update(dt,{right:true,dashPressed:i===0&&edgeDash});
assert.equal(old.player.dashCount,1);assert.equal(old.charges,3);
console.log('OLD_INPUT_REPRODUCED presses=2 delivered=1 charges=3');
// The old renderer also restored dashPressed from c.input on every substep
// after clearing edges. A single press therefore spent BOTH allowances.
const repeated=fixture(),heldPress={right:true,dashPressed:true};let oldEdges={dashPressed:true};
for(let i=0;i<6;i++){repeated.update(dt,{...heldPress,...oldEdges});oldEdges={};}
assert.equal(repeated.player.dashCount,2);assert.equal(repeated.charges,2);
repeated.update(dt,{right:true,dashPressed:true});assert.equal(repeated.player.dashCount,2);
console.log('OLD_RENDERER_REPRODUCED presses=1 dashes=2 secondPress=blocked charges=2');
const single=fixture(),singleSteps=new InputSteps();
singleSteps.advance(single,{dt:.05,input:heldPress});
assert.equal(single.player.dashCount,1);assert.equal(single.charges,3);assert.equal(single.player.paidDashUsed,false);
singleSteps.advance(single,{dt:.05,input:{right:true}});
singleSteps.advance(single,{dt:.05,input:heldPress});
assert.equal(single.player.dashCount,2);assert.equal(single.charges,2);
assert.equal(single.player.paidDashUsed,true);
console.log('SINGLE_PRESS_PASS firstPress=free stock=3 secondPress=paid stock=2');
for(const gap of [0,.05,.15,.25,.35]){
 for(const reverse of [false,true]){
  const g=fixture(),steps=new InputSteps();
  const waiting=Array.from({length:Math.round(gap/dt)},()=>sample({right:true}));
  steps.advance(g,{samples:[sample({right:true,dashPressed:true}),...waiting,sample({left:reverse,right:!reverse,dashPressed:true})]});
  assert.equal(g.player.grounded,false);assert.equal(g.player.dashCount,2);assert.equal(g.charges,2);
  assert.equal(g.player.paidDashUsed,true);assert.equal(g.player.dashX,reverse?-1:1);
  steps.advance(g,{samples:[sample({right:true,dashPressed:true})]});
  assert.equal(g.player.dashCount,2);assert.equal(g.charges,2);
 }
}
// Two presses can also precede a single fixed step, even across TCP commands.
for(const batch of [true,false]){
 const g=fixture(),steps=new InputSteps(),tiny=[sample({right:true,dashPressed:true},.001),sample({},.001),sample({left:true,dashPressed:true},.001)];
 if(batch)steps.advance(g,{samples:tiny});else for(const s of tiny)steps.advance(g,s);
 assert.equal(g.player.dashCount,0);
 steps.advance(g,sample({},dt*2));
 assert.equal(g.player.dashCount,2);assert.equal(g.charges,2);assert.equal(g.player.dashX,-1);
}
// Reset must drop buffered actions on pause, retry and room changes.
const paused=fixture(),steps=new InputSteps();
steps.advance(paused,sample({dashPressed:true},.001));paused.togglePause();steps.advance(paused,{});paused.togglePause();
steps.advance(paused,sample({},dt));assert.equal(paused.player.dashCount,0);
paused.respawnRemaining=.5;
steps.advance(paused,{samples:Array.from({length:61},()=>sample({dashPressed:true}))});
assert.equal(paused.player.dashCount,1,'Only a new press after the 60 frozen ticks may dash');
const frozen=fixture(),freezeSteps=new InputSteps();frozen.respawnRemaining=.5;
freezeSteps.advance(frozen,{samples:[sample({dashPressed:true},.001),sample({},dt*60)]});
for(let i=0;i<70;i++)freezeSteps.advance(frozen,sample());
assert.equal(frozen.player.dashCount,0,'A press during respawn leaked into play');
console.log('DASH_INPUT_PASS batchedPresses=2 paidConsumed=1 thirdBlocked=true gaps=0/50/150/250/350ms reverse=true substepQueue=true pauseClear=true respawnDiscard=true');
