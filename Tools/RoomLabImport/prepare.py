"""Convert a RoomLab v2 project into Unity JsonUtility-friendly import data.
Usage: python Tools/RoomLabImport/prepare.py project.json [--asset-root PATH]
The original project is never modified. Each import gets its own hash directory.
"""
import argparse, copy, hashlib, json, math, shutil
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUPPORTED = {'common.coin','common.small','common.collectible','common.spike',
             'common.aiStart','common.aiStartHollow','common.portalIn','common.portalOut',
             'physics.jet','physics.ice','physics.thermal','physics.rail'}
DEFAULTS = {
 'physics.jet':dict(launchX=0,launchY=-900,force=900,direction='up',cooldown=1),
 'physics.rail':dict(acceleration=2400,maxSpeed=900,launchAngle=-60,allowExit=True,cooldown=2),
 'physics.thermal':dict(mode='toggle',zoneId='',initialState='inherit'),
 'physics.ice':dict(meltAfter=5,respawnDelay=1,friction=1.4),
 'common.portalIn':dict(routeId='route-1'), 'common.portalOut':dict(routeId='route-1')}

def convert(source, asset_root=None):
 raw=source.read_bytes(); project=json.loads(raw.decode('utf-8-sig'))
 if project.get('version')!=2 or project.get('settings',{}).get('tileSize')!=32:
  raise ValueError('Only RoomLab v2 / tileSize 32 is supported')
 sha=hashlib.sha256(raw).hexdigest()
 dest=ROOT/'Assets/RoomLabImports'/('import-'+sha[:12])
 if dest.exists():
  if (dest/'source-project.json').read_bytes()!=raw: raise ValueError('Existing import differs')
  print(dest/'project.unity.json'); return dest
 rooms=[]; warnings=[]; seen=set(); connections=[]
 def identity(value):
  if not value or value in seen: raise ValueError('Missing/duplicate ID: '+str(value))
  seen.add(value)
 for course in project['courses']:
  if course.get('kind')!='physics': raise ValueError('Only physics courses supported')
  for room in course['rooms']:
   identity(room['id'])
   if room.get('movables'): raise ValueError('Legacy movables require a dedicated adapter')
   r={k:copy.deepcopy(room.get(k,[])) for k in ['entries','exits','zones']}
   r.update(id=room['id'],name=room['name'],cols=room['cols'],rows=room['rows'],
       environment=room.get('environment','cold'),phase=room.get('phase','inherit'),
       aiPolicy=room.get('aiPolicy','inherit'),tiles=[],objects=[])
   if not r['entries']: raise ValueError('Room has no entry: '+r['name'])
   for tile in room['tiles']:
    r['tiles'].append(dict(x=tile['x'],y=tile['y'],collision=tile.get('collision',True)))
   for item in r['entries']+r['exits']+r['zones']: identity(item['id'])
   for obj in room['objects']:
    identity(obj['id']); kind=obj['type']
    if kind not in SUPPORTED: raise ValueError('Unsupported object: '+kind)
    p=copy.deepcopy(DEFAULTS.get(kind,{}))
    p.update(project.get('blockDefaults',{}).get(kind,{}).get('params',{}));p.update(obj.get('params',{}))
    if kind=='physics.rail' and len(p.get('path',[]))<2:
     warnings.append(r['name']+': incomplete rail '+obj['id']+' has fewer than two nodes; imported disabled')
    if kind=='physics.jet' and ('direction' in obj.get('params',{}) or 'force' in obj.get('params',{})):
     dx,dy={'up':(0,-1),'down':(0,1),'left':(-1,0),'right':(1,0),'custom':(0,0)}[p['direction']]
     if p['direction']!='custom': p['launchX'],p['launchY']=dx*p['force'],dy*p['force']
    normalized={k:copy.deepcopy(obj.get(k)) for k in ['id','type','x','y']}
    normalized.update(name=obj.get('name',kind),w=obj.get('w',1),h=obj.get('h',1),
       collision=obj.get('collision',kind not in ['common.coin','common.small','common.collectible','common.spike','common.aiStartHollow','common.portalIn','common.portalOut']),
       config=p,trigger=obj.get('trigger',{}),sourceJson=json.dumps(obj,ensure_ascii=False))
    r['objects'].append(normalized)
    if obj.get('resetPolicy','checkpoint')!='checkpoint': warnings.append(r['name']+': '+obj['id']+' uses Unity checkpoint reset instead of '+obj['resetPolicy'])
   rooms.append(r)
   out_routes={o['config'].get('routeId') for o in r['objects'] if o['type']=='common.portalOut'}
   for o in r['objects']:
    if o['type']=='common.portalIn' and o['config'].get('routeId') not in out_routes:
     warnings.append(r['name']+': unmatched AI portal '+o['id']+'; imported inactive')
  connections.extend(copy.deepcopy(course.get('connections',[])))
 byroom={r['id']:r for r in rooms}
 for wire in connections:
  a,b=wire['from'],wire['to']
  if a['roomId'] not in byroom or b['roomId'] not in byroom: raise ValueError('Broken room connection')
  if not any(e['id']==a['exitId'] for e in byroom[a['roomId']]['exits']) or not any(e['id']==b['entryId'] for e in byroom[b['roomId']]['entries']): raise ValueError('Broken port connection')
 # Reject nonfinite values and geometry outside authored room bounds.
 def finite(v):
  if isinstance(v,float) and not math.isfinite(v): raise ValueError('Nonfinite project number')
  if isinstance(v,dict):
   for item in v.values(): finite(item)
  elif isinstance(v,list):
   for item in v: finite(item)
 finite(project)
 for r in rooms:
  if not (1<=r['cols']<=256 and 1<=r['rows']<=256): raise ValueError('Invalid room size')
  for item in r['tiles']+r['objects']+r['entries']+r['exits']+r['zones']:
   if item['x']<0 or item['y']<0 or item['x']+item.get('w',1)>r['cols'] or item['y']+item.get('h',1)>r['rows']:
    raise ValueError('Out of bounds: '+r['name']+'/'+str(item.get('id',item)))
 assets=[]
 for a in project.get('assets',[]):
  rel=Path(a['path'])
  if rel.is_absolute() or '..' in rel.parts or ':' in a['path'] or '\\' in a['path']: raise ValueError('Unsafe asset path')
  candidates=[source.parent/rel]
  if asset_root: candidates.append(asset_root/rel)
  actual=next((p for p in candidates if p.is_file()),None)
  if actual is None: warnings.append('Missing source asset: '+a['path'])
  else: assets.append((actual,rel))
 dest.mkdir(parents=True)
 (dest/'source-project.json').write_bytes(raw)
 for actual,rel in assets:
  target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(actual,target)
 normalized=dict(importVersion=1,sourceSha256=sha,projectName=project['name'],rooms=rooms,connections=connections)
 (dest/'project.unity.json').write_text(json.dumps(normalized,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 report=dict(source=str(source),sourceSha256=sha,rooms=len(rooms),tiles=sum(len(r['tiles']) for r in rooms),
  objects=sum(len(r['objects']) for r in rooms),types=dict(Counter(o['type'] for r in rooms for o in r['objects'])),
  connections=len(connections),sourceAssetsCopied=len(assets),warnings=warnings,
  adaptations=['Unity player movement, horizontal single-slot dash and AI/token rules retained',
   'Ice uses existing temperature-controlled solidity; standing melt timers are retained only in source data',
   'Thermal controls use E near the terminal',
   'Rails retain all route nodes but use current horizontal release and jump controls',
   'Unconnected exits end a room test; they do not auto-unlock the main campaign',
   'Source SVGs retained; Unity uses colored placeholder sprites until art is rasterized/bound'])
 (dest/'import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False)); print(dest/'project.unity.json')
 return dest

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('project',type=Path);parser.add_argument('--asset-root',type=Path)
 args=parser.parse_args();convert(args.project.resolve(),args.asset_root)
