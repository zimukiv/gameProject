import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function storageFixture(){
  const db=new DatabaseSync(':memory:');
  const dir=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,dir),'utf8'));
  const wrap=(sql,values=[])=>({bind:(...v)=>wrap(sql,v),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...values).changes)}}),all:async()=>({results:db.prepare(sql).all(...values)}),first:async()=>db.prepare(sql).get(...values)||null});
  const objects=new Map();
  return {DB:{prepare:sql=>wrap(sql),batch:async jobs=>Promise.all(jobs.map(j=>j.run()))},BUCKET:{
    put:async(key,data,options={})=>objects.set(key,{bytes:typeof data==='string'?new TextEncoder().encode(data):new Uint8Array(data),customMetadata:options.customMetadata}),
    head:async key=>objects.has(key)?{size:objects.get(key).bytes.length}:null,
    get:async key=>{const value=objects.get(key);return value?{body:value.bytes,arrayBuffer:async()=>value.bytes.slice().buffer,json:async()=>JSON.parse(new TextDecoder().decode(value.bytes))}:null},
    list:async({prefix,cursor,limit})=>{const keys=[...objects.keys()].filter(k=>k.startsWith(prefix)).sort(),at=Number(cursor||0),page=keys.slice(at,at+limit);return{objects:page.map(key=>({key,customMetadata:objects.get(key).customMetadata})),truncated:at+limit<keys.length,cursor:String(at+limit)}}
  },close:()=>db.close()};
}
