// Browser-only library operations; connection credentials never enter URLs or storage.
export function parseWorkspaceKey(text, origin) {
  let value=text.trim();
  if(value.startsWith('rlsync1.')) {
    let c;try { c=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.slice(8).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)))); } catch {throw Error('连接密钥格式不完整，请重新复制。');}
    if(!c || typeof c!=='object' || typeof c.endpoint!=='string')throw Error('连接密钥内容无效。');
    let endpoint;try{endpoint=new URL(c.endpoint).origin;}catch{throw Error('连接密钥地址无效。');}
    if(endpoint!==origin)throw Error('此密钥对应另一个网站，请到对应网站使用。');
    value=c.workspaceKey;
  }
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('工作区密钥无效，请粘贴完整连接密钥或 43 位工作区密钥。');
  return value;
}
export function buildGraph(state) {
  const meta=new Map((state.graph?.metadata||[]).map(r=>[r.id,r])), deleted=new Set([...meta.values()].filter(r=>r.deletedAt).map(r=>r.id));
  const all=new Map((state.revisions||[]).filter(r=>!deleted.has(r.id)).map(r=>[r.id,{...r,originalParent:r.parent||null,branches:[],parent:meta.has(r.id)?meta.get(r.id).parentId:r.parent||null}]));
  for(const b of state.branches||[])if(b.head&&!deleted.has(b.head)){if(!all.has(b.head))all.set(b.head,{id:b.head,parent:meta.get(b.head)?.parentId||null,missing:true,branches:[],createdAt:b.updatedAt});all.get(b.head).branches.push(b.name);}
  for(const n of all.values())if(deleted.has(n.parent))n.parent=null;
  for(const n of [...all.values()])if(n.parent&&!all.has(n.parent))all.set(n.parent,{id:n.parent,parent:null,missing:true,branches:[]});
  for(const n of all.values()) {
    const seen=new Set([n.id]);let p=n.parent;
    while(p&&all.has(p)){if(seen.has(p)){n.parent=null;break;}seen.add(p);p=all.get(p).parent;}
  }
  const children=new Map();for(const n of all.values()){const k=n.parent||null;if(!children.has(k))children.set(k,[]);children.get(k).push(n);}
  for(const list of children.values())list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id));
  let row=0;const nodes=[],edges=[];
  function place(n,depth){const kids=children.get(n.id)||[],start=row;if(kids.length)kids.forEach(k=>place(k,depth+1));else row++;n.x=48+depth*286;n.y=48+(kids.length?(start+row-1)/2:row-1)*158;nodes.push(n);if(n.parent)edges.push({from:n.parent,to:n.id});}
  (children.get(null)||[]).forEach(n=>place(n,0));
  return {nodes,edges,width:Math.max(620,...nodes.map(n=>n.x+282)),height:Math.max(360,...nodes.map(n=>n.y+178))};
}
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function makeZip(files) {
  const parts=[],central=[];let offset=0,centralSize=0;
  for(const [name,data]of files){
    if(typeof name!=='string'||!(name==='project.json'||/^assets\/[\p{L}\p{N}_. /-]+$/u.test(name))||name.includes('..')||name.includes('\\'))throw Error('下载文件路径无效');
    const text=new TextEncoder().encode(name),bytes=new Uint8Array(data),crc=crc32(bytes),head=new Uint8Array(30+text.length),h=new DataView(head.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,text.length,true);head.set(text,30);
    const dir=new Uint8Array(46+text.length),v=new DataView(dir.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,text.length,true);v.setUint32(42,offset,true);dir.set(text,46);
    parts.push(head,bytes);central.push(dir);offset+=head.length+bytes.length;centralSize+=dir.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+22);let at=0;for(const p of [...parts,...central,end]){result.set(p,at);at+=p.length;}return result;
}
export const fileSize=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
