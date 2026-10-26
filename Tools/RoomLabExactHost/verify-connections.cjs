const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(process.argv[2],'resources/app');
const M=require(path.join(app,'src/project/model.cjs')),{Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const project=M.migrate(JSON.parse(fs.readFileSync(path.join(app,'project.json'),'utf8')));
assert.deepEqual(M.validate(project,{play:true}).errors,[]);
let changes=0,finishes=0;
for(const course of project.courses)for(const room of course.rooms)for(const exit of room.exits){
 const g=new Engine(project,course.id,room.id);
 const edge=course.connections.find(e=>e.from.roomId===room.id&&e.from.exitId===exit.id);
 Object.assign(g.player,{x:exit.x*32+1,y:exit.y*32+1,vx:0,vy:0,grounded:false,rail:null});g.exitCooldown=0;
 g.update(0);
 if(edge){assert.equal(g.room.id,edge.to.roomId,room.name);assert.equal(g.entry.id,edge.to.entryId);assert.equal(g.mode,'playing');assert.equal(g.respawnRemaining,0);changes++;}
 else{assert.equal(g.mode,'won',room.name);finishes++;}
}
console.log(`CONNECTIONS_PASS rooms=${project.courses.reduce((n,c)=>n+c.rooms.length,0)} roomChanges=${changes} finalExits=${finishes} respawnBufferOnNormalTransition=none`);
