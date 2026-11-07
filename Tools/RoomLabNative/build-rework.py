"""Individually authored rooms; no shared traversal template. Old campaign is untouched."""
import json, copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Assets/StreamingAssets/RoomLabNative/Campaign'
p=json.loads((OUT/'deadline-night.json').read_text(encoding='utf-8'))
p.update(id='deadline-rework-v2',name='DDL · 柳暗花明',notes='初版意见重做：每房一个空间命题；首次探索时长以真人试玩为准。',courses=[],pluginManifest={})
p['nativeCampaign']={'id':'deadline-rework-v2','edition':'local-rework-20261107','targetMinutes':30}

class Room:
 def __init__(self,kind,n,title,w=40,h=26,floor=22,start=2,awake=50,chase=False):
  self.kind=kind;self.n=n;self.id=f'rework-{kind}-{n:02}';self.floor=floor;self.tiles={};self.serial=0
  self.r={'id':self.id,'name':f'{n:02} · {title}','notes':'','cols':w,'rows':h,'phase':'fast' if chase else 'slow','aiPolicy':'inherit' if chase else 'off','environment':'cold','graph':{'x':(n-1)*220,'y':0},'playCamera':{'mode':'follow','cols':26,'rows':16},'tiles':[],'objects':[],'movables':[],'zones':[],'artBindings':{},'entries':[{'id':self.id+'-entry','name':'入口','x':start,'y':floor-1,'face':1}],'exits':[], 'nativeCampaign':{'objective':'','switches':[],'platforms':[],'patrols':[],'signs':[],'awareness':awake,'checkins':0,'requireAI':chase,'walkthrough':[]}}
  self.cp(start+1,floor)
  if chase:self.obj('common.aiStartHollow',start+4,floor-1,mode='region',name='追逐启动终端');self.cp(start+7,floor)
 def ident(self,label):self.serial+=1;return f'{self.id}-{label}-{self.serial:03}'
 def floorline(self,x1,x2,y):
  for x in range(x1,x2):self.tiles[x,y]={'x':x,'y':y}
 def wall(self,x,y1,y2,w=1):
  for yy in range(y1,y2):self.floorline(x,x+w,yy)
 def obj(self,t,x,y,params=None,mode='none',collision=False,name=None,rework=None,**kw):
  o={'id':self.ident('obj'),'type':t,'name':name or t,'x':x,'y':y,'w':1,'h':1,'collision':collision,'params':params or {},'trigger':{'mode':mode,'once':False,'requiresAI':False,'distance':5,'cooldown':1},'resetPolicy':'checkpoint','assetOverrides':{}}
  if rework:o['rework']=rework
  o.update(kw);self.r['objects'].append(o);return o
 def pad(self,t,x,y,params=None,rework=None,name=None):return self.obj(t,x,y,params,'foot',True,name,rework)
 def cp(self,x,y):return self.obj('common.checkpoint',x,y-1,mode='region',name='近处检查点')
 def coins(self,pts):
  for x,y in pts:self.obj('common.small',x,y)
 def relic(self,x,y,name,band=None):self.obj('common.collectible',x,y,name=name,rework={'band':band} if band else None)
 def platform(self,x,y,w=1,h=1,**kw):
  a={'id':self.ident('platform'),'x':x,'y':y,'w':w,'h':h};a.update(kw);self.r['nativeCampaign']['platforms'].append(a);return a
 def stairs(self,x,y,count=5,d=1,band=None):
  for k in range(count):self.platform(x+d*2*k,y-k,2,1,**({'band':band} if band else {}))
 def control(self,x,y,key,value=True,signal=False,derivative=False,text=None):
  if not signal and key not in self.r['nativeCampaign']['switches']:self.r['nativeCampaign']['switches'].append(key)
  return self.pad('calculus.derivative' if derivative else 'calculus.integral',x,y,rework={('signal' if signal else 'switch'):key,'value':value,'label':('d ' if derivative else '∫ ')+{'bridge':'α','unfold':'α','assemble':'α','release':'β','shutter':'α','alpha':'α','omega':'ω','beta':'β','gamma':'γ','fold':'α','released':'ε','beta2':'β','gamma2':'γ','detour':'δ'}.get(key,'δ'),'message':text or ('求导拆开' if derivative else '积分重组')+' · '+key})
 def clarity(self,x,y,target):return self.pad('slacker.awake',x,y,rework={'clarityTarget':target},name='打盹座位' if target<35 else '投影座位' if target<65 else '咖啡桌')
 def jet(self,x,y,force=760):self.pad('physics.jet',x,y,{'direction':'up','force':force,'launchX':0,'launchY':-force,'range':4,'affectAI':True,'cooldown':1.8})
 def thermal(self,x,y,z):self.pad('physics.thermal',x,y,{'zoneId':z,'mode':'toggle','initialState':'cold','cooldown':1})
 def icewall(self,x,y1,y2):
  zid=self.ident('zone');self.r['zones'].append({'id':zid,'x':x,'y':y1,'w':2,'h':y2-y1+1,'initial':'cold'})
  for y in range(y1,y2):self.obj('physics.ice',x,y,{'zoneId':zid,'meltAfter':4,'respawnDelay':2},collision=True)
  return zid
 def rail(self,x,y,tox,toy):
  o=self.pad('physics.rail',x,y,{'acceleration':1100,'maxSpeed':570,'launchAngle':-8,'allowExit':True,'sideTrigger':True,'cooldown':2,'length':10})
  o['params']['path']=[{'id':o['id']+'-a','parentId':o['id'],'x':x+.5,'y':y},{'id':o['id']+'-b','parentId':o['id'],'x':tox,'y':toy}]
 def patrol(self,x1,x2,y,speed=100):self.r['nativeCampaign']['patrols'].append({'id':self.ident('patrol'),'speed':speed,'nodes':[{'x':x1,'y':y-.45},{'x':x2,'y':y-.45}]})
 def sign(self,text,x,y):self.r['nativeCampaign']['signs'].append({'text':text,'x':x,'y':y})
 def exit(self,x,y,name='下一间',rework=None):
  e={'id':self.ident('exit'),'name':name,'x':x,'y':y-2,'w':2,'h':2}
  if rework:e['rework']=rework
  self.r['exits'].append(e);return e['id']
 def waypoint(self,*pts):
  # Targets describe real input routes, not runtime automation or state changes.
  for v in pts:self.r['nativeCampaign']['walkthrough'].append({'x':v[0],'floor':v[1],**(v[2] if len(v)>2 else {})})
 def finish(self,story,objective):
  self.r['notes']=story;self.r['nativeCampaign']['objective']=objective;self.r['tiles']=list(self.tiles.values());return self.r

physics=[]
r=Room('physics',1,'借风上楼',38,30,24);r.floorline(0,38,24);r.floorline(11,22,18);r.floorline(24,38,12);r.jet(7,24,820);r.jet(18,18,880);r.cp(13,18);r.cp(28,12);r.coins([(7,22),(12,17),(18,16),(25,11)]);r.sign('↑  →',9,21);r.exit(34,12);r.waypoint((7,24),(12,18),(18,18),(26,12),(35,12));physics.append(r.finish('教学楼封了楼梯。先借一次风，再在半空调整落点。','借两次上升气流，抵达顶层；失误落回安全地面'))
r=Room('physics',2,'冰墙背后的门',40,26,22);r.floorline(0,40,22);z=r.icewall(19,11,22);r.thermal(10,22,z);r.floorline(33,36,17);r.stairs(24,21,5);r.coins([(9,21),(22,21),(34,16)]);r.sign('冷 ↔ 热',15,18);r.exit(36,22);r.waypoint((10,22),(23,22),(24,21),(26,20),(28,19),(30,18),(33,17),(37,22));physics.append(r.finish('你：墙后就是教室？AI：热能拆墙，冷能留路。','让冰墙融化，观察同一块冰的两种用途'))
r=Room('physics',3,'低头才看见',38,24,20);r.floorline(0,38,20)
for x in range(9,24):r.tiles.pop((x,20),None);r.obj('physics.ice',x,20,{'meltAfter':8,'respawnDelay':2},collision=True)
r.platform(11,19,11,.25);r.coins([(13,19),(17,19),(21,19)]);r.sign('↓',15,16);r.exit(34,20);r.waypoint((9,20),(24,20,{'crouch':True}),(35,20));physics.append(r.finish('一张贴在桌底的便签：别总想着跳过去。','蹲下滑过低通道，离开冰面后重新控制速度'))
r=Room('physics',4,'离轨的一瞬',46,28,22,chase=True);r.floorline(0,46,22);r.rail(12,22,34,15);r.floorline(34,43,14);r.floorline(33,43,17);r.relic(38,13,'离轨批注');r.relic(39,16,'磁场草稿');r.patrol(28,36,22,95);r.exit(42,22);r.sign('↑  ?',20,19);r.waypoint((6,22,{'interact':True}),(12,22),(35,17),(43,22));physics.append(r.finish('助手上线。前方巡查只在追逐时工作；导轨中也能主动跳出。','主路沿轨道落到对岸；提前离轨可以取上层记录'))
r=Room('physics',5,'从入口上方回来',46,29,24,chase=True);r.floorline(0,46,24);z=r.icewall(22,17,24);r.thermal(13,24,z);r.jet(40,24,850);r.floorline(4,38,17);r.relic(30,16,'回路样本');r.relic(10,16,'门上的旧记录');r.patrol(20,30,17,105);r.cp(34,17);r.exit(4,17);r.sign('↶',5,20);r.sign('↑  ↰',40,20);r.waypoint((6,24,{'interact':True}),(13,24),(40,24),(34,17),(5,17));physics.append(r.finish('来时看见的门，现在在脚下。你绕的是一圈，不是第三条走廊。','先熔开下路，再借右侧喷口回到入口上方'))
r=Room('physics',6,'让助手先取样',44,27,22,chase=True);r.floorline(0,44,22);r.jet(16,22,820);r.floorline(21,34,16);r.relic(23,15,'共同署名');r.relic(31,15,'喷流记录');r.patrol(26,34,22,115);r.exit(40,22);r.sign('↶  ◆',27,13);r.waypoint((6,22,{'interact':True}),(16,22),(23,16),(33,16),(41,22));physics.append(r.finish('AI：你负责带路，我负责把高处那份样本收好。','上层取样、下层提交；巡查覆盖落地口，留意巡逻折返'))
r=Room('physics',7,'最后一次接力',60,31,26,chase=True);r.floorline(0,60,26);z=r.icewall(19,19,26);r.thermal(13,26,z);r.jet(26,26,940);r.floorline(32,42,19);r.rail(37,19,50,14);r.floorline(49,60,20);r.cp(34,19);r.relic(35,18,'未熄灯的实验');r.relic(54,19,'完整报告');r.patrol(45,53,26,110);r.exit(56,20,'提交实验报告');r.waypoint((6,26,{'interact':True}),(13,26),(26,26),(34,19),(37,19),(52,20),(57,20));physics.append(r.finish('热控、借风、离轨。它们终于接成了一条你自己读懂的路。','完成机关接力，提交实验报告'))

math=[]
r=Room('calculus',1,'断开的等号',38,27,19);r.floorline(0,11,19);r.floorline(22,38,19);r.floorline(0,38,24);r.stairs(3,23,5);r.control(7,19,'bridge',text='积分 · 中央纸桥正在拼合');r.platform(11,8,11,1,toY=19,switch='bridge',label='∫');r.coins([(8,18),(16,18),(25,18)]);r.exit(34,19,rework={'switch':'bridge','lockedText':'踩下积分板，补上等号'});r.waypoint((7,19),(16,19),(35,19));r.exit(2,24,'安全返程 ↑');r.exit(14,24,'安全返程 ↑');r.r['nativeCampaign']['recoveryExits']=[1,2];math.append(r.finish('教师：你要交的不只是答案，还有通向答案的过程。','积分把空白处拼成路；下层是安全回路'))
r=Room('calculus',2,'门也是楼梯',40,27,23);r.floorline(0,40,23);r.control(9,23,'unfold',derivative=True,text='求导 · 竖墙展开为六级纸阶')
for k in range(7):r.platform(17,16+k,2,1,toX=18+2*k,toY=22-k,switch='unfold',seconds=1.3)
r.floorline(32,40,16);r.cp(34,16);r.exit(36,16);r.sign('d  ↗',20,12);r.waypoint((9,23),(18,22),(20,21),(22,20),(24,19),(26,18),(28,17),(30,16),(37,16));math.append(r.finish('你：门没有消失。AI：它只是换了一个你能使用的形状。','求导拆开墙，再踏上由墙组成的阶梯'))
r=Room('calculus',3,'借给隔壁一条路',42,28,24);r.floorline(0,42,24);r.floorline(0,15,15)
for k in range(9):r.platform(30-2*k,4,2,1,toY=23-k,signal='beta',label='β' if k==0 else '')
side=r.exit(37,24,'β 隔页演算 →');upper=r.exit(3,15,'β 回到上层',{'signal':'beta','lockedText':'β桥尚未展开；去右侧的隔页演算室'});r.r['entries'].append({'id':r.id+'-return','name':'从隔页返回','x':34,'y':23,'face':-1});r.sign('β →',25,20);r.sign('β ↑',6,12);r.waypoint((38,24));math.append(r.finish('上面的出口一开始就看得见。右侧门上，写着同样的β。','第一次去右侧；收到β通知后，沿新阶梯返回上层'))
r=Room('calculus',4,'隔页演算',36,23,19,start=4);r.floorline(0,36,19);r.stairs(10,18,3);r.floorline(16,23,16);r.stairs(26,18,3,d=-1);r.control(28,19,'beta',signal=True,text='跨房连动：03 借给隔壁一条路 · β纸阶已展开');r.cp(30,19);r.exit(0,19,'返回 β 大厅');r.sign('∫ β',26,15);r.waypoint((10,18),(12,17),(16,16),(26,18),(28,19),(30,19),(26,18),(24,17),(22,16),(16,16),(10,18),(1,19));math.append(r.finish('手机收到邻房通知：β阶梯展开了。回去看看刚才的出口。','走到右侧积分板，改变上一房；再返回左门'))
r=Room('calculus',5,'把答案拆开',44,30,26,chase=True);r.floorline(0,44,26);r.control(12,26,'assemble',text='积分 · 上行纸阶已组装')
for k in range(7):r.platform(16+2*k,5,2,1,toY=25-k,switch='assemble')
r.floorline(29,34,19);r.control(31,19,'release',derivative=True,text='求导 · 右侧封板抬起，下方通道打开');r.platform(36,20,2,6,toY=5,switch='release');r.relic(30,18,'拆开的答案');r.relic(38,25,'等号之后');r.patrol(24,32,26,95);r.exit(40,26,rework={'switch':'release','lockedText':'从上层求导板打开右侧封板'});r.waypoint((6,26,{'interact':True}),(12,26),(16,25),(18,24),(20,23),(22,22),(24,21),(26,20),(30,19),(31,19),(41,26));math.append(r.finish('刚刚组装好的答案，现在要拆开。路不是越多越好。','积分登上上层，再求导打开下行通道'))
r=Room('calculus',6,'让它先走',48,28,24,chase=True);r.floorline(0,48,24);r.stairs(13,23,6);r.floorline(23,37,18);r.control(31,18,'shutter',derivative=True,text='求导 · 中层封板收起；可从侧边回到主路');r.platform(38,17,2,7,toY=3,switch='shutter');r.relic(26,17,'反向证明');r.relic(34,17,'留给助手的注释');r.patrol(20,28,24,110);r.exit(44,24);r.waypoint((6,24,{'interact':True}),(13,23),(15,22),(17,21),(19,20),(21,19),(24,18),(31,18),(35,18),(45,24));math.append(r.finish('带追兵走过一条弧线，再从它身后落下。紫色标记会提前告诉你落点。','上下两路交错；引主助手收笔记，避开下层巡查'))
r=Room('calculus',7,'最后一行不是直线',50,31,27,chase=True);r.floorline(0,50,27);r.control(12,27,'alpha',text='左半证明完成 · α通道开放');r.control(43,27,'omega',derivative=True,text='右半证明完成 · ω阶梯展开')
r.platform(28,13,2,10,toY=1,switch='alpha',label='α')
for k in range(13):r.platform(41-2*k,3,2,1,toY=26-k,switch='omega')
r.floorline(10,19,14);r.relic(29,19,'两边的过程');r.relic(17,13,'最后一行');r.patrol(25,34,27,100);r.exit(11,14,'提交数学作业',{'allSwitches':['alpha','omega'],'lockedText':'先完成左右两半证明'});r.sign('α · ω',23,10);r.waypoint((6,27,{'interact':True}),(12,27),(43,27),(41,26),(39,25),(37,24),(35,23),(33,22),(31,21),(29,20),(27,19),(25,18),(23,17),(21,16),(19,15),(17,14),(12,14));math.append(r.finish('一左一右，两段过程在大厅中央接上。你终于不用绕第三条长廊。','左右两端各有一块算子板；完成后从中央上行提交'))

water=[]
r=Room('slacker',1,'最后一排的黑板',40,28,24,awake=50);r.floorline(0,40,24);r.clarity(6,24,90);r.clarity(9,24,15);r.stairs(13,23,7,band='awake');r.floorline(27,40,17);r.exit(35,17,rework={'band':'awake','lockedText':'清醒后才能读懂黑板上的出口'});r.sign('醒',24,13);r.waypoint((6,24,{'band':'awake'}),(12,24,{'jump':True}),(13,23),(15,22),(17,21),(19,20),(21,19),(23,18),(25,17),(36,17));water.append(r.finish('黑板似乎写了什么。咖啡能让纸页成为阶梯；座位会把你带进梦里。','先喝咖啡，绕开打盹座位，沿清醒阶梯上楼'))
r=Room('slacker',2,'画框背后',42,27,23,awake=90);r.floorline(0,42,23);r.clarity(9,23,15);r.platform(20,12,2,11,band='awake');r.platform(20,12,2,11,band='haze');r.clarity(30,23,90);r.stairs(25,22,5,band='awake');r.floorline(35,42,18);r.coins([(35,17),(37,17),(39,17)]);r.exit(36,23,rework={'band':'dream','lockedText':'下层画框出口只在梦境开放；右侧座位可以再入梦'});r.clarity(34,23,15);r.sign('画外',20,10);r.waypoint((9,23,{'band':'dream'}),(26,23),(36,23));water.append(r.finish('美育课的画框，清醒时是一堵墙。梦里，它成了另一间教室的门。','降低清醒度，从画框中穿过；高清醒并非总是最优'))
r=Room('slacker',3,'幻灯片之间',42,28,19,awake=15);r.floorline(0,12,19);r.floorline(28,42,19);r.floorline(0,42,25);r.stairs(3,24,6);r.clarity(6,19,50);r.clarity(9,19,90)
for x in (12,17,22):r.platform(x,19,5,1,band='haze')
r.platform(27,19,1,1,band='haze');r.exit(37,19,rework={'band':'haze','lockedText':'投影路线属于朦胧层'});r.sign('光与影',20,15);r.waypoint((6,19,{'band':'haze'}),(8,19),(12,19,{'jump':True}),(22,19),(38,19));r.exit(2,25,'安全返程 ↑');r.exit(18,25,'安全返程 ↑');r.r['nativeCampaign']['recoveryExits']=[1,2];water.append(r.finish('睡着看不见，醒透了又消失。投影留在两者之间。','坐到投影席，保持朦胧；跳过咖啡桌进入投影桥'))
r=Room('slacker',4,'军理沙盘',48,29,25,chase=True,awake=90);r.floorline(0,48,25);r.clarity(11,25,15);r.clarity(37,25,90);r.platform(24,18,2,7,band='awake');r.platform(24,18,2,7,band='haze');r.stairs(14,24,7,band='dream');r.platform(28,18,6,1,band='dream');r.relic(30,17,'折纸等高线','dream');r.relic(41,24,'清醒的地图','awake');r.patrol(30,36,25,105);r.exit(44,25);r.sign('纸上的山',24,14);r.waypoint((6,25,{'interact':True}),(11,25,{'band':'dream'}),(14,24),(16,23),(18,22),(20,21),(22,20),(24,19),(28,18),(33,18),(37,25,{'band':'awake'}),(45,25));water.append(r.finish('投影上的地图从玻璃罩里展开。巡查仍沿地面走，纸丘属于梦。','梦境穿过沙盘围挡，醒来读右侧记录；两路可选'))
r=Room('slacker',5,'请同学回答',42,26,22,chase=True,awake=90);r.floorline(0,42,22);r.clarity(12,22,90);r.platform(17,19,5,1);r.stairs(14,21,3);s=r.pad('slacker.checkin',29,22,name='请助手到场');s['trigger']['requiresAI']=True;r.r['nativeCampaign']['checkins']=1;r.relic(19,18,'回答前的空白');r.relic(34,21,'到场凭证');r.patrol(22,26,22,95);r.exit(38,22);r.sign('两个人的座位',31,18);r.waypoint((6,22,{'interact':True}),(12,22),(18,19),(29,22,{'checkins':1}),(39,22));water.append(r.finish('老师叫到了你的名字。AI：等我靠近再答，这次不能只发一个定位。','从上层避开巡查，在签到台短暂等主助手到场'))
r=Room('slacker',6,'三个名字',48,29,25,chase=True,awake=15);r.floorline(0,48,25);r.clarity(11,25,15);r.clarity(19,25,50);r.clarity(30,25,90)
r.pad('slacker.checkin',14,25,rework={'band':'dream'},name='梦中点名');r.stairs(21,24,3,band='haze');r.platform(27,22,3,1,band='haze');r.pad('slacker.checkin',28,22,rework={'band':'haze'},name='投影点名');r.stairs(33,24,6,band='awake');r.platform(43,19,4,1,band='awake');r.pad('slacker.checkin',44,19,rework={'band':'awake'},name='清醒点名');r.r['nativeCampaign']['checkins']=3;r.relic(28,21,'投影的名字','haze');r.relic(44,18,'清醒的名字','awake');r.patrol(34,40,25,100);r.exit(2,25,'返回讲台提交');r.sign('梦 · 影 · 醒',24,15);r.waypoint((6,25,{'interact':True}),(11,25,{'band':'dream'}),(14,25),(19,25,{'band':'haze'}),(21,24),(23,23),(25,22),(28,22),(30,25,{'band':'awake'}),(33,24),(35,23),(37,22),(39,21),(41,20),(44,19),(3,25));water.append(r.finish('三个名字出现在不同的课堂里。你知道怎样让它们同时留在签到记录上。','切换三档清醒度，在各自路线签到，最后返回左侧讲台'))
r=Room('slacker',7,'下课以后',50,30,26,chase=True,awake=90);r.floorline(0,50,26);r.clarity(12,26,15);r.platform(22,13,2,13,band='awake');r.platform(22,13,2,13,band='haze');r.clarity(28,26,90);r.stairs(30,25,6,band='awake');r.floorline(41,46,20);r.relic(43,19,'下课后才懂的画','awake');r.relic(19,25,'梦里的旁注','dream');r.clarity(37,26,50);r.pad('slacker.checkin',43,26,rework={'band':'haze'},name='最后一次回答');r.r['nativeCampaign']['checkins']=1;r.patrol(31,35,26,110);r.exit(46,26,'把今晚还给自己',{'band':'haze','lockedText':'坐到投影席，用自己的名字提交'});r.sign('画的背面',35,16);r.waypoint((6,26,{'interact':True}),(12,26,{'band':'dream'}),(25,26),(28,26,{'band':'awake'}),(30,25),(32,24),(34,23),(36,22),(38,21),(42,20),(47,26),(37,26,{'band':'haze'}),(43,26),(47,26));water.append(r.finish('梦里绕过画框，清醒时看到画的背面。铃声响了，这次你记得自己经过哪里。','穿过梦境画框，选择上层收藏；回到朦胧投影完成最后签到'))

for kind,label,rooms in [('physics','实验楼的回路',physics),('calculus','纸上的空间',math),('slacker','同一间教室',water)]:
 edges=[]
 def connect(a,ei,b,entry=0):edges.append({'id':f'{a["id"]}-link-{len(edges)}','from':{'roomId':a['id'],'exitId':a['exits'][ei]['id']},'to':{'roomId':b['id'],'entryId':b['entries'][entry]['id']},'velocity':'reset'})
 if kind=='calculus':
  connect(rooms[0],0,rooms[1]);connect(rooms[1],0,rooms[2]);connect(rooms[2],0,rooms[3]);connect(rooms[3],0,rooms[2],1);connect(rooms[2],1,rooms[4]);connect(rooms[4],0,rooms[5]);connect(rooms[5],0,rooms[6])
 else:
  for a,b in zip(rooms,rooms[1:]):connect(a,0,b)
 for recovery in rooms:
  for exitIndex in recovery['nativeCampaign'].get('recoveryExits',[]):connect(recovery,exitIndex,recovery)
 c={'id':'rework-'+kind,'name':label,'kind':kind,'aiId':kind+'-assistant','notes':'逐房箱庭 · 初版意见重做','defaultSize':{'cols':42,'rows':28},'artBindings':{},'nativeCampaign':{'signals':['beta'] if kind=='calculus' else []},'rooms':rooms,'connections':edges};p['courses'].append(c)
 for r in rooms:
  for o in r['objects']:p['pluginManifest'][o['type']]='2.0.0' if o['type'] in ('physics.jet','physics.rail') else '1.0.0'
(OUT/'deadline-rework.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
print('REWORK_AUTHORED',sum(len(c['rooms']) for c in p['courses']),'rooms',sum(o['type']=='common.collectible' for c in p['courses'] for r in c['rooms'] for o in r['objects']),'collectibles')
