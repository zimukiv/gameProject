import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, parseWorkspaceKey, makeZip } from '../lib/library.mjs';
test('full connection keys are restricted to this site and only return the workspace secret',()=>{
 const key='a'.repeat(43),origin='https://example.chatgpt.site';
 const full='rlsync1.'+Buffer.from(JSON.stringify({endpoint:origin,workspaceKey:key,accessToken:'unused-browser-token'})).toString('base64url');
 assert.equal(parseWorkspaceKey(full,origin),key);
 assert.throws(()=>parseWorkspaceKey(full,'https://other.chatgpt.site'),/对应|网站/);
 assert.throws(()=>parseWorkspaceKey('rlsync1.bnVsbA',origin),/密钥/);
});
test('versions form a graph by immutable parent, branch aliases share nodes, unavailable ancestors remain visible',()=>{
 const state={branches:[{name:'main',head:'a'},{name:'copy',head:'a'},{name:'child',head:'b'}],revisions:[{id:'a',parent:null,message:'root',createdAt:1},{id:'b',parent:'a',message:'child',createdAt:2},{id:'c',parent:'missing',createdAt:3}]};
 const graph=buildGraph(state);assert.equal(graph.nodes.find(n=>n.id==='a').branches.length,2);
 assert.equal(graph.nodes.find(n=>n.id==='missing').missing,true);
 assert.ok(graph.edges.some(e=>e.from==='a'&&e.to==='b'));
 assert.equal(new Set(graph.nodes.map(n=>n.x+','+n.y)).size,graph.nodes.length);
});
test('damaged cyclic metadata cannot hang the preview',()=>{
 const g=buildGraph({branches:[],revisions:[{id:'a',parent:'b'},{id:'b',parent:'a'}]});assert.equal(g.nodes.length,2);assert.ok(g.width>0);
});
test('download ZIP preserves UTF8 filenames, bytes, and rejects paths outside project assets',async()=>{
 const unzipSync=bytes=>{const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result={};let at=0;while(view.getUint32(at,true)===0x04034b50){assert.equal(view.getUint16(at+8,true),0);assert.ok(view.getUint16(at+6,true)&0x800);const size=view.getUint32(at+18,true),len=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),name=new TextDecoder().decode(bytes.subarray(at+30,at+30+len)),start=at+30+len+extra;result[name]=bytes.slice(start,start+size);at=start+size;}assert.equal(view.getUint32(at,true),0x02014b50);return result;};
 const files=[['project.json',new TextEncoder().encode('{"name":"物理"}')],['assets/美术.svg',new Uint8Array([1,2,3])]];
 const zip=makeZip(files),unpacked=unzipSync(zip);
 assert.deepEqual([...unpacked['assets/美术.svg']],[1,2,3]);assert.equal(new TextDecoder().decode(unpacked['project.json']),'{'+'"name":"物理"}');
 assert.throws(()=>makeZip([['../bad',new Uint8Array([1])]]),/路径/);
});
