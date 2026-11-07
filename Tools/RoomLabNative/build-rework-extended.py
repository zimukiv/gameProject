"""Second loop of each course: authored spatial puzzles, plus optional collection rooms."""
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('foundation',Path(__file__).with_name('build-rework.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
Room=b.Room;p=b.p

def zone(r,name,x,y,w,h):
 r.r['zones'].append(dict(id=name,x=x,y=y,w=w,h=h,initial='cold'));return name
def ice(r,z,x,y,w=1,h=1):
 for yy in range(y,y+h):
  for xx in range(x,x+w):r.obj('physics.ice',xx,yy,{'zoneId':z,'meltAfter':20,'respawnDelay':2},collision=True)
def thermal(r,x,y,z,mode,key=None,value=True,ai=False):
 if key and key not in r.r['nativeCampaign']['switches']:r.r['nativeCampaign']['switches'].append(key)
 o=r.pad('physics.thermal',x,y,{'zoneId':z,'mode':mode,'initialState':'inherit','cooldown':1},rework={'switch':key,'value':value,'label':'暖' if mode=='hot' else '冷'} if key else {'label':'暖' if mode=='hot' else '冷'})
 o['trigger']['requiresAI']=ai
 if ai:o['trigger']['distance']=1.5;o['rework']['label']+=' · ○ ○'
 return o
def save(r,story,obj,hint):
 r.r['nativeCampaign']['softHint']=hint;return r.finish(story,obj)

extra={k:[] for k in ['physics','calculus','slacker']}
r=Room('physics',8,'冰是锁也是钥匙',48,30,26,chase=True);r.floorline(0,48,26)
z=zone(r,'thermal-lock-key',14,10,27,17);ice(r,z,23,18,h=8);ice(r,z,14,17,w=26)
r.floorline(7,14,17);r.stairs(24,25,9);r.floorline(40,47,17);thermal(r,13,26,z,'hot','thawed');thermal(r,43,17,z,'cold','refrozen',ai=True);r.relic(18,16,'冰的第二个用途');r.cp(37,26);r.patrol(30,36,26,90);r.exit(8,17,rework={'states':{'thawed':True,'refrozen':True}});r.sign('○',13,22);r.sign('○',24,14)
r.waypoint((6,26,{'interact':True}),(13,26),(24,26),*[(24+2*k,25-k) for k in range(9)],(43,17),(18,17),(9,17))
extra['physics'].append(save(r,'融化时，它让你过去；凝结时，它让你回来。','熔开下方的锁，走到右侧重结上层冰桥，再从入口上方离开。','那块冰消失以后，回来的路也少了一段。'))

r=Room('physics',9,'两间温室',54,32,28,chase=True);r.floorline(0,54,28)
za=zone(r,'greenhouse-a',15,10,10,19);zb=zone(r,'greenhouse-b',32,10,18,19);ice(r,za,19,20,h=8);ice(r,za,15,18,w=10);ice(r,zb,32,18,w=17);ice(r,zb,39,20,h=8)
thermal(r,13,28,za,'hot','a');thermal(r,28,28,zb,'hot','b');r.stairs(31,27,10);r.floorline(49,54,18);thermal(r,51,18,zb,'cold','b',False,ai=True);thermal(r,52,18,za,'cold','a',False,ai=True)
r.floorline(24,32,18);r.floorline(8,15,18);r.relic(36,17,'两间教室的温差');r.relic(17,17,'并列的实验');r.cp(44,28);r.patrol(23,26,28,85);r.exit(9,18,rework={'states':{'a':False,'b':False}});r.sign('○',19,15);r.sign('◇',36,15)
r.waypoint((6,28,{'interact':True}),(13,28),(28,28),(31,28),*[(31+2*k,27-k) for k in range(10)],(51,18),(52,18),(36,18),(29,18),(17,18),(10,18))
extra['physics'].append(save(r,'隔壁比这里暖一点。两间温室，不能只用一个答案。','逐一打开两间温室，登高后各自结桥。右桥藏着可选样本，左桥通向出口。','两枚不同的记号，各管一间温室。'))

r=Room('physics',10,'两个人的实验',48,31,27,chase=True);r.floorline(0,48,27);r.stairs(12,26,7);r.floorline(24,32,20)
z=zone(r,'shared-sample',28,10,14,18);ice(r,z,33,18,w=8);ice(r,z,28,13,w=10);r.relic(28,19,'等候的样本');thermal(r,34,27,z,'hot','open',True,ai=True);r.jet(39,27,1220);r.floorline(40,48,13);thermal(r,43,13,z,'cold','close');r.floorline(18,28,13);r.relic(31,12,'接力的另一端');r.exit(20,13,rework={'allSwitches':['open','close']});r.cp(32,27);r.patrol(16,23,27,85);r.sign('○ ○',34,24)
r.waypoint((6,27,{'interact':True}),*[(12+2*k,26-k) for k in range(7)],(28,20),(34,27),(39,27),(43,13),(31,13),(21,13))
extra['physics'].append(save(r,'这次的开关，需要两个人同时到场。','带助手走过样本台，再到热控台等待；喷流穿过融开的冰盖，冷却后折返。','台上留了两个位置。'))

r=Room('physics',11,'中途下车',44,28,24,chase=True);r.floorline(0,44,24);r.rail(12,24,36,10);r.floorline(24,31,16);r.floorline(34,44,12);r.relic(27,15,'半途的风景');r.relic(38,11,'终点之前');r.floorline(19,24,16);r.exit(20,16,'↶');r.exit(0,24,'↶');r.sign('◆',27,13);r.sign('◆',38,9);r.waypoint((6,24,{'interact':True}),(12,24),(36,12),(38,12),(27,16),(21,16))
extra['physics'].append(save(r,'选修记录：停在哪儿，比冲得多快更要紧。','两处离轨收藏；下层地面可回入口，随时返回主线。','那几块桌面，似乎是特意留下的。'))

r=Room('calculus',8,'一块纸三次用途',46,30,23);r.floorline(0,12,23);r.floorline(21,46,23);r.floorline(0,46,28);r.platform(12,23,9,1,toY=16,switch='fold',seconds=2.8,label='α');r.control(15,23,'fold',text='纸页抬起');r.floorline(21,33,16);r.platform(39,1,2,13,toY=10,switch='fold',label='α');r.control(29,16,'fold',False,derivative=True,text='纸页归位');r.platform(35,10,2,13,toY=1,switch='released',label='ε');r.control(31,16,'released',text='页角已展开');r.stairs(38,22,7,d=-1);r.cp(24,16);r.exit(41,23,rework={'states':{'fold':False,'released':True}});r.sign('α',17,14);r.exit(2,28,'↶');r.r['nativeCampaign']['recoveryExits']=[1];r.waypoint((15,23),(17,16),(24,16),(29,16),(31,16),(41,23))
extra['calculus'].append(save(r,'同一页纸，先是桥，接着是梯，最后又把路让了出来。','在纸桥上积分随桥上升；右上求导归位，再展开页角，从下路离开。','纸页动的时候，站在纸上会怎样？'))

r=Room('calculus',9,'一页两次经过',48,30,26);r.floorline(0,48,26);r.floorline(0,14,16);r.floorline(33,48,16)
for k in range(10):r.platform(29-2*k,3,2,1,toY=25-k,signal='beta2',label='β' if k==0 else '')
r.exit(43,26,'β');r.exit(3,16,'γ',{'signal':'beta2'});r.exit(42,16,'→',{'signal':'gamma2'});r.r['entries'] += [{'id':r.id+'-beta-return','name':'β','x':34,'y':25,'face':-1},{'id':r.id+'-gamma-return','name':'γ','x':35,'y':15,'face':1}];r.sign('β',42,23);r.sign('γ',5,13);r.sign('γ',40,13);r.waypoint((44,26))
extra['calculus'].append(save(r,'你记得这张纸。第二次看，它的背面也有一行。','从下门写入β；返回登阶后再从上门进入隔页，写入γ后返回提交。','β与γ，没有写在同一层。'))

r=Room('calculus',10,'隔页另一面',40,29,25,start=5);r.floorline(0,40,25);r.floorline(0,40,14);r.control(32,25,'beta2',signal=True,text='跨房连动 · β');r.control(8,14,'gamma2',signal=True,text='跨房连动 · γ');r.exit(1,25,'β ↶',{'signal':'beta2'});r.exit(36,14,'γ ↶',{'signal':'gamma2'});r.r['entries'].append({'id':r.id+'-upper','name':'γ','x':32,'y':13,'face':-1});r.sign('β',25,22);r.sign('γ',15,11);r.coins([(13,24),(21,24),(28,24),(25,13),(18,13),(11,13)]);r.waypoint((32,25),(2,25))
extra['calculus'].append(save(r,'两次笔迹，隔着一张纸。改动会在邻页留下回声。','下层写β后原路返回；上层写γ后再返回。','回声来自你刚离开的那一页。'))

r=Room('calculus',11,'请走另一边',44,29,25,chase=True);r.floorline(0,44,25);r.stairs(12,24,7);r.floorline(24,36,18);r.control(26,18,'detour',text='中间的路合上了');r.platform(22,3,2,3,toY=22,switch='detour',label='δ');r.relic(30,17,'绕行的证明');r.relic(35,17,'等待的证明');r.control(38,25,'detour',False,derivative=True,text='纸页复原');r.exit(40,25,'↶',{'switch':'detour','value':False});r.exit(0,25,'↶');r.sign('δ',22,20);r.waypoint((6,25,{'interact':True}),*[(12+2*k,24-k) for k in range(7)],(26,18),(35,18),(38,25),(41,25))
extra['calculus'].append(save(r,'选修记录：它不是沿着一条看不见的直线找你。','改变封板，让助手沿空间寻找路；带它到上层收集后，从右侧求导复原。','等它绕过来，笔记才有人收。'))

r=Room('slacker',8,'从另一面醒来',48,31,27,awake=90);r.floorline(0,48,27);r.clarity(8,27,15);r.platform(14,16,2,11,band='awake');r.platform(14,16,2,11,band='haze');r.stairs(16,26,7,band='dream');r.floorline(28,33,20);r.clarity(30,20,90);r.stairs(34,19,5,band='awake');r.floorline(42,48,15);r.clarity(44,15,50)
for x in range(18,42,4):r.platform(x,15,4,1,band='haze')
r.floorline(10,18,15);r.exit(11,15,rework={'band':'haze'});r.sign('光',29,17);r.sign('影',44,12);r.exit(0,27,'↶');r.r['nativeCampaign']['recoveryExits']=[1];r.waypoint((8,27,{'band':'dream'}),*[(16+2*k,26-k) for k in range(7)],(30,20,{'band':'awake'}),*[(34+2*k,19-k) for k in range(5)],(44,15,{'band':'haze'}),(30,15),(12,15))
extra['slacker'].append(save(r,'从下面看是墙，从另一边醒来，它成了背景。','梦里入画，醒来登高，朦胧时沿投影回到左上出口。','走到另一面，再换一个座位。'))

r=Room('slacker',9,'梦里画的桥',46,29,25,awake=90);r.floorline(0,46,25);r.clarity(8,25,15);r.platform(18,14,2,11,band='awake');r.platform(18,14,2,11,band='haze');r.stairs(22,24,6,band='dream');r.floorline(32,37,19);r.r['nativeCampaign']['switches'].append('sketch');r.pad('slacker.checkin',34,19,rework={'switch':'sketch','value':True,'band':'dream','label':'一笔'},name='梦里的涂鸦');r.clarity(40,25,90);r.platform(41,15,2,10,toY=3,switch='sketch');r.exit(43,25,rework={'switch':'sketch','band':'awake'});r.sign('画外',18,11);r.waypoint((8,25,{'band':'dream'}),*[(22+2*k,24-k) for k in range(6)],(34,19),(40,25,{'band':'awake'}),(44,25))
extra['slacker'].append(save(r,'梦里随手画下的线，醒来以后还在。','进入梦境留下涂鸦，再醒来从右侧离开；涂鸦会成为现实中的改动。','刚才画下的那一笔，没有褪色。'))

r=Room('slacker',10,'借一点困意',42,29,23,awake=70,chase=True);r.floorline(0,12,23);r.floorline(0,42,27);r.floorline(19,25,23);r.floorline(34,42,23);r.platform(12,23,7,1,band='awake');r.platform(25,23,9,1,band='haze');r.clarity(21,23,70);r.exit(38,23,rework={'band':'haze'});r.exit(2,27,'↶');r.exit(23,27,'↶');r.r['nativeCampaign']['recoveryExits']=[1,2];r.sign('一会儿就好',22,19);r.waypoint((6,23,{'interact':True}),(21,23),(24,23),(30,23,{'band':'haze'}),(39,23))
extra['slacker'].append(save(r,'它让你犯困。但这一次，那一点困意正好够用。','保持清醒通过左桥，在常驻讲台等待助手脉冲变为朦胧，沿右桥离开；咖啡可复原。','脚下的讲台一直都在，另一边的光还没亮。'))

r=Room('slacker',11,'画上没有落脚处',46,28,22,awake=90,chase=True);r.floorline(0,46,26);r.floorline(0,12,22);r.floorline(33,46,22);r.platform(12,22,21,1,band='awake');r.clarity(9,22,90);r.clarity(36,22,15);r.clarity(39,22,90);r.relic(28,21,'没有落脚处的画','dream');r.relic(31,21,'醒来以后还记得','dream');r.exit(42,22,'↶');r.exit(3,26,'↶');r.exit(36,26,'↶');r.sign('画中',22,18);r.waypoint((6,22,{'interact':True}),(9,22,{'band':'awake'}),(36,22,{'band':'dream'}),(43,22))
extra['slacker'].append(save(r,'选修记录：人要站稳，思绪却可以从没有路的地方经过。','先走清醒桥，再在右岸入梦。主助手沿留下的轨迹收取梦中藏品，随时从岸边返回。','你留下的路线，它还记得。'))

for c in p['courses']:
 kind=c['kind'];old=c['rooms'];a,z,h,side=extra[kind];byid={x['id']:x for x in old+extra[kind]};edges=c['connections']
 def link(src,ei,dst,en=0):
  edges.append({'id':f'{src["id"]}-extended-{len(edges)}','from':{'roomId':src['id'],'exitId':src['exits'][ei]['id']},'to':{'roomId':dst['id'],'entryId':dst['entries'][en]['id']},'velocity':'reset'})
 # Preserve the existing teaching sequence, then branch into the second spatial loop.
 for edge in edges:
  if edge['from']['roomId']==old[5]['id'] and edge['to']['roomId']==old[6]['id']:edge['to']={'roomId':a['id'],'entryId':a['entries'][0]['id']}
 link(a,0,z)
 if kind=='calculus':
  c['nativeCampaign']['signals']+=['beta2','gamma2'];link(z,0,h);link(h,0,z,1);link(z,1,h,1);link(h,1,z,2);link(z,2,old[6])
 else:link(z,0,h);link(h,0,old[6])
 # A small recessed side door makes the elective visible without forcing completion.
 branch=h if kind!='calculus' else z
 branch['entries'].append({'id':branch['id']+'-elective-return','name':'选修返回','x':4,'y':branch['entries'][0]['y'],'face':1})
 eid=branch['id']+'-elective';branch['exits'].append({'id':eid,'name':'◆','x':1,'y':branch['entries'][0]['y']-1,'w':1,'h':2})
 link(branch,len(branch['exits'])-1,side)
 for i in range(len(side['exits'])):link(side,i,branch,len(branch['entries'])-1)
 for room in [a,z,h]:
  for i in room['nativeCampaign'].get('recoveryExits',[]):link(room,i,room)
 c['rooms']=old[:6]+[a,z,h,side]+old[6:];old[6]['name']='结课 · '+old[6]['name'].split(' · ',1)[1]
 for i,room in enumerate(c['rooms']):room['graph']={'x':(i%6)*230,'y':(i//6)*180};room['nativeCampaign']['optional']=room==side

# Labels used in the world are brief; full instructions remain in the optional pause journal.
for c in p['courses']:
 for r in c['rooms']:
  for o in r['objects']:p['pluginManifest'][o['type']]='2.0.0' if o['type'] in ('physics.jet','physics.rail') else '1.0.0'
(b.OUT/'deadline-rework.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
print('REWORK_EXTENDED',sum(len(c['rooms']) for c in p['courses']),'rooms',sum(o['type']=='common.collectible' for c in p['courses'] for r in c['rooms'] for o in r['objects']),'collectibles')
