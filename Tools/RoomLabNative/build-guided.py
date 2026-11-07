"""Guided edition: fewer initial choices, deeper local reuse. Never rewrites the network edition."""
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'Assets/StreamingAssets/RoomLabNative/Campaign/deadline-network.json'
OUT=SOURCE.with_name('deadline-guided.json')

def build_guided(source):
 p=copy.deepcopy(source)
 p['name']='DDL · 先把这一段走明白'
 p['nativeCampaign'].update(guided=True,network=True,edition='local-guided-20261107')
 p['notes']='主路分段展开，支路仍可折返；存档旗打开独立存档栏。'
 for c in p['courses']:c['id']='guided-'+c['kind']
 def rooms(c):return {int(r['id'][-2:]):r for r in c['rooms']}
 def exit_to(c,r,target):
  edge=next(e for e in c['connections'] if e['from']['roomId']==r['id'] and e['to']['roomId'].endswith(f'-{target:02}'))
  return next(e for e in r['exits'] if e['id']==edge['from']['exitId'])
 def gate(c,r,target,signals,message):
  e=exit_to(c,r,target);m=e.setdefault('rework',{});m.setdefault('signals',{}).update(signals);m['lockedText']=message
  e['guidedSideDoor']=True
 def flag(r,x,floor):
  ident=r['id']+'-guided-checkpoint-'+str(x)+'-'+str(floor)
  r['objects'].append({'id':ident,'type':'common.checkpoint','name':'歇一会儿','x':x,'y':floor-1,'w':1,'h':1,'collision':False,'params':{},'trigger':{'mode':'region','once':False,'requiresAI':False,'distance':5,'cooldown':1},'resetPolicy':'checkpoint','assetOverrides':{}})
 def platform(r,tag,x,y,w,h=1,**kw):
  r['nativeCampaign']['platforms'].append({'id':r['id']+'-guided-'+tag,'x':x,'y':y,'w':w,'h':h,**kw})
 def prose(r,story,objective,hint,arrival=None):
  r['notes']=story;r['nativeCampaign']['objective']=objective;r['nativeCampaign']['softHint']=hint
  if arrival:r['nativeCampaign']['arrivalHint']=arrival
 math=next(c for c in p['courses'] if c['kind']=='calculus');m=rooms(math)
 math['name']='高数 · 先写下一步'
 # Remove redundant flags only three steps apart now that contact opens a save dialog.
 for n in (2,9):m[n]['objects']=[o for o in m[n]['objects'] if not(o['type']=='common.checkpoint' and o['x']==4)]
 gate(math,m[2],5,{'beta':True},'先去隔页补上β，这边的夹层才接得起来。')
 gate(math,m[3],7,{'beta':True},'地下通道还没通。先把楼上的β带回来。')
 gate(math,m[4],8,{'gamma':True},'这页先留着。把阁楼的γ写完再来。')
 gate(math,m[6],8,{'gamma':True},'先看看阁楼中间那块γ。')
 # Completing the climb folds its feet away: the same volume becomes a ground return.
 for q in m[6]['nativeCampaign']['platforms']:
  if q.get('x')==12 and q.get('y')==31:q.update(toY=2,signal='gamma',seconds=.65)
  elif q.get('x')==14 and q.get('y')==30:q.update(toY=30.5,h=.5,signal='gamma',seconds=.65)
 m[6]['nativeCampaign']['progressHint']='楼梯脚收起来了。回程可以走下面。'
 for n,x,y in [(1,33,17),(3,44,18),(5,30,20),(7,28,15),(9,37,16)]:flag(m[n],x,y)
 prose(m[1],'作业还剩一页，楼也快锁门了。先把断掉的这段路接上。','这间先做一件事：走到积分板旁，把纸桥接到对面。','那块α就在楼梯上面。','先上楼梯，看看那块α。')
 prose(m[2],'怎么又回这层了。好在刚才写的步骤，还真能变成路。','先从西侧去隔页找β。回来后再去纸库找γ，两段接上就能到提交台。','先认准门牌上的隔页室；其他门稍后再说。','先去隔页室，把β带回来。')
 prose(m[3],'这张纸一展开，楼梯就有了。反面还写着同一道题。','先沿α上楼去隔页。拿到β后，下层联络道也值得回来看看。','上层那扇门通往隔页室。')
 prose(m[4],'隔壁传来桌椅挪动的声音。看来这一步没白写。','踩下β，从旁边的门回中庭；证明廊先不急。','β旁边的门，回去就是中庭上层。')
 prose(m[5],'这纸堆底下居然还有夹层。平时找教材都没这么认真。','站上α纸页去夹层，从上面打开封板，再沿地面去阁楼。','那张宽纸页能站人。别跳走，等它一下。')
 prose(m[6],'爬上来才发现，提交台就在隔壁。还好没再绕一整栋。','写下γ。低处的台阶会收起，回程有短路，提交台也接通了。','γ在高台上；完成后看看脚下那条路。')
 prose(m[7],'先翻桌子，再钻桌底。至少这次没有白折腾。','这是两条主路之间的近道。先从上面过去，再把下层打通。','右边的δ能把下面腾出来。')
 prose(m[8],'这页不交也行。但都走到这了，留一份过程吧。','可选收藏：带助手走完上层，再打开下层近道。','先让它跟上来，再收起中间的封板。')
 prose(m[9],'文件名改成“最终版”之前，先存一下。谁知道下一页还有什么。','在上层存档，再进最后一间；前面的β和γ都要用上。','提交入口在上面，下面两扇门都能回去。','前面是最后一间，先存一下。')
 prose(m[10],'最后一行居然还得往回写。行，过程也给你。','这里要反复用同一片空间。观察刚走过的路，改写它，再找下一层。','上面走过的那段纸桥，也可能是下面的盖子。')
 # Water introduces one new record at a time; reverse edges never gain locks.
 water=next(c for c in p['courses'] if c['kind']=='slacker');w=rooms(water)
 water['name']='水课 · 先别睡过去'
 gate(water,w[2],4,{'record-haze':True},'先把黑板和投影那两页记下来，再去画框那边。')
 gate(water,w[2],8,{'record-dream':True},'点名还没开始。先找齐三页课堂记录。')
 gate(water,w[3],5,{'record-awake':True},'黑板那一行还没看清，先别急着走。')
 gate(water,w[3],9,{'record-dream':True},'讲台那边还在收材料，梦里那页也得带上。')
 gate(water,w[5],8,{'record-dream':True},'这边还没点到。先回座位，再去画框后面。')
 gate(water,w[7],8,{'record-dream':True},'纸背面的字还没记下来，先往上看看。')
 gate(water,w[7],11,{'record-dream':True},'先把这页记下来，画廊回来还能逛。')
 # A dream drawing makes the frame passage and its bridge permanent.
 water['nativeCampaign']['signals'].append('frame-sketch')
 for q in w[4]['nativeCampaign']['platforms']:
  if q.get('x')==34 and q.get('h')==8:q.update(signal='frame-sketch',toY=2,seconds=.7)
 platform(w[4],'fixed-frame',32,22,14,visibleSignal='frame-sketch',label='留在纸上的线')
 obj={'id':w[4]['id']+'-guided-sketch','type':'slacker.checkin','name':'画背面的线','x':39,'y':21,'w':1,'h':1,'collision':False,'params':{},'trigger':{'mode':'region','once':True,'requiresAI':False,'distance':5,'cooldown':1},'resetPolicy':'checkpoint','assetOverrides':{},'rework':{'band':'dream','signal':'frame-sketch','message':'画过的线没消失。回来时也能走了。','label':'一笔'}}
 w[4]['objects'].append(obj)
 dreamdoor=exit_to(water,w[4],7);dreamdoor['x']=44;dreamdoor['rework']={'signal':'frame-sketch','lockedText':'画的背面有一小块空白。'}
 # The photo leaves a stable return across the projection, even when awareness changes later.
 platform(w[5],'recorded-projection',24,23,16,visibleSignal='record-haze',label='留影')
 w[4]['nativeCampaign']['progressHint']='这条线留下来了。下次回来，也能从画框穿过去。'
 w[5]['nativeCampaign']['progressHint']='投影拍到了。回座位，去画框后面看看。'
 for n,x,y in [(3,36,30),(4,30,22),(5,40,23),(7,41,30),(8,45,30),(11,25,23)]:flag(w[n],x,y)
 prose(w[1],'半杯咖啡，一份没看完的讲义。离下课还有一会儿。','咖啡和讲义都只够用一次。先去黑板那边看清第一份记录；路过存档旗时可以先存一格。','杯子旁按E喝，喝完就没有了。','先喝口咖啡，去看看黑板。')
 prose(w[2],'明明只换了个座位，怎么像换了间教室。先把眼前这点事弄完。','先去黑板，再去投影。两份都记下后，回来从右边去画框。','楼上的门通向黑板，先从那里开始。','先去楼上的黑板那间。')
 prose(w[3],'老师擦得挺快，还剩这一行能救一下。','清醒时上去记下板书。讲义会降低清醒度，留给下一间投影用。','黑板上的台阶，得清醒一点才看得见。')
 prose(w[4],'这幅画正面看着普通，背面倒像藏了答案。','从楼上绕到画框背面，留下一笔；画过的路以后还能用。缺道具可以走地面去茶水间。','有点困的时候，也许能穿过画框。')
 prose(w[5],'灯再亮一点看不清，眼睛闭上也看不见。这个困劲儿倒是刚好。','留住投影里的记录，再回座位去画框。拍下来的桥，之后换个状态也还能走。','先走到投影里的高台，不用急着找右边的门。')
 prose(w[6],'茶水间还开着。这里这杯，最好留着真需要的时候喝。','备用咖啡和讲义各一份。想好再用；两边的门都能回到主路。','先看看地图，哪一份还留着。')
 prose(w[7],'刚才梦到老师点名了。等等，纸背面怎么真有字。','困一点才看得到纸背面的记录。右边两杯咖啡可以留给回头收集。','还没记下来就先别喝，纸背面在上面。')
 prose(w[8],'“后排那位同学。”坏了，这句听得倒是很清楚。','沿地面去讲台；上面的投影是可选收藏。困意脉冲这间只来一次，先躲开，再决定要不要折回去。','旁边还有稳当的地面，先别急着往虚线跳。')
 prose(w[9],'板书、投影、梦里的字，凑起来竟然还能对上。','三份记录齐了就上讲台。进去之前存一格，后面快下课了。','上层那扇门通向最后一段。','先存一下，后面快下课了。')
 prose(w[10],'下课铃响了，走廊里总算有人开始收书包。','不用把清醒度凑到某个数。剩多少都能走出去，稳稳走完最后这一段。','楼梯通到墙上面，出口在另一侧。')
 prose(w[11],'这间没人点名。投影还停在最后一张，逛两步也不亏。','可选收藏回廊，两端都连着主路。想拿高处那份，就留一点困意。','绕过上面这排座位，就到另一扇门。')
 # Physics traversal and its existing checkpoint cadence remain identical.
 physics=next(c for c in p['courses'] if c['kind']=='physics')
 for r in physics['rooms']:
  r['nativeCampaign'].setdefault('arrivalHint','')
 # De-emphasize obsolete exposition on switch feedback while keeping cause/effect concrete.
 for c in p['courses']:
  for r in c['rooms']:
   for o in r['objects']:
    meta=o.get('rework',{})
    if o['type'] in ('calculus.integral','calculus.derivative') and meta.get('message'):
     label=meta.get('label','纸页').replace('∫ ','').replace('d ','')
     meta['message']=label+'动了。看看刚才那条路。'
 return p

def main():
 source=json.loads(SOURCE.read_text(encoding='utf-8'))
 p=build_guided(source)
 OUT.write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
 print('GUIDED_AUTHORED',[(c['id'],len(c['rooms']),len(c['connections'])) for c in p['courses']], 'flags',sum(o['type']=='common.checkpoint' for c in p['courses'] for r in c['rooms'] for o in r['objects']))
if __name__=='__main__':main()
