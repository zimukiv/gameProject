// Transport-neutral relay. D1 compare-and-swap owns branch concurrency; R2 owns immutable chunks.
import {graphState,editGraph} from './graph-management.mjs';
const HASH = /^[a-f0-9]{64}$/;
const BRANCH = /^[\p{L}\p{N}_. /-]{1,100}$/u;
const MAX_CHUNK = 4 * 1024 * 1024;
const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : value && typeof value==='object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}' : JSON.stringify(value);
const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store'}});
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2,'0')).join('');
function fail(message, status = 400) { throw Object.assign(new Error(message), {status}); }
async function read(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > limit) { await reader.cancel(); fail('请求超过容量限制',413); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) {bytes.set(part,offset); offset += part.length;}
  return bytes;
}
async function json(request) {
  try { return JSON.parse(new TextDecoder().decode(await read(request,1024*1024))); }
  catch (e) { if (e.status) throw e; fail('JSON 格式错误'); }
}
function manifest(r) {
  if (!r || !HASH.test(r.id) || !HASH.test(r.fingerprint) || typeof r.message !== 'string' || r.message.length > 240 || typeof r.device !== 'string' || r.device.length > 100 || !Array.isArray(r.files) || !r.files.length || r.files.length > 1024) fail('版本信息无效');
  let total = 0; const paths = new Set();
  for (const f of r.files) {
    if (typeof f.path !== 'string' || !(f.path === 'project.json' || /^assets\/[\p{L}\p{N}_. /-]+$/u.test(f.path)) || f.path.includes('..') || paths.has(f.path) || !HASH.test(f.hash) || !Number.isSafeInteger(f.size) || f.size < 0 || !Array.isArray(f.chunks) || f.chunks.length > 32) fail('文件清单无效');
    paths.add(f.path); total += f.size; let size = 0;
    for (const c of f.chunks) { if (!HASH.test(c.hash) || !Number.isSafeInteger(c.size) || c.size < 1 || c.size > MAX_CHUNK) fail('分块信息无效'); size += c.size; }
    if (size !== f.size) fail('文件大小不符');
  }
  if (!paths.has('project.json') || total > 128*1024*1024) fail('项目大小超限',413);
}
export async function handle(request, env) {
  try {
    const url = new URL(request.url), route = url.pathname.replace(/^\/api\/room-sync\/?/,'');
    if (route === 'health' && request.method === 'GET') return reply({service:'room-lab-sync',protocol:1,storage:!!env.DB && !!env.BUCKET});
    const key = request.headers.get('X-Room-Workspace-Key') || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) fail('工作区密钥无效',401);
    const workspace = await sha(new TextEncoder().encode(key));
    if (!env.DB || !env.BUCKET) fail('存储尚未就绪',503);
    const prefix = workspace + '/';
    if(route==='live' && request.method==='POST') {
      const {device,channel,base,proposal} = await json(request),now=Date.now();
      if(!/^[a-zA-Z0-9_-]{8,80}$/.test(device||'') || !HASH.test(channel||'') || !Number.isSafeInteger(base) || base<0)fail('协作会话无效');
      await env.DB.prepare('INSERT INTO live_sessions(workspace,channel,device,seen) VALUES(?,?,?,?) ON CONFLICT(workspace,channel,device) DO UPDATE SET seen=excluded.seen').bind(workspace,channel,device,now).run();
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM live_sessions WHERE workspace=? AND channel=? AND seen>?').bind(workspace,channel,now-8000).first();
      let row=await env.DB.prepare('SELECT seq,data,updated_at FROM live_drafts WHERE workspace=? AND channel=?').bind(workspace,channel).first();
      if(row && row.updated_at<now-24*60*60*1000)row=null;
      if(count.n<2)return reply({online:false,peers:count.n,seq:row?.seq||0});
      if(proposal) {
        manifest(proposal);const unsigned={...proposal};delete unsigned.id;
        if(await sha(new TextEncoder().encode(canonical(unsigned)))!==proposal.id || await sha(new TextEncoder().encode(canonical(proposal.files)))!==proposal.fingerprint)fail('协作草稿校验失败');
        const hashes=[...new Set(proposal.files.flatMap(f=>f.chunks.map(c=>c.hash)))];if(hashes.length>512)fail('协作草稿分块超限');
        const present=new Map();for(let i=0;i<hashes.length;i+=80){const batch=hashes.slice(i,i+80);const rows=await env.DB.prepare('SELECT hash,size FROM chunks WHERE workspace=? AND hash IN ('+batch.map(()=>'?').join(',')+')').bind(workspace,...batch).all();for(const r of rows.results)present.set(r.hash,r.size);}
        if(proposal.files.some(f=>f.chunks.some(c=>present.get(c.hash)!==c.size)))fail('协作草稿缺少素材分块',422);
        if((row?.seq||0)===base) {
          if(!row){await env.DB.prepare('INSERT INTO live_drafts(workspace,channel,seq,data,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(workspace,channel) DO UPDATE SET seq=live_drafts.seq+1,data=excluded.data,updated_at=excluded.updated_at WHERE live_drafts.updated_at<?').bind(workspace,channel,JSON.stringify(proposal),now,now-24*60*60*1000).run();}
          else await env.DB.prepare('UPDATE live_drafts SET seq=seq+1,data=?,updated_at=? WHERE workspace=? AND channel=? AND seq=?').bind(JSON.stringify(proposal),now,workspace,channel,base).run();
          row=await env.DB.prepare('SELECT seq,data,updated_at FROM live_drafts WHERE workspace=? AND channel=?').bind(workspace,channel).first();
        }
      }
      return reply({online:true,peers:count.n,seq:row?.seq||0,revision:row?JSON.parse(row.data):null});
    }
    if (route === 'state' && request.method === 'GET') {
      const branches = await env.DB.prepare('SELECT name, head, updated_at AS updatedAt FROM branches WHERE workspace = ? ORDER BY updated_at DESC LIMIT 200').bind(workspace).all();
      const revisions = await env.DB.prepare('SELECT id, data FROM revisions WHERE workspace = ? ORDER BY created_at DESC LIMIT 100').bind(workspace).all();
      const graph=await graphState(env.DB,workspace),deleted=new Set(graph.metadata.filter(r=>r.deletedAt).map(r=>r.id));
      return reply({branches:branches.results.filter(b=>!deleted.has(b.head)),revisions:revisions.results.map(x=>JSON.parse(x.data)),graph});
    }
    if (route === 'graph/edit' && request.method === 'POST') return reply(await editGraph(env.DB,workspace,await json(request)));
    if (route === 'missing' && request.method === 'POST') {
      const {hashes} = await json(request);
      if (!Array.isArray(hashes) || hashes.length > 32 || hashes.some(h=>!HASH.test(h))) fail('散列列表无效');
      if (!hashes.length) return reply({missing:[]});
      const rows = await env.DB.prepare('SELECT hash FROM chunks WHERE workspace = ? AND hash IN ('+hashes.map(()=>'?').join(',')+')').bind(workspace,...hashes).all();
      const present = new Set(rows.results.map(x=>x.hash));
      const missing = hashes.filter(h=>!present.has(h));
      return reply({missing});
    }
    if (route.startsWith('chunks/')) {
      const hash = route.slice(7); if (!HASH.test(hash)) fail('散列无效');
      if (request.method === 'PUT') {
        const bytes = await read(request,MAX_CHUNK);
        if (await sha(bytes) !== hash) fail('分块校验失败');
        await env.BUCKET.put(prefix+hash,bytes);
        await env.DB.prepare('INSERT OR IGNORE INTO chunks(workspace,hash,size) VALUES(?,?,?)').bind(workspace,hash,bytes.length).run();
        return reply({ok:true});
      }
      if (request.method === 'GET') {
        const blob = await env.BUCKET.get(prefix+hash); if (!blob) fail('文件分块不存在',404);
        return new Response(blob.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
      }
    }
    if (route.startsWith('revisions/') && request.method === 'GET') {
      const id = route.slice(10); if (!HASH.test(id)) fail('版本 ID 无效');
      const row = await env.DB.prepare('SELECT data FROM revisions WHERE workspace = ? AND id = ?').bind(workspace,id).first();
      if (!row) fail('版本不存在',404); return reply(JSON.parse(row.data));
    }
    if (route === 'commit' && request.method === 'POST') {
      const {branch,base,revision:r} = await json(request);
      if (!BRANCH.test(branch || '') || (base !== null && !HASH.test(base))) fail('分支或基准版本无效');
      manifest(r);
      if(r.parent!==null&&!HASH.test(r.parent||''))fail('来源版本无效');
      if(r.parent){
        // Older clients can upload a saved version whose source exists only locally.
        // Explicit parent selections are verified by the editor before creating the child.
        const removed=await env.DB.prepare('SELECT deleted_at FROM node_metadata WHERE workspace=? AND revision_id=?').bind(workspace,r.parent).first();
        if(removed?.deleted_at)fail('来源节点已删除，请刷新并选择其他父节点',409);
      }
      const unsigned = {...r};delete unsigned.id;
      if (await sha(new TextEncoder().encode(canonical(unsigned))) !== r.id) fail('版本校验失败');
      if (await sha(new TextEncoder().encode(canonical(r.files))) !== r.fingerprint) fail('文件清单校验失败');
      const hashes = [...new Set(r.files.flatMap(f=>f.chunks.map(c=>c.hash)))];
      if (hashes.length > 512) fail('项目分块过多');
      const present = new Map();
      for (let i=0;i<hashes.length;i+=80) {
        const batch=hashes.slice(i,i+80);
        const rows=await env.DB.prepare('SELECT hash,size FROM chunks WHERE workspace = ? AND hash IN ('+batch.map(()=>'?').join(',')+')').bind(workspace,...batch).all();
        for(const row of rows.results)present.set(row.hash,row.size);
      }
      if(r.files.some(f=>f.chunks.some(c=>present.get(c.hash)!==c.size))) fail('请先上传完整文件分块',422);
      const now = Date.now();
      const results = await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO revisions(workspace,id,data,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM node_metadata WHERE workspace=? AND revision_id=? AND deleted_at IS NOT NULL)').bind(workspace,r.id,JSON.stringify(r),now,workspace,r.parent),
        env.DB.prepare('INSERT OR IGNORE INTO branches(workspace,name,head,updated_at) SELECT ?,?,NULL,? WHERE NOT EXISTS(SELECT 1 FROM node_metadata WHERE workspace=? AND revision_id=? AND deleted_at IS NOT NULL)').bind(workspace,branch,now,workspace,r.parent),
        env.DB.prepare('UPDATE branches SET head = ?, updated_at = ? WHERE workspace = ? AND name = ? AND head IS ? AND NOT EXISTS(SELECT 1 FROM node_metadata WHERE workspace=? AND revision_id=? AND deleted_at IS NOT NULL)').bind(r.id,now,workspace,branch,base,workspace,r.parent),
        // Commits also advance the graph generation: a concurrent edit must re-plan children.
        env.DB.prepare('INSERT INTO workspace_graph(workspace,generation,operation_id) VALUES(?,1,?) ON CONFLICT(workspace) DO UPDATE SET generation=generation+1,operation_id=excluded.operation_id').bind(workspace,crypto.randomUUID()),
      ]);
      if (results[2].meta.changes !== 1) {
        const row = await env.DB.prepare('SELECT head FROM branches WHERE workspace = ? AND name = ?').bind(workspace,branch).first();
        if (row?.head === r.id) return reply({ok:true,head:r.id});
        return reply({error:'云端分支已被另一端更新',head:row?.head || null},409);
      }
      return reply({ok:true,head:r.id});
    }
    return reply({error:'接口不存在'},404);
  } catch(e) { return reply({error:e.status ? e.message : '云端存储暂时不可用'},e.status || 500); }
}
