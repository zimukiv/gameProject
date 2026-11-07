"""Network edition. Preserves old campaign, creates a separate file; no import-time writes."""
import ast, copy, json, importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ns={}
ast_root=ast.parse((Path(__file__).parent/'build-rework.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in ast_root.body if isinstance(n,ast.ClassDef) and n.name=='Room'],type_ignores=[]),'room-helper','exec'),ns)
BaseRoom=ns['Room']
class Room(BaseRoom):
 def __init__(self,n,title,w=52,h=34,floor=30,start=3,chase=False):
  super().__init__('slacker',n,title,w,h,floor,start,50,chase)
  # Rebase all generated ids before appending additional content.
  old=self.id;self.id=f'network-slacker-{n:02}'
  self.r=json.loads(json.dumps(self.r).replace(old,self.id))
  self.r['nativeCampaign']['pulseBudget']=1 if chase else 0
  self.floorline(0,w,floor)
 def item(self,x,y,delta):
  o=self.obj('slacker.awake',x,y-1,mode='region',name='咖啡' if delta>0 else '折起的讲义',rework={'clarityDelta':delta})
  o['trigger']['once']=True
  return o
 def record(self,x,y,band):
  o=self.obj('slacker.checkin',x,y-1,mode='region',name={'awake':'板书留影','haze':'投影留影','dream':'梦中留影'}[band],rework={'band':band,'signal':'record-'+band,'message':'课页留下了一点痕迹','label':{'awake':'□','haze':'○','dream':'◇'}[band]})
  o['trigger']['once']=True
 def port(self,key,x,floor,face=1,rule=None):
  e=self.exit(x,floor,'门',rule)
  # Spawn beside rather than directly on an interactive door/item.
  entry={'id':self.id+'-entry-'+key,'name':'走廊','x':min(self.r['cols']-2,max(1,x+2 if face>0 else x-2)),'y':floor-1,'face':face}
  self.r['entries'].append(entry)
  return e,entry['id']

def build_water():
 rooms=[];ports={};links=[]
 def finish(r,xy,story,objective):
  # Optional research terminals: common ground, no forced chase or resource pulse.
  # The hub terminal sits beyond the right staircase so collecting its upstairs relic
  # naturally becomes a return trip; other terminals precede their collection ascent.
  optional_terminals={1:11,2:61,3:8,4:11,5:5,6:7,7:12,9:8,11:7}
  if r.n in optional_terminals:
   r.obj('common.aiStartHollow',optional_terminals[r.n],r.floor-1,mode='region',name='取样终端')
  if r.n==8:
   # After the one pulse, a second projection stair lets the player turn back onto
   # the relic bridge. Its lowest tread leaves standing clearance on the ground.
   for k in range(6):r.platform(50-2*k,28.75 if k==0 else 29-k,2,.25 if k==0 else .5,band='haze')
  r.r['graph']={'x':xy[0],'y':xy[1]};rooms.append(r.finish(story,objective));return r
 def port(r,key,x,y,face=1,rule=None):ports[r.n,key]=r.port(key,x,y,face,rule)
 def link(a,pa,b,pb):
  for x,p,y,q in [(a,pa,b,pb),(b,pb,a,pa)]:
   links.append({'id':f'water-{x}-{p}-{y}-{q}','from':{'roomId':f'network-slacker-{x:02}','exitId':ports[x,p][0]},'to':{'roomId':f'network-slacker-{y:02}','entryId':ports[y,q][1]},'velocity':'reset'})
 r=Room(1,'剩下半杯',46,32,28);r.item(8,28,30);r.stairs(14,27,7);r.floorline(28,36,21);r.relic(31,20,'杯沿的月亮');r.coins([(16,26),(22,23),(32,20)]);r.sign('☾',8,25);port(r,'hall',42,28,-1);finish(r,(0,220),'杯里的咖啡只剩一次。你记得刚才做过的梦。','杯子和讲义会用完。旗子旁可以记下此刻；需要时从暂停页回到那里。')
 r=Room(2,'座位之间',62,38,34);r.stairs(18,33,8);r.floorline(34,38,26);r.stairs(52,33,8,d=-1);r.stairs(6,33,4);r.floorline(14,18,30);r.relic(38,25,'无人认领的座位');r.coins([(22,31),(28,28),(42,25)]);port(r,'entry',0,34);port(r,'board',39,26,-1);port(r,'frame',58,34,-1);port(r,'return',15,30);finish(r,(200,220),'教室两侧的门都开着，楼上的窗透出一小片灯光。','先记下这里。不同状态下的路，最终都能回到这排座位。')
 r=Room(3,'擦不掉的一行',52,34,30);r.stairs(12,29,7,band='awake');r.platform(26,23,10,1,band='awake');r.record(31,23,'awake');r.relic(34,22,'醒来才读懂的注脚','awake');r.item(40,30,-30);port(r,'hall',0,30);port(r,'projector',48,30,-1);port(r,'shortcut',24,30);r.sign('◉',30,20);finish(r,(400,60),'黑板最后一行被擦过，仍有几道清楚的笔画。','留下黑板上的记录；讲义让视线慢慢柔和。')
 r=Room(4,'画框外侧',54,34,30);r.item(8,30,-30);r.stairs(14,29,8);r.floorline(30,32,22);r.platform(34,22,12,1,band='dream');r.platform(34,14,1,8,band='awake');r.platform(34,14,1,8,band='haze');r.relic(42,21,'画框外的颜色','dream');port(r,'hall',0,30);port(r,'supplies',50,30,-1);port(r,'dream',30,22,-1);finish(r,(400,370),'画框挂得很低，旁边的楼梯通向它的外侧。','地面的门一直开着；画框旁还有另一条路。')
 r=Room(5,'漏光的幻灯片',54,34,30);r.stairs(6,29,7);r.floorline(20,24,23);r.platform(24,23,16,1,band='haze');r.floorline(40,47,23);r.record(43,23,'haze');r.relic(45,22,'放映间的灰尘','haze');port(r,'board',0,30);port(r,'rollcall',50,30,-1);r.sign('◐',43,20);finish(r,(640,60),'光落在尘埃里。太亮和太暗的时候，那条线都不见了。','留下投影上的记录。脚下的走廊能带你原路返回。')
 r=Room(6,'后门茶水间',44,30,26);r.stairs(10,25,5);r.floorline(20,30,21);r.item(23,21,30);r.item(27,21,-30);r.relic(34,25,'备用杯套');port(r,'frame',0,26);port(r,'dream',40,26,-1);finish(r,(620,520),'没喝完的咖啡被留在后门。旁边是一份翻得很旧的讲义。','可以留着，等需要时再回来。')
 r=Room(7,'梦写在背面',56,34,30);r.stairs(14,29,9,band='dream');r.platform(32,21,8,1,band='dream');r.record(36,21,'dream');r.relic(38,20,'睡梦中的签名','dream');r.item(44,30,30);r.item(48,30,30);port(r,'frame',0,30);port(r,'supplies',9,30);port(r,'gallery',52,30,-1);port(r,'rollcall',27,30);r.sign('☾',35,18);finish(r,(640,290),'纸背面的字只在半梦半醒间出现。右边的杯子还冒着热气。','先决定要看清哪一面，再用掉桌上的东西。')
 r=Room(8,'名字从远处传来',56,34,30,chase=True);r.item(12,30,-30);r.stairs(18,29,6,band='haze');r.platform(30,24,9,1,band='haze');r.relic(35,23,'答到前的停顿','haze');r.patrol(40,46,30,85);port(r,'projector',0,30);port(r,'dream',18,30);port(r,'hall',38,30);port(r,'records',52,30,-1);finish(r,(850,150),'老师叫到了你的名字。困意伴着一次熟悉的提示音涌来。','助手的困意脉冲在这一间只发生一次。地面可以绕回座位。')
 r=Room(9,'三页叠在一起',54,34,30);r.stairs(14,29,7);r.floorline(28,40,23);r.cp(32,23);r.relic(38,22,'同一个名字');r.sign('◉   ◐   ☾',31,20);port(r,'rollcall',0,30);port(r,'gallery',49,30,-1);port(r,'board',18,30);port(r,'final',35,23,rule={'signals':{'record-awake':True,'record-haze':True,'record-dream':True},'lockedText':'纸页上还有空白'});finish(r,(1080,220),'三个片段叠在一起，留下同一个名字。讲台后的门还留着一道缝。','三页记录齐了，就能走向铃声。')
 r=Room(10,'铃声之后',64,38,34,chase=True);r.stairs(12,33,10);r.floorline(32,51,24);r.wall(49,25,34,2);r.cp(36,24);r.relic(44,23,'留到下课的一分钟');r.platform(54,33,3,1,band='dream');r.platform(57,32,3,1,band='dream');r.relic(58,31,'梦的余温','dream');r.platform(54,33,3,1,band='haze');r.platform(57,32,3,1,band='haze');r.platform(54,33,3,1,band='awake');r.platform(57,32,3,1,band='awake');r.patrol(53,59,34,95);port(r,'back',0,34);r.exit(60,34,'下课');r.sign('↘',48,21);finish(r,(1320,220),'铃声先到了楼梯口。你带着剩下的一点清醒，走完最后一段。','不必凑到某个数值。三种状态都保留了到达铃声的路。')
 r=Room(11,'无人放映的画廊',54,34,30);r.stairs(10,29,7);r.floorline(24,32,23);r.stairs(44,29,7,d=-1);r.relic(28,22,'无人放映的结尾');r.platform(32,22,2,1,band='dream');r.platform(34,21,2,1,band='dream');r.platform(36,20,8,.5,band='dream');r.relic(41,19,'走神以后','dream');port(r,'dream',0,30);port(r,'records',50,30,-1);finish(r,(870,440),'没有人点名。投影仪仍把最后一帧留在墙上。','这条路能从另一侧回到讲台。')
 for args in [(1,'hall',2,'entry'),(2,'board',3,'hall'),(2,'frame',4,'hall'),(3,'projector',5,'board'),(5,'rollcall',8,'projector'),(4,'supplies',6,'frame'),(4,'dream',7,'frame'),(6,'dream',7,'supplies'),(7,'gallery',11,'dream'),(11,'records',9,'gallery'),(7,'rollcall',8,'dream'),(8,'hall',2,'return'),(8,'records',9,'rollcall'),(9,'board',3,'shortcut'),(9,'final',10,'back')]:link(*args)
 return {'id':'network-slacker','name':'醒与梦的回廊','kind':'slacker','aiId':'slacker-assistant','notes':'一次性资源 · 多向教室网络','defaultSize':{'cols':54,'rows':34},'artBindings':{},'nativeCampaign':{'signals':['record-awake','record-haze','record-dream'],'resourceAwareness':True},'rooms':rooms,'connections':links}

def main():
 folder=ROOT/'Assets/StreamingAssets/RoomLabNative/Campaign'
 p=json.loads((folder/'deadline-rework.json').read_text(encoding='utf-8'))
 old={c['kind']:c for c in p['courses']}
 spec=importlib.util.spec_from_file_location('math_network',Path(__file__).with_name('build-network-calculus.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 physics=copy.deepcopy(old['physics']);physics['id']='network-physics'
 p['courses']=[physics,m.build_calculus(old['calculus']),build_water()]
 p['name']='DDL · 回环与余量';p['nativeCampaign'].update(network=True,edition='local-network-20261107')
 p['notes']='纸页回环与清醒资源。目标时长仍需真人首次探索校准。'
 for c in p['courses']:
  for r in c['rooms']:
   for o in r['objects']:p['pluginManifest'].setdefault(o['type'],'1.0.0')
 out=folder/'deadline-network.json';out.write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
 print('NETWORK_AUTHORED',[(c['id'],len(c['rooms']),len(c['connections'])) for c in p['courses']])
if __name__=='__main__':main()
