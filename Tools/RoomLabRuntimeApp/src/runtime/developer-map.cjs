'use strict';
const Draw = require('../editor/draw.cjs');
const { clamp } = require('../shared/utils.cjs');
function viewMode(game, command) {
  return game.developer.enabled && ['room', 'course'].includes(command.mapView) ? command.mapView : '';
}
function roomCamera(room, width, height, command = {}) {
  const zoom = clamp(Number.isFinite(command.mapZoom) ? command.mapZoom : 1, 1, 8),
    top = 84, padding = 24, areaH = Math.max(1, height - top - padding),
    scale = Math.min(Math.max(1, width-padding*2)/(room.cols*32), areaH/(room.rows*32))*zoom,
    worldW = room.cols*32*scale, worldH = room.rows*32*scale;
  const pan = (value, size, area) => clamp(Number.isFinite(value) ? value : 0,
    -Math.max(0, (size-area)/2+padding), Math.max(0, (size-area)/2+padding));
  return { scale, x: (width-worldW)/2+pan(command.mapPanX,worldW,width),
    y: top+(areaH-worldH)/2+pan(command.mapPanY,worldH,areaH), mode: 'room' };
}
function orderedRooms(course) {
  const result = [], seen = new Set(), rooms = new Map(course.rooms.map(r=>[r.id,r]));
  function visit(room) {
    if (!room || seen.has(room.id)) return;
    seen.add(room.id); result.push(room);
    for (const edge of course.connections) if (edge.from.roomId===room.id) visit(rooms.get(edge.to.roomId));
  }
  const incoming = new Set(course.connections.map(e=>e.to.roomId));
  for (const room of course.rooms) if (!incoming.has(room.id)) visit(room);
  for (const room of course.rooms) visit(room);
  return result;
}
function layout(course, width, height) {
  const rooms = orderedRooms(course), columns = Math.min(4, rooms.length || 1,
    Math.max(1, Math.round(Math.sqrt(rooms.length*Math.max(1,width-48)/(Math.max(1,height-108)*1.5))))),
    rows = Math.ceil(rooms.length/columns) || 1, gap = 16, margin = 24, top = 84,
    w = (width-margin*2-gap*(columns-1))/columns,
    h = (height-top-margin-gap*(rows-1))/rows;
  return rooms.map((room,i)=>({id:room.id,name:room.name,number:i+1,
    x:margin+(i%columns)*(w+gap),y:top+Math.floor(i/columns)*(h+gap),w,h}));
}
function arrow(ctx, points) {
  ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.stroke();
  const end=points.at(-1),prev=points.at(-2),angle=Math.atan2(end[1]-prev[1],end[0]-prev[0]);
  ctx.beginPath();ctx.moveTo(...end);
  ctx.lineTo(end[0]-7*Math.cos(angle-.45),end[1]-7*Math.sin(angle-.45));
  ctx.lineTo(end[0]-7*Math.cos(angle+.45),end[1]-7*Math.sin(angle+.45));ctx.closePath();ctx.fill();
}
function drawAtlas(ctx, game) {
  const cards=layout(game.course,ctx.canvas.width,ctx.canvas.height),byId=new Map(cards.map(c=>[c.id,c]));
  ctx.fillStyle='#09121d';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.strokeStyle=ctx.fillStyle='#79c5be';ctx.lineWidth=2;
  for(const edge of game.course.connections){
    const a=byId.get(edge.from.roomId),b=byId.get(edge.to.roomId);if(!a||!b||a===b)continue;
    if(a.y===b.y)arrow(ctx,[[a.x+a.w,a.y+a.h/2],[b.x,b.y+b.h/2]]);
    else {const y=(a.y+a.h+b.y)/2;arrow(ctx,[[a.x+a.w/2,a.y+a.h],[a.x+a.w/2,y],[b.x+b.w/2,y],[b.x+b.w/2,b.y]]);}
  }
  for(const card of cards){
    const room=game.course.rooms.find(r=>r.id===card.id),current=card.id===game.room.id;
    ctx.fillStyle=current?'#263749':'#162637';ctx.fillRect(card.x,card.y,card.w,card.h);
    ctx.strokeStyle=current?'#ffd36e':'#55758e';ctx.lineWidth=current?3:1;ctx.strokeRect(card.x,card.y,card.w,card.h);
    Draw.text(ctx,`${card.number}. ${card.name}${current?' · 当前':''}`,card.x+8,card.y+20,14,current?'#ffe1a0':'#dbeaf4');
    const thumb={x:card.x+6,y:card.y+28,w:card.w-12,h:Math.max(1,card.h-53)};
    Draw.miniature(ctx,room,thumb.x,thumb.y,thumb.w,thumb.h);
    if(current){
      const v=Draw.fit(room,thumb.w,thumb.h,4);
      ctx.fillStyle='#ffd36e';ctx.beginPath();
      ctx.arc(thumb.x+v.x+(game.player.x+game.player.w/2)*v.scale,
        thumb.y+v.y+(game.player.y+game.player.h/2)*v.scale,4,0,Math.PI*2);ctx.fill();
    }
    const targets=game.course.connections.filter(e=>e.from.roomId===room.id).map(e=>byId.get(e.to.roomId)?.number).filter(Boolean);
    Draw.text(ctx,targets.length?'通往 '+targets.join('、'):'终点',card.x+8,card.y+card.h-8,11,'#94b3c9');
  }
  return cards;
}
function draw(ctx, game, command, assetURL) {
  const mode=viewMode(game,command);
  if(mode==='course')return {mapView:mode,mapRooms:drawAtlas(ctx,game),previewRoomName:''};
  const room=game.course.rooms.find(r=>r.id===command.previewRoom)||game.room,
    camera=roomCamera(room,ctx.canvas.width,ctx.canvas.height,command),current=room.id===game.room.id;
  Draw.drawRoom(ctx,game.project,game.course,room,{view:camera,game:current?game:null,targets:true,assetURL});
  if(current){
    const x=camera.x+(game.player.x+game.player.w/2)*camera.scale,
      y=camera.y+(game.player.y+game.player.h/2)*camera.scale;
    ctx.strokeStyle='#ffd36e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.stroke();
    Draw.text(ctx,'当前位置',x+12,y-8,12,'#ffe1a0');
  }
  return {mapView:'room',mapRooms:[],previewRoomName:room.name+(current?' · 当前状态':' · 布局预览')};
}
module.exports={viewMode,roomCamera,orderedRooms,layout,draw};
