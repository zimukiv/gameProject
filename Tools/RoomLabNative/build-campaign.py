"""Author the local Deadline Night campaign in the public RoomLab v2 format.
No original project, save or editor source is overwritten.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Assets/StreamingAssets/RoomLabNative/Campaign'
OUT.mkdir(parents=True, exist_ok=True)
TITLES = {
 'physics':['门禁之后','借风上楼','冷藏的草稿','电磁捷径','上供协议','别急着甩开它','熄灯前的取样','实验报告提交'],
 'calculus':['空白页上的路','积分搭桥','求导开门','折线不是直线','坐标里的捷径','回头补一个证明','最后一行演算','数学作业提交'],
 'slacker':['周五最后一节','一杯续命咖啡','三个名字','助手也要到场','五站全勤','梦里的近路','下课铃响之前','把今晚还给自己']}
STORIES = {
 'physics':['教师：今晚提交实验报告。手机：电量足够，算力另算。','你：楼梯呢？AI：经费都买喷气装置了。','AI：冷的时候能站，热的时候能穿过去。别把自己也融了。','你：这真的是实验室，不是游乐园？','AI：全部 Token，换一个会追着你催稿的助手。','AI：青色预警后我会过载。冲出去，再趁我散热带路。','你：都快交了，还捡这些？AI：那是实验记录，不是垃圾。','教师：收到。下一门的通知已经在手机里了。'],
 'calculus':['教师：过程也要交。AI：看来只交答案不行。','AI：踩下积分板，零散的砖会找到自己的位置。','你：求导能把门拆开？AI：至少在这张纸上可以。','AI：这次分两段走。看轨迹，别只盯终点。','AI：坐标入口与出口相连。落点发光时记得让路。','你：这一页漏了。AI：带我回去，我来收。','AI：最后一个等号，不要急着跨过去。','教师：演算收到。请不要在水课睡过头。'],
 'slacker':['教师：今天随机签到。你：这句话好像每周都说。','AI：咖啡只能让你清醒一小会儿。','你：签一次不够？AI：三个不同的站，三个不同的借口。','AI：这次得等我靠近。代签也需要现场证据。','教师：五站全勤。你：这课怎么比实验课还忙？','AI：梦里的路很软，签到记录是真的。','你：铃声响了！AI：先把最后一份笔记带上。','提交成功。手机终于安静了。你和助手沿着走廊回宿舍。']}

def make_room(kind, idx):
    rid=f'night-{kind}-{idx+1:02}'
    # Short introductory rooms, then three-pass rooms with substantial routes.
    widths=[54,76,96,112,128,144,136,160]
    w=widths[idx]; floors=[7,17,27] if idx>0 else [7,17]
    rows=floors[-1]+5; tiles={}; objs=[]; mov=[]; zones=[]; branches=[]; serial=0
    def tile(x,y):
        if 0<=x<w and 0<=y<rows:tiles[(x,y)]={'x':x,'y':y}
    def obj(t,x,y,params=None,collision=False,mode='none',name=None,**kw):
        nonlocal serial
        serial+=1;o={'id':f'{rid}-o{serial:03}','type':t,'name':name or t,'notes':'','x':x,'y':y,'w':1,'h':1,'collision':collision,'params':params or {},'trigger':{'mode':mode,'once':False,'requiresAI':False,'distance':6,'cooldown':1},'resetPolicy':'checkpoint','assetOverrides':{}}
        o.update(kw);objs.append(o);return o
    def pad(t,x,y,params=None,**kw):return obj(t,x,y,params,True,'foot',**kw)
    def checkpoint(x,y):return obj('common.checkpoint',x,y-1,mode='region',name='刷卡存档')
    # Zig-zag descent: broad fall landings, distinct passing lanes, no invisible walls.
    route=[]
    for lane,y in enumerate(floors):
        direction=1 if lane%2==0 else -1
        lo=0 if lane==len(floors)-1 else (0 if direction==1 else 4)
        hi=w if lane==len(floors)-1 else (w-4 if direction==1 else w)
        for x in range(lo,hi):tile(x,y)
        start=3 if direction==1 else w-3
        checkpoint(start,y);checkpoint(w//2,y)
        route.append({'lane':lane,'floor':y,'direction':direction,'from':start,'to':w-2 if direction==1 else 1})
        # A readable token line teaches the intended direction and feeds the dash stock.
        for x in range(8,w-9,9):obj('common.small',x,y-1)
        if idx>0:
            for x in range(19,w-14,23):
                # One-tile vaults, with generous approach/recovery space.
                tile(x,y-1)
                if kind!='slacker' and idx>=4 and lane==len(floors)-1 and (x//23)%2:obj('common.spike',x+5,y-1,{'direction':'up'})
        if kind=='physics':
            if idx in (1,4,6,7):
                x=w//3 if direction==1 else w*2//3
                # Jet rises into a reward arc; low road remains a forgiving recovery path.
                pad('physics.jet',x,y,{'direction':'up','force':680,'launchX':0,'launchY':-680,'range':4,'affectAI':True,'cooldown':1.6})
                for dx in range(2,7):tile(x+direction*dx,y-4)
                obj('common.coin',x+direction*4,y-5)
            if idx in (2,5,6,7):
                x=w//2+8;zid=f'{rid}-zone{lane}';zones.append({'id':zid,'x':x,'y':y-5,'w':12,'h':6,'initial':'cold'})
                pad('physics.thermal',x-3,y,{'zoneId':zid,'mode':'toggle','initialState':'cold','cooldown':1})
                for dx in range(8):
                    tiles.pop((x+dx,y),None)
                    obj('physics.ice',x+dx,y,{'zoneId':zid,'meltAfter':1.3,'respawnDelay':2.5,'friction':1.4},True)
                    # A lower catch tray avoids trapping a player who toggles hot.
                    tile(x+dx,y+2)
                tiles.pop((x+8,y),None);tile(x+8,y+1)
                tiles.pop((x-1,y),None);tile(x-1,y+1)
            if idx in (3,7):
                x=10 if direction==1 else w-12
                rail=pad('physics.rail',x,y,{'acceleration':1300,'maxSpeed':620,'launchAngle':-18 if direction==1 else -162,'allowExit':True,'sideTrigger':True,'cooldown':2,'length':10})
                rail['params']['path']=[{'id':rail['id']+'-n0','parentId':rail['id'],'x':x+.5,'y':y},{'id':rail['id']+'-n1','parentId':rail['id'],'x':x+.5+direction*10,'y':y-1}]
        if kind=='calculus':
            x=w//3 if direction==1 else w*2//3
            trigger=pad('calculus.integral' if (lane+idx)%2==0 else 'calculus.derivative',x,y,{'once':idx<3,'cooldown':1})
            # A staircase assembles to an optional observation deck. Later rooms use build11's two-leg motion.
            for k in range(5):
                bx=x+direction*(5+k);by=y-5;targety=y-1-min(k//2,2)
                path=[{'x':bx,'y':targety,'seconds':.65+k*.08,'mode':'smooth'}]
                if idx>=3:path=[{'x':bx+direction*3,'y':by,'seconds':.65,'mode':'easeIn'},{'x':bx+direction*3,'y':targety,'seconds':.85,'mode':'easeOut'}]
                mov.append({'id':f'{rid}-brick{lane}-{k}','x':bx,'y':by,'targetX':path[-1]['x'],'targetY':targety,'padId':trigger['id'],'collision':True,'motionPath':path,'brickGroup':f'{rid}-group{lane}','assetOverrides':{}})
            # The main route has a two-block gate: activating the board opens it.
            # Its vertical path is separate from the optional staircase but shares the explicit pad binding.
            for k in range(2):
                gx=x+direction*12;gy=y-1-k
                mov.append({'id':f'{rid}-gate{lane}-{k}','x':gx,'y':gy,'targetX':gx,'targetY':gy-4,'padId':trigger['id'],'collision':True,'motionPath':[{'x':gx,'y':gy-4,'seconds':1.0,'mode':'smooth'}],'brickGroup':f'{rid}-gate{lane}','assetOverrides':{}})
            if idx>=4:
                routeid=f'{rid}-portal{lane}';entryx=w//2-8;exitx=w//2+8
                obj('common.portalIn',entryx,y-1,{'routeId':routeid});obj('common.portalOut',exitx,y-1,{'routeId':routeid})
        if kind=='slacker':
            if idx>=1 and idx not in (2,3,4,7):
                for x in (w//3,w*2//3):pad('slacker.awake',x,y,{'speed':430,'lift':180,'cooldown':2})
            # Five distinct stations in room 5; regular rooms have one per lane.
            if idx in (2,3,4,7):
                xs=[14,w-14] if idx==4 and lane<2 else [12 if lane%2==0 else w-13]
                for x in xs:
                    station=pad('slacker.checkin',x,y,{'cooldown':1},name='课堂签到站')
                    if idx==3:station['trigger']['requiresAI']=True
        # One collectible per lane in late rooms; lead the AI along the upper shelf.
        if idx>=4:
            cx=w*2//3 if direction==1 else w//3;cy=y-4
            for bx in range(cx-13,cx+14):tiles.pop((bx,y-1),None)
            objs[:]=[o for o in objs if not(o["type"]=="common.spike" and abs(o["x"]-cx)<14 and o["y"]==y-1)]
            # Approach the far end, then reverse onto the staircase: the main road goes underneath.
            # The AI must be led back along this deliberate detour to claim the research note.
            branches.append({"floor":y,"direction":direction,"x":cx,"steps":[[cx+direction*10,y-1],[cx+direction*7,y-2]]+[[cx+direction*dx,y-3] for dx in range(4,7)]})
            tile(cx+direction*10,y-1);tile(cx+direction*7,y-2)
            for dx in range(4,7):tile(cx+direction*dx,y-3)
            obj('common.coin',cx+direction*7,y-3)
            obj('common.collectible',cx+direction*5,cy,name=['实验记录','演算草稿','满勤贴纸'][['physics','calculus','slacker'].index(kind)]+f' {idx+1}-{lane+1}')
    chase=idx>=4 or kind=='slacker' and idx==3
    if chase:
        obj('common.aiStartHollow',7,floors[0]-1,{'once':True},mode='region',name='论文助手终端')
        # Also at the final landing, so a skipped terminal can never soft-lock the room.
        obj('common.aiStartHollow',w-8,floors[-1]-1,{'once':True},mode='region',name='备用助手终端')
    # Keep approach/landing space around teaching pads; a hurdle must not make the player sail over a required trigger.
    for o in objs:
        if o['type'] in ('calculus.integral','calculus.derivative','slacker.checkin','physics.thermal','physics.jet'):
            for tx in range(o['x']-6,o['x']+7):tiles.pop((tx,o['y']-1),None)
    for zone in zones:
        floor=zone['y']+5
        for tx in range(zone['x']-2,zone['x']+12):tiles.pop((tx,floor-1),None)
    for branch in branches:
        for bx,by in branch["steps"]:tile(bx,by)
    endx=w-3 if (len(floors)-1)%2==0 else 2
    needed=sum(o['type']=='slacker.checkin' for o in objs) if kind=='slacker' and idx in (2,3,4,7) else 0
    objective='踩过所有签到站，再去提交口' if needed else '高处藏品：走到阶梯末端，折返带 AI 上去；也可直达提交口' if chase else '沿 Token 学习机关，抵达下一间教室'
    r={'id':rid,'name':f'{idx+1:02} · {TITLES[kind][idx]}','notes':STORIES[kind][idx], 'cols':w,'rows':rows,'phase':'fast' if chase else 'slow','aiId':None,'aiPolicy':'inherit' if chase else 'off','environment':'cold','graph':{'x':idx*240,'y':0},'playCamera':{'mode':'follow','cols':24,'rows':14},'tiles':list(tiles.values()),'objects':objs,'movables':mov,'zones':zones,'entries':[{'id':rid+'-entry','name':'入口','x':2,'y':6,'face':1}],'exits':[{'id':rid+'-exit','name':'提交口','x':endx,'y':floors[-1]-2,'w':2,'h':2}], 'nativeCampaign':{'objective':objective,'requireAI':chase,'checkins':needed,'route':route,'branchRoutes':branches,'targetSeconds':[40,65,75,85,100,100,95,110][idx]}}
    return r

p={'version':2,'id':'deadline-night-v1','name':'DDL · 截止之前','notes':'独立初期流程；原作者 Demo 保留。目标首次体验约30分钟，实际以试玩为准。','compatibility':{'runtime':'2.5.5'},'settings':{'tileSize':32,'maxDashes':3,'paidStockCap':1,'freeDashOnLand':True,'performance':{'speed':220,'jump':400,'gravity':1500,'maxFall':900,'dashSpeed':850,'dashTime':.22,'dashDeceleration':2100,'coyote':.1,'buffer':.12}},'assets':[],'blockDefaults':{},'pluginManifest':{},'nativeCampaign':{'id':'deadline-night-v1','edition':'local-20261107','targetMinutes':30},'courses':[]}
for kind,label in [('physics','实验报告'),('calculus','最后一页演算'),('slacker','周五的签到')]:
    rooms=[make_room(kind,i) for i in range(8)];edges=[]
    for a,b in zip(rooms,rooms[1:]):edges.append({'id':a['id']+'-link','from':{'roomId':a['id'],'exitId':a['exits'][0]['id']},'to':{'roomId':b['id'],'entryId':b['entries'][0]['id']},'velocity':'reset'})
    p['courses'].append({'id':'night-'+kind,'name':label,'kind':kind,'aiId':kind+'-assistant','notes':'截止之前 · 本地初期游戏','defaultSize':{'cols':120,'rows':32},'artBindings':{},'rooms':rooms,'connections':edges})
    for r in rooms:
        for o in r['objects']:p['pluginManifest'][o['type']]='2.0.0' if o['type'] in ('physics.jet','physics.rail') else '1.0.0'
(OUT/'deadline-night.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'CAMPAIGN_AUTHORED courses=3 rooms=24 connections=21 objects={sum(len(r["objects"]) for c in p["courses"] for r in c["rooms"])}')
