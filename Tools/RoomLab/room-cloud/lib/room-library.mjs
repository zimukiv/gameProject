// Independent room records in R2: no revisions, branches, graph parents or workspace mutations.
export async function roomLibrary(request, env, workspace, route, { json, manifest, sha, canonical, fail, reply }) {
  const prefix = workspace + '/rooms/';
  if (route === 'rooms' && request.method === 'GET') {
    const cursor = new URL(request.url).searchParams.get('cursor') || undefined;
    const page = await env.BUCKET.list({prefix, limit:100, cursor, include:['customMetadata']});
    return reply({rooms:page.objects.map(o => JSON.parse(o.customMetadata.info)), cursor:page.truncated ? page.cursor : null});
  }
  if (route.startsWith('rooms/') && request.method === 'GET') {
    const id=route.slice(6);
    if(!/^[a-f0-9]{64}$/.test(id)) fail('房间编号无效');
    const object=await env.BUCKET.get(prefix+id);
    if(!object) fail('云端房间不存在',404);
    return reply(await object.json());
  }
  if (route === 'rooms' && request.method === 'POST') {
    const {revision:r}=await json(request); manifest(r);
    if(r.parent!==null) fail('房间库不接受父节点关系');
    const unsigned={...r};delete unsigned.id;
    if(await sha(new TextEncoder().encode(canonical(unsigned)))!==r.id || await sha(new TextEncoder().encode(canonical(r.files)))!==r.fingerprint) fail('房间清单校验失败');
    const projectFile=r.files.find(f=>f.path==='project.json');
    if(!projectFile || projectFile.size>32*1024*1024) fail('房间数据过大');
    for(const f of r.files) for(const c of f.chunks) {
      const head=await env.BUCKET.head(workspace+'/'+c.hash);
      if(!head || head.size!==c.size) fail('请先上传完整房间素材',422);
    }
    const bytes=new Uint8Array(projectFile.size);let offset=0;
    for(const c of projectFile.chunks){const object=await env.BUCKET.get(workspace+'/'+c.hash);const data=new Uint8Array(await object.arrayBuffer());if(await sha(data)!==c.hash) fail('房间内容校验失败');bytes.set(data,offset);offset+=data.length;}
    if(await sha(bytes)!==projectFile.hash) fail('房间内容校验失败');
    let project;try{project=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('房间格式无效');}
    if(project.courses?.length!==1 || project.courses[0].rooms?.length!==1) fail('请上传单个房间');
    const course=project.courses[0],room=course.rooms[0];
    if(!Number.isSafeInteger(room.cols)||room.cols<1||!Number.isSafeInteger(room.rows)||room.rows<1) fail('房间尺寸无效');
    const info={id:r.id,name:String(room.name||'未命名房间').slice(0,80),kind:String(course.kind||'').slice(0,30),courseName:String(course.name||'').slice(0,80),cols:room.cols,rows:room.rows,notes:String(room.notes||'').slice(0,160),uploadedAt:Date.now()};
    const existing=await env.BUCKET.get(prefix+r.id);
    if(existing) return reply({room:(await existing.json()).info});
    await env.BUCKET.put(prefix+r.id,JSON.stringify({info,revision:r}),{customMetadata:{info:JSON.stringify(info)}});
    return reply({room:info});
  }
  return reply({error:'房间库接口不存在'},404);
}
