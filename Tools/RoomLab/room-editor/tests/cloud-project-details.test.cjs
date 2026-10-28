'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/cloud/codec.cjs'),M=require('../src/project/model.cjs'),{Remote}=require('../src/cloud/connection.cjs'),Seeds=require('../src/assets/seeds.cjs');
test('cloud room details verify the revision and fetch only project metadata chunks, including old revisions',async()=>{
 const p=M.example(),seed=Seeds.seeds();p.assets=seed.assets;p.courses[0].artBindings=seed.bindings;const s=C.encode(p,seed.files);
 for(const legacy of [false,true]){
  const r=C.revision(s,'device','save');if(legacy){delete r.summary;delete r.id;r.id=C.hash(C.canonical(r));}const calls=[];
  const remote=new Remote({endpoint:'https://test.chatgpt.site',workspaceKey:'a'.repeat(43),accessToken:'test-token'},async url=>{const route=url.split('/api/room-sync/')[1];calls.push(route);return route.startsWith('revisions/')?Response.json(r):new Response(s.chunks.get(route.slice(7)));});
  const result=await remote.readProject(r.id);assert.equal(result.project.name,p.name);assert.equal(result.project.courses[0].rooms.length,3);
  assert.deepEqual(calls.filter(x=>x.startsWith('chunks/')).map(x=>x.slice(7)),r.files.find(f=>f.path==='project.json').chunks.map(c=>c.hash));
 }
});
test('tampered cloud metadata is rejected before display',async()=>{
 const s=C.encode(M.example(),new Map()),r=C.revision(s,'device','save');r.message='tampered';const remote=new Remote({endpoint:'https://test.chatgpt.site',workspaceKey:'a'.repeat(43),accessToken:'test-token'},async()=>Response.json(r));await assert.rejects(remote.readProject(r.id),/校验失败/);
});
