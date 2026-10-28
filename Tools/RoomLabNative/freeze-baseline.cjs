'use strict';
// P0 offline reference generator. This tool is never included in the native player.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'Validation/Native');
const reference=path.resolve(process.env.ROOMLAB_REFERENCE_ROOT||path.join(root,'../.project-backups/roomlab255-reference-a0ecb6a'));
const editor=path.resolve(process.env.ROOMLAB_EDITOR_ROOT||path.join(root,'../room-editor'));
const app=path.join(reference,'Tools/RoomLabRuntimeApp'),commit='a0ecb6aa4517f14afaa2e32c825fdc71b0d246b6';
const check=process.argv.includes('--check'),outputs=new Map();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
const bytes=rel=>fs.readFileSync(path.join(reference,rel));
const json=(rel,v)=>outputs.set(rel,Buffer.from(JSON.stringify(v,null,2)+'\n'));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]).sort();}
// Freeze dates and generated node IDs only inside this dedicated offline process.
const RealDate=Date,fixed=Date.UTC(2026,9,26,0,0,0);let seed=255;
global.Date=class extends RealDate{constructor(...v){super(...(v.length?v:[fixed]));}static now(){return fixed;}};
Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
assert.equal(JSON.parse(fs.readFileSync(path.join(editor,'package.json'))).version,'2.5.5');
// Freeze the actual editor modules used to author and validate export fixtures, not
// just the public version string: local edits can keep package.version unchanged.
const editorPaths=[
 'package.json','src/project/model.cjs','src/project/compatibility.cjs',
 'src/project/collision.cjs','src/project/jet-params.cjs','src/plugins/registry.cjs',
 'src/plugins/physics/rail.cjs','src/plugins/common.cjs','src/project/archive.cjs',
 'src/project/performance.cjs','src/project/play-camera.cjs',
 'src/project/temperature.cjs','src/project/rail-nodes.cjs',
];
const fflateEntry=require.resolve('fflate',{paths:[editor]});
const fflatePackage=path.resolve(path.dirname(fflateEntry),'../package.json');
for(const file of [fflateEntry,fflatePackage])editorPaths.push(path.relative(editor,file).split(path.sep).join('/'));
const editorSources=[...new Set(editorPaths)].sort().map(rel=>{const raw=fs.readFileSync(path.join(editor,rel));return {path:rel,sha256:hash(raw),bytes:raw.length};});
if(check){
 const frozen=JSON.parse(fs.readFileSync(path.join(out,'baseline-manifest.json'),'utf8'));
 assert.ok(Array.isArray(frozen.editorSources),'Frozen editorSources missing; explicitly regenerate reviewed baseline');
 assert.deepEqual(editorSources,frozen.editorSources,'Editor source identity changed (paths and SHA256); review before regenerating baseline');
}
const M=require(path.join(app,'src/project/model.cjs'));
const {Engine}=require(path.join(app,'src/runtime/engine.cjs'));
const sourceBytes=execFileSync('git',['show',commit+':Tools/RoomLabRuntimeApp/project.json'],{cwd:root,maxBuffer:8*1024*1024}),source=JSON.parse(sourceBytes),project=M.migrate(source);
assert.deepEqual(M.validate(project,{play:true}),{errors:[],warnings:[]});
// Verify the supposedly clean extracted reference against Git, not against its directory name.
const oracleFiles=[path.join(app,'project.json'),...walk(path.join(app,'src')).filter(f=>f.endsWith('.cjs')),...walk(path.join(app,'assets'))];
const sources=[];
for(const file of oracleFiles){
 const rel=path.relative(reference,file).split(path.sep).join('/'),raw=fs.readFileSync(file);
 const committed=execFileSync('git',['show',commit+':'+rel],{cwd:root,maxBuffer:8*1024*1024});
 // git archive respected the local autocrlf setting; normalize text line endings for
 // semantic-source identity while retaining both raw and canonical byte hashes.
 assert.equal(raw.toString('utf8').replaceAll('\r\n','\n'),committed.toString('utf8').replaceAll('\r\n','\n'),'Reference differs from committed source: '+rel);
 sources.push({path:rel,sha256:hash(committed),bytes:committed.length,extractedRawSha256:hash(raw),extractedRawBytes:raw.length});
}
outputs.set('Fixtures/ddl13-custom-original.json',sourceBytes);
for(const asset of source.assets)outputs.set('Fixtures/'+asset.path,fs.readFileSync(path.join(app,asset.path)));
const courses=source.courses,rooms=courses.flatMap(c=>c.rooms),objects=rooms.flatMap(r=>r.objects);
const counts={courses:courses.length,rooms:rooms.length,connections:courses.reduce((n,c)=>n+c.connections.length,0),tiles:rooms.reduce((n,r)=>n+r.tiles.length,0),objects:objects.length,movables:rooms.reduce((n,r)=>n+r.movables.length,0),checkpoints:objects.filter(o=>o.type==='common.checkpoint').length,spikes:objects.filter(o=>o.type==='common.spike').length,assets:source.assets.length};
assert.equal(counts.rooms,11);assert.equal(counts.connections,10);assert.equal(counts.checkpoints,7);assert.equal(counts.spikes,214);assert.equal(counts.assets,9);
const EditorM=require(path.join(editor,'src/project/model.cjs')),EditorR=require(path.join(editor,'src/plugins/registry.cjs')),EditorA=require(path.join(editor,'src/project/archive.cjs'));
const editorFixture=EditorM.example(),er=editorFixture.courses[0].rooms[0];
er.objects.push(EditorR.instantiate(editorFixture,'common.checkpoint','p0-solid-checkpoint',5,12));
const rail=EditorR.instantiate(editorFixture,'physics.rail','p0-side-rail',9,12);rail.params.sideTrigger=true;er.objects.push(rail);
const jet=EditorR.instantiate(editorFixture,'physics.jet','p0-left-jet',12,12);jet.params.direction='left';jet.params.force=700;er.objects.push(jet);
const editorZip=Buffer.from(EditorA.pack(editorFixture,new Map())),unpacked=EditorA.unpack(editorZip).project;
assert.equal(unpacked.compatibility.runtime,'2.5.5');assert.equal(unpacked.pluginManifest['physics.rail'],'2.0.0');
assert.equal(unpacked.courses[0].rooms[0].objects.find(o=>o.id===jet.id).params.launchX,-700);
json('Fixtures/editor255-export.json',unpacked);outputs.set('Fixtures/editor255-export.zip',editorZip);
const legacy=M.example();delete legacy.compatibility;
json('Fixtures/legacy252-project.json',legacy);
const friend=clone(legacy);friend.courses[0].rooms[0].objects.push({id:'p0-old-checkpoint',type:'common.checkpoint',x:5,y:12,w:1,h:1,collision:false,params:{}});
json('Fixtures/friend252-project.json',friend);
const unknown=clone(unpacked);unknown.pluginManifest['physics.rail']='9.0.0';json('Fixtures/unknown-major.json',unknown);
outputs.set('Fixtures/truncated.zip',editorZip.subarray(0,Math.floor(editorZip.length/2)));
const corrupt=Buffer.from(editorZip);let crcPatched=false;
for(let i=0;i+46<corrupt.length;i++)if(corrupt.readUInt32LE(i)===0x02014b50){corrupt[i+16]^=0xff;crcPatched=true;break;}
assert.ok(crcPatched);outputs.set('Fixtures/corrupt.zip',corrupt);
const EF=require(require.resolve('fflate',{paths:[editor]}));
const oversized=Buffer.from(EF.zipSync({'project.json':EF.strToU8(JSON.stringify(unpacked))},{level:0}));
for(let i=0;i+46<oversized.length;i++)if(oversized.readUInt32LE(i)===0x02014b50){oversized.writeUInt32LE(26*1024*1024,i+24);break;}
outputs.set('Fixtures/oversized-declared.zip',oversized);
const manifest={format:1,referenceCommit:commit,sourceProjectSha256:hash(sourceBytes),oracle:'clean committed JS Engine; offline reference only, not native acceptance',editorVersion:'2.5.5',editorSources,fixedStep:1/120,counts,settings:source.settings,pluginManifest:source.pluginManifest,rooms:rooms.map(r=>({id:r.id,name:r.name,cols:r.cols,rows:r.rows,tiles:r.tiles.length,objects:r.objects.length,checkpoints:r.objects.filter(o=>o.type==='common.checkpoint').length,playCamera:r.playCamera||{mode:'room'}})),assets:source.assets.map(a=>({id:a.id,path:a.path,mime:a.mime,sha256:hash(fs.readFileSync(path.join(app,a.path)))})),sources};
json('baseline-manifest.json',manifest);

const dt=1/120,traces=[];
function fixture(name,{ground=true,air=false}={}){
 const p=M.example();p.assets=[];p.settings=clone(source.settings);p.blockDefaults={};p.pluginManifest={};
 const c=p.courses[0],r=c.rooms[0];c.rooms=[r];c.connections=[];r.id='p0-'+name;r.name=name;r.entries=[{id:r.id+'-entry',x:5,y:9,face:1}];
 r.objects=[];r.movables=[];r.zones=[];r.exits=[];r.tiles=ground?Array.from({length:r.cols},(_,x)=>({x,y:10})):[];
 const setup={player:{x:160,y:air?160:292,vx:0,vy:0,grounded:ground&&!air,support:ground&&!air?'tile-5-10':null}};
 return {p,c,r,setup};
}
// Engine.snapshot() copies the map container but retains mutable object-state and
// nested AI references. Detach at observation time, before the next simulation tick.
// Otherwise an old frame can silently acquire the final tick's cooldown/used state.
function snap(g){const s=clone(g.snapshot());delete s.events;return s;}
function runCase(name,p,roomId,setup,ops,assertion){
 const c=p.courses.find(c=>c.rooms.some(r=>r.id===roomId)),g=new Engine(p,c.id,roomId);
 if(setup.game)Object.assign(g,clone(setup.game));if(setup.player)Object.assign(g.player,clone(setup.player));
 const objectSnapshots=[],objectIds=new Map(),objectKeys=[],captureHashes=[];
 function capture(){const s=snap(g),key=JSON.stringify(s.objects);if(!objectIds.has(key)){objectIds.set(key,objectSnapshots.length);objectSnapshots.push(s.objects);objectKeys.push(key);}s.objectStatesRef=objectIds.get(key);delete s.objects;captureHashes.push([s,JSON.stringify(s)]);return s;}
 const initial=capture(),frames=[];let index=0;
 for(const op of ops){
  const eventAt=g.events.length;
  if(op.op==='tick')g.update(op.dt??dt,op.input||{});
  else if(op.op==='retry')g.retry();
  else if(op.op==='pause')g.togglePause();
  else if(op.op==='launch')g.launchPlayer(op.x,op.y);
  else if(op.op==='startRail')g.startRail(g.room.objects.find(o=>o.id===op.id));
  else if(op.op==='patch'){if(op.game)Object.assign(g,clone(op.game));if(op.player)Object.assign(g.player,clone(op.player));}
  else throw Error('Unknown op '+op.op);
  frames.push({index:index++,...op,expected:capture(),events:clone(g.events.slice(eventAt))});
 }
 assertion?.(g,frames);
 // Regression guard: later ticks must not rewrite any already captured observation.
 objectSnapshots.forEach((s,i)=>assert.equal(JSON.stringify(s),objectKeys[i],name+': object snapshot mutated after capture'));
 captureHashes.forEach(([s,key])=>assert.equal(JSON.stringify(s),key,name+': frame snapshot mutated after capture'));
 const projectFile='Scenarios/'+name+'.project.json';json(projectFile,p);
 const trace={format:1,name,project:projectFile,courseId:c.id,roomId,setup,fixedStep:dt,tolerance:{positionPx:0.001,velocity:0.001,timeSeconds:0.00001,events:'same ordered semantic events'},objectSnapshots,initial,frames};
 json('Traces/'+name+'.json',trace);traces.push({name,project:projectFile,trace:'Traces/'+name+'.json',operations:frames.length,description:setup.description||name});
}
const ticks=(n,input={})=>Array.from({length:n},()=>({op:'tick',dt,input}));
runCase('actual-room-enter',project,project.courses[0].rooms[0].id,{description:'Untouched default entry and initial gravity/landing'},ticks(60),g=>assert.equal(g.respawnRemaining,0));
{
 const f=fixture('movement');runCase('movement',f.p,f.r.id,f.setup,[...ticks(6,{right:true}),...ticks(1),...ticks(12,{left:true}),...ticks(1),...ticks(12,{right:true})],(g,frames)=>{assert.ok(frames[5].expected.player.x-160<4);assert.equal(frames[6].expected.player.vx,0);assert.equal(g.player.vx,220);});
}
{
 const f=fixture('jump-coyote',{ground:false,air:true});f.setup.player.coyote=.1;
 runCase('jump-coyote',f.p,f.r.id,f.setup,[{op:'tick',input:{jumpPressed:true,up:true}},...ticks(24,{up:true})],(g,frames)=>assert.ok(frames[0].events.some(e=>e.type==='jump')));
}
{
 const f=fixture('jump-buffer',{air:true});f.setup.player={...f.setup.player,y:282,vy:180,grounded:false,support:null};
 runCase('jump-buffer',f.p,f.r.id,f.setup,[{op:'tick',input:{jumpPressed:true,up:true}},...ticks(18,{up:true})],(g,frames)=>assert.ok(frames.some(s=>s.events.some(e=>e.type==='jump'))));
}
{
 const f=fixture('dash-and-land',{air:true});
 runCase('dash-and-land',f.p,f.r.id,f.setup,[{op:'tick',input:{right:true,dashPressed:true}},{op:'tick',input:{left:true,dashPressed:true}},{op:'tick',input:{right:true,dashPressed:true}},{op:'patch',player:{x:160,y:291,vx:0,vy:240,dash:0,grounded:false,support:null,launched:false,rail:null}},...ticks(1),{op:'tick',input:{right:true,dashPressed:true}}],(g,frames)=>{assert.equal(frames[2].expected.charges,2);assert.equal(frames[4].expected.player.freeDash,true);assert.equal(g.charges,2);});
}
{
 const f=fixture('jet-launch',{ground:false,air:true});
 runCase('jet-launch',f.p,f.r.id,f.setup,[{op:'launch',x:300,y:-400},...ticks(24,{left:true})],(g,frames)=>{assert.equal(frames[1].expected.player.vx,255);assert.ok(frames[1].expected.player.vy<0);});
}
{
 const c=project.courses[0],r=c.rooms[0],jet=r.objects.find(o=>o.type==='physics.jet');
 runCase('actual-jet-trigger',project,r.id,{player:{x:jet.x*32+4,y:jet.y*32-28,vx:0,vy:0,grounded:true,support:jet.id},description:'Top contact with the real authored jet; onTrigger dispatch, not direct launch only'},ticks(24),g=>assert.ok(g.events.some(e=>e.type==='jet'&&e.id===jet.id)));
}
{
 const f=fixture('respawn-buffer');
 runCase('respawn-buffer',f.p,f.r.id,f.setup,[{op:'retry'},...ticks(12,{jumpPressed:true,dashPressed:true}),{op:'pause'},...ticks(5,{right:true}),{op:'pause'},...ticks(48,{jumpPressed:true,dashPressed:true}),...ticks(1)],(g,frames)=>{assert.equal(g.respawnRemaining,0);assert.equal(g.player.dashCount,0);assert.equal(g.deaths,1);assert.ok(Math.abs(g.elapsed-dt)<1e-8);});
}
{
 const c=project.courses[0],r=c.rooms.find(r=>r.name==='AI追逐1'),rail=r.objects.find(o=>o.id==='block-mvnhknt8-r0nu6l');
 const tmp=new Engine(project,c.id,r.id);tmp.startRail(tmp.room.objects.find(o=>o.id===rail.id));let n=0;while(tmp.player.rail&&n++<1000)tmp.update(dt);
 runCase('actual-rail-pickups',project,r.id,{game:{charges:2,recharge:9},description:'Actual AI追逐1 multi-segment rail and two authored token IDs'},[{op:'startRail',id:rail.id},...ticks(n)],g=>{assert.equal(g.tokens,2);assert.equal(g.charges,3);assert.equal(g.recharge,1);assert.equal(g.score,200);assert.equal(g.player.rail,null);});
}
for(const c of project.courses)for(const r of c.rooms)for(const flag of r.objects.filter(o=>o.type==='common.checkpoint')){
 runCase('checkpoint-'+flag.id,project,r.id,{game:{tokens:17,charges:2,recharge:7,score:1234},player:{x:flag.x*32+4,y:flag.y*32+4,face:-1,invulnerable:1},description:'Actual contact with '+r.name+'/'+flag.id+' followed by resource mutation and retry'},[{op:'tick',dt:0,input:{}},{op:'patch',game:{tokens:0,charges:0,recharge:0,score:0}},{op:'retry'},...ticks(60,{dashPressed:true,jumpPressed:true})],g=>{assert.equal(g.checkpoint.id,flag.id);assert.equal(g.tokens,17);assert.equal(g.charges,2);assert.equal(g.recharge,7);assert.equal(g.score,1234);assert.equal(g.respawnRemaining,0);});
}
json('trace-index.json',{format:1,referenceCommit:commit,fixedStep:dt,totalCases:traces.length,totalOperations:traces.reduce((n,t)=>n+t.operations,0),cases:traces});
const fileHashes=[...outputs].sort(([a],[b])=>a.localeCompare(b)).map(([file,b])=>({file,sha256:hash(b),bytes:b.length}));
json('frozen-files.json',{format:1,files:fileHashes});
let failures=0;
for(const [rel,raw] of outputs){const file=path.join(out,rel);if(check){if(!fs.existsSync(file)||!fs.readFileSync(file).equals(raw)){console.error('MISMATCH '+rel);failures++;}}else if(!fs.existsSync(file)||!fs.readFileSync(file).equals(raw)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,raw);}}
if(failures){console.error('P0_CHECK_FAIL mismatches='+failures);process.exitCode=1;}else console.log((check?'P0_CHECK_PASS':'P0_GENERATE_PASS')+' files='+outputs.size+' oracleFiles='+sources.length+' cases='+traces.length+' operations='+traces.reduce((n,t)=>n+t.operations,0)+' counts='+JSON.stringify(counts));
