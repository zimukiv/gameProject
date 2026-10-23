"""Static Level1 route and serialized wiring checks; does not simulate Unity collision."""
from pathlib import Path
import math
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / 'Assets/Scenes/Level1.unity'
raw = SCENE.read_text(encoding='utf-8-sig')
parts = re.split(r'(?m)^--- !u!(\d+) &(\d+)\n', raw)
docs = {int(parts[i+1]): (int(parts[i]), parts[i+2]) for i in range(1,len(parts),3)}
assert len(docs) == (len(parts)-1)//3, 'Duplicate scene file IDs'
objects = {}
for go,(kind,body) in docs.items():
    if kind != 1: continue
    name = re.search(r'^  m_Name: (.*)$',body,re.M)[1]
    objects[name] = (go,[int(i) for i in re.findall(r'component: \{fileID: (\d+)\}',body)])

def comp(name,kind=None,script=None):
    return next((i,docs[i][1]) for i in objects[name][1]
                if (kind is None or docs[i][0] == kind) and (script is None or f'Assembly-CSharp::{script}\n' in docs[i][1]))

def value(body,key):
    return re.search(rf'^  {re.escape(key)}: (.*)$',body,re.M)[1]

def vector(body,key):
    return tuple(float(x) for x in re.findall(r'[xyz]: ([\d.-]+)',value(body,key)))

def bounds(name):
    _,tr = comp(name,4)
    x,y,_ = vector(tr,'m_LocalPosition')
    w,h,_ = vector(tr,'m_LocalScale')
    return x-w/2,y-h/2,x+w/2,y+h/2

checks = 0
def check(ok,message):
    global checks
    assert ok,message
    checks += 1

# Every scene-local reference must resolve; GUID references point to external assets.
for _,body in docs.values():
    for match in re.finditer(r'\{fileID: (\d+)\}',body):
        ref = int(match[1])
        check(ref == 0 or ref in docs, f'Dangling local reference {ref}')
roots = [int(i) for i in re.findall(r'fileID: (\d+)',docs[9223372036854775807][1])]
check(len(roots) == len(set(roots)), 'Duplicate root transforms')
actual_roots = {i for i,(k,b) in docs.items() if k in (4,224) and '  m_Father: {fileID: 0}\n' in b}
check(set(roots) == actual_roots, 'Scene root list must match root transforms')

a_id,a = comp('Thermal controller A',script='ThermalControllerBlock')
_,b = comp('Thermal controller B',script='ThermalControllerBlock')
check(value(b,'linkedController') == f'{{fileID: {a_id}}}', 'B must link to A')
check(value(a,'currentState') == value(b,'currentState') == '1', 'Room starts hot')
check(value(a,'terminalName') == 'A' and value(b,'terminalName') == 'B', 'Terminal names')
ice_names = ['Ice step 1','Ice step 2','Ice step 3','Ice wall']
ice_ids = {comp(name,script='IceBlock')[0] for name in ice_names}
refs = {int(i) for i in re.findall(r'^  - \{fileID: (\d+)\}$',a,re.M)}
check(refs == ice_ids, 'Root controls exactly the three steps and wall')
ax,ay,_ = vector(comp('Thermal controller A',4)[1],'m_LocalPosition')
for name in ice_names:
    _,ice = comp(name,script='IceBlock')
    _,collider = comp(name,61)
    check(value(ice,'isMelted') == '1' and value(collider,'m_Enabled') == '0', f'{name} starts melted')
    x,y,_ = vector(comp(name,4)[1],'m_LocalPosition')
    check(math.hypot(x-ax,y-ay) < float(value(a,'controlRadius')), f'{name} in control range')

permanent = ['Start ground','Middle ground','Physics upper ledge','Physics return floor','Finish ground','Chase platform']
for name in ['Thermal controller A','Thermal controller B','Room 2 checkpoint','Room 3 checkpoint','AI activation device','Exit']:
    x,y,_ = vector(comp(name,4)[1],'m_LocalPosition')
    check(any(l+.3 < x < r-.3 and 0 <= y-top <= 1.5 for l,_,r,top in map(bounds,permanent)), f'{name} on permanent safe ground')
for name in ['Thermal controller A','Thermal controller B']:
    check(value(comp(name,61)[1],'m_IsTrigger') == '1', f'{name} cannot block walking')

_,player = comp('Player',script='PlayerController')
speed = float(value(player,'moveSpeed'))
jump = float(value(player,'jumpVelocity'))
gravity = float(value(comp('Player',50)[1],'m_GravityScale')) * 9.81
max_rise = jump*jump/(2*gravity)
route = ['Start ground','Ice step 1','Ice step 2','Ice step 3','Physics upper ledge']
for source,target in zip(route,route[1:]):
    l1,_,r1,top1 = bounds(source)
    l2,_,r2,top2 = bounds(target)
    rise = top2-top1
    check(rise < max_rise*.8, f'{source} -> {target} vertical margin')
    flight = (jump+math.sqrt(jump*jump-2*gravity*rise))/gravity
    # Account for player width and a short running takeoff, rather than center-to-center spacing.
    check(max(0,l2-r1)+.8 < speed*flight*.8, f'{source} -> {target} horizontal margin')
check(bounds('Physics upper ledge')[3]-bounds('Start ground')[3] > max_rise,
      'Hot room upper ledge cannot be reached by an ordinary ground jump')
floor_top = bounds('Physics upper ledge')[3]
wall_bottom,wall_top = bounds('Ice wall')[1],bounds('Ice wall')[3]
ceiling_bottom = bounds('Physics ceiling')[1]
check(abs(wall_bottom-floor_top) < .001 and abs(wall_top-ceiling_bottom) < .001, 'Ice wall closes the corridor')
check(ceiling_bottom-floor_top > 2, 'Corridor has headroom')
check(bounds('Physics ceiling')[3]-floor_top > max_rise, 'Ordinary jump cannot clear ceiling')
check(bounds('Physics upper ledge')[2] == bounds('Physics return floor')[0], 'Upper ledge meets downstream landing floor')
check(bounds('Physics return floor')[2] == bounds('Finish ground')[0], 'Downstream floor has no new gap')
gate_x = vector(comp('Ice wall',4)[1],'m_LocalPosition')[0]
ai_x = vector(comp('AI activation device',4)[1],'m_LocalPosition')[0]
goal_x = vector(comp('Exit',4)[1],'m_LocalPosition')[0]
check(gate_x < ai_x < goal_x, 'Temperature lesson precedes AI activation and exit')
_,camera = next((i,b) for i,(k,b) in docs.items() if k == 114 and 'Assembly-CSharp::CameraFollow\n' in b)
check(vector(camera,'maxBounds')[0] >= goal_x, 'Camera covers moved exit')

# Vent lesson: no moving ceiling, a forgiving landing, and a deliberate chase start.
check('Moving platform' not in objects and 'Moving start' not in objects and 'Moving end' not in objects,
      'Moving platform and obsolete waypoints removed from physics lesson')
_,vent = comp('Air vent',script='AirVentBlock')
vent_x = vector(comp('Air vent',4)[1],'m_LocalPosition')[0]
_,device = comp('AI activation device',script='AIActivatorDevice')
check(value(device,'autoActivateOnContact') == '0' and value(device,'showInteractionGuide') == '1',
      'AI requires manual interaction and has a visible guide')
for name in ['Room 2 checkpoint','Room 3 checkpoint']:
    check(value(comp(name,script='Checkpoint')[1],'useFlagVisual') == '1', f'{name} uses a flag')
cp_x = vector(comp('Room 3 checkpoint',4)[1],'m_LocalPosition')[0]
landing_left,_,landing_right,landing_top = bounds('Chase platform')
ground_top = bounds('Finish ground')[3]
check(cp_x < vent_x < landing_left < ai_x < landing_right, 'Checkpoint, vent, landing, AI flow')
launch = float(value(vent,'upwardForce'))
rise = landing_top-ground_top
check(rise > max_rise and launch*launch/(2*gravity) > rise+.6, 'Vent reaches a platform above normal jump height')
entry_x = bounds('Air vent')[0]-.4
front_time = (landing_left-.4-entry_x)/speed
check(launch*front_time-gravity*front_time*front_time/2 > rise+.3, 'Holding right clears the front edge without head collision')
landing_time = (launch+math.sqrt(launch*launch-2*gravity*rise))/gravity
landing_x = entry_x+speed*landing_time
check(landing_left+.6 < landing_x < landing_right-.6, 'Holding right lands with horizontal margin')
check(landing_left > bounds('Air vent')[2]+.4, 'Vent has an open vertical shaft')
_,rail = comp('Railgun',61)
check(value(rail,'m_IsTrigger') == '1', 'Railgun entry cannot block walking')
rail_x = vector(comp('Railgun',4)[1],'m_LocalPosition')[0]
touchdown_x = landing_right+speed*math.sqrt(2*rise/gravity)
check(bounds('Railgun')[0]-.4 > touchdown_x+.2, 'Runway allows landing before entering railgun')
check(ai_x < rail_x < goal_x, 'Railgun follows deliberate AI activation')

# Shared dash HUD updates are allowed; other levels' world geometry must remain unchanged.
for scene_name in ('MainMenu','Level2','Level3'):
    relative = f'Assets/Scenes/{scene_name}.unity'
    saved = subprocess.check_output(['git','show',f'HEAD:{relative}'],cwd=ROOT)
    current = (ROOT/relative).read_bytes()
    def world_geometry(data):
        chunks = re.split(r'(?m)^--- !u!(\d+) &(\d+)\n',data.decode('utf-8-sig').replace('\r\n','\n'))
        return {chunks[i+1]:chunks[i+2] for i in range(1,len(chunks),3) if int(chunks[i]) in (4,50,61)}
    check(world_geometry(saved) == world_geometry(current), f'{scene_name} world geometry untouched')
    if scene_name != 'MainMenu':
        check(b'm_Name: Dash status' in current and b'm_Name: Dash 1' not in current and b'm_Name: Dash 2' not in current,
              f'{scene_name} has one charge slot and progress caption')
print(f'Temperature route audit passed: {checks} serialized-reference and layout checks; max normal jump rise {max_rise:.2f} m.')
print('This is static validation, not a Unity Play Mode result. Dash shortcuts and actual contact response need playtesting.')
