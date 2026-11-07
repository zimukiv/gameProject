"""Ten-room calculus network. Importing this module has no side effects.

build_calculus(old_course) returns a detached course; callers own publication.
All route coordinates below are tile coordinates.  A floor is its top edge.
"""
from copy import deepcopy


class Room:
    def __init__(self, number, title, cols, rows, floor, graph, start=3, chase=False):
        self.id = f'network-calculus-{number:02}'
        self.serial = 0
        self.tiles = {}
        self.r = {
            'id': self.id, 'name': f'{number:02} · {title}', 'notes': '',
            'cols': cols, 'rows': rows, 'phase': 'fast' if chase else 'slow',
            'aiPolicy': 'inherit' if chase else 'off', 'environment': 'cold',
            'graph': {'x': graph[0], 'y': graph[1]},
            'playCamera': {'mode': 'follow', 'cols': 26, 'rows': 16},
            'tiles': [], 'objects': [], 'movables': [], 'zones': [],
            'artBindings': {}, 'entries': [], 'exits': [],
            'nativeCampaign': {
                'objective': '', 'softHint': '', 'switches': [],
                'platforms': [], 'patrols': [], 'signs': [],
                'awareness': 50, 'checkins': 0, 'requireAI': False,
                'walkthrough': [], 'networkRole': '',
            },
        }
        self.entry('start', start, floor)
        self.checkpoint(start + 1, floor)

    def ident(self, kind):
        self.serial += 1
        return f'{self.id}-{kind}-{self.serial:03}'

    def floor(self, x1, x2, y):
        for x in range(x1, x2):
            self.tiles[x, y] = {'x': x, 'y': y}

    def wall(self, x, y1, y2, width=1):
        for y in range(y1, y2):
            self.floor(x, x + width, y)

    def platform(self, x, y, w=1, h=1, **kwargs):
        item = {'id': self.ident('paper'), 'x': x, 'y': y, 'w': w, 'h': h}
        item.update(kwargs)
        self.r['nativeCampaign']['platforms'].append(item)
        return item

    def stairs(self, x, y, count, direction=1, **kwargs):
        for k in range(count):
            self.platform(x + 2 * direction * k, y - k, 2, 1, **kwargs)

    def object(self, kind, x, y, name=None, mode='none', collision=False, rework=None):
        item = {
            'id': self.ident('object'), 'type': kind, 'name': name or kind,
            'x': x, 'y': y, 'w': 1, 'h': 1, 'collision': collision,
            'params': {}, 'trigger': {'mode': mode, 'once': False,
                                     'requiresAI': False, 'distance': 5, 'cooldown': 1},
            'resetPolicy': 'checkpoint', 'assetOverrides': {},
        }
        if rework is not None:
            item['rework'] = rework
        self.r['objects'].append(item)
        return item

    def control(self, x, floor, key, glyph, value=True, signal=False,
                derivative=False, message=None, collision=True):
        if not signal and key not in self.r['nativeCampaign']['switches']:
            self.r['nativeCampaign']['switches'].append(key)
        return self.object(
            'calculus.derivative' if derivative else 'calculus.integral', x, floor,
            name=('求导 ' if derivative else '积分 ') + glyph, mode='foot',
            collision=collision,
            rework={('signal' if signal else 'switch'): key, 'value': value,
                    'label': ('d ' if derivative else '∫ ') + glyph,
                    'message': message or ('纸页拆开 · ' if derivative else '纸页重组 · ') + glyph})

    def checkpoint(self, x, floor):
        self.object('common.checkpoint', x, floor - 1, '存档旗', mode='region')

    def terminal(self, x, floor):
        self.object('common.aiStartHollow', x, floor - 1, '助手终端', mode='region')

    def relic(self, x, floor, name):
        self.object('common.collectible', x, floor - 1, name)

    def coins(self, points):
        for x, floor in points:
            self.object('common.small', x, floor - 1)

    def sign(self, text, x, y):
        self.r['nativeCampaign']['signs'].append({'text': text, 'x': x, 'y': y})

    def patrol(self, x1, x2, floor, speed=90):
        self.r['nativeCampaign']['patrols'].append({
            'id': self.ident('patrol'), 'speed': speed,
            'nodes': [{'x': x1, 'y': floor - .45}, {'x': x2, 'y': floor - .45}]})

    def entry(self, label, x, floor, face=1):
        ident = f'{self.id}-in-{label}'
        self.r['entries'].append({'id': ident, 'name': label, 'x': x,
                                  'y': floor - 1, 'face': face})
        return ident

    def exit(self, label, x, floor, name, rework=None):
        ident = f'{self.id}-out-{label}'
        item = {'id': ident, 'name': name, 'x': x, 'y': floor - 2, 'w': 2, 'h': 2}
        if rework is not None:
            item['rework'] = rework
        self.r['exits'].append(item)
        return ident

    def waypoints(self, *points):
        self.r['nativeCampaign']['walkthrough'] += [
            {'x': p[0], 'floor': p[1], **(p[2] if len(p) > 2 else {})} for p in points]

    def finish(self, story, objective, hint, role='loop'):
        self.r['notes'] = story
        self.r['tiles'] = list(self.tiles.values())
        self.r['nativeCampaign'].update(objective=objective, softHint=hint, networkRole=role)
        return self.r


def build_calculus(old_course):
    rooms = []
    by_number = {}

    def add(number, room, story, objective, hint, role='loop'):
        rooms.append(room.finish(story, objective, hint, role))
        by_number[number] = room

    # 01: a real lower recovery loop leads back to the initial stair foot.
    r = Room(1, '等号的另一端', 40, 28, 24, (-420, 340), start=1)
    r.floor(0, 40, 24)
    r.stairs(3, 23, 7)
    r.floor(17, 20, 17)
    r.floor(32, 40, 17)
    r.control(18, 17, 'intro-alpha', 'α', message='α · 空白正在连成纸桥')
    r.platform(20, 4, 12, 1, toY=17, switch='intro-alpha', seconds=.25, label='α')
    r.coins([(7, 21), (15, 17), (25, 17)])
    r.entry('hub', 33, 17, -1)
    r.exit('hub', 36, 17, 'α 中庭')
    r.sign('α', 25, 14)
    r.waypoints(*[(3 + 2*k, 23-k) for k in range(7)], (18, 17), (36, 17))
    add(1, r, '断开的等号下面，还有一条能回来的路。',
        '沿纸阶找到积分板，观察空白如何连到另一端。', '桥下能回到来路。', 'entry')

    # 02: beta supplies the climb; gamma supplies both the missing span and the shutter.
    r = Room(2, '演算中庭', 58, 39, 35, (0, 0))
    r.floor(0, 58, 35)
    for k in range(10):
        r.platform(18+2*k, 3, 2, 1, toY=34-k, signal='beta', label='β' if k == 0 else '')
    r.floor(38, 42, 25)
    r.floor(52, 58, 25)
    r.platform(42, 5, 10, 1, toY=25, signal='gamma', seconds=.3, label='γ')
    r.platform(44, 13, 2, 13, toY=0, signal='gamma', seconds=.3, label='γ')
    for label, x, floor, face in [('intro', 5, 35, 1), ('alpha', 14, 35, 1),
                                  ('paper', 49, 35, -1), ('beta', 38, 25, 1),
                                  ('gamma', 38, 35, -1), ('submit', 53, 25, -1)]:
        r.entry(label, x, floor, face)
    r.exit('intro', 1, 35, '↶ 等号')
    r.exit('alpha', 10, 35, 'α 西庭')
    r.exit('paper', 54, 35, 'γ 折纸库')
    r.exit('beta', 39, 25, 'β 隔页', {'signal': 'beta', 'lockedText': 'β 还没有接到这里'})
    r.exit('gamma', 42, 35, 'γ 阁楼', {'signal': 'gamma', 'lockedText': 'γ 还没有从另一面展开'})
    r.exit('submit', 55, 25, 'β · γ 提交台')
    r.checkpoint(7, 35)
    r.sign('β', 28, 28)
    r.sign('γ', 48, 21)
    r.waypoints((10, 35))
    add(2, r, '两条路写在同一张纸上。隔页的β负责上行，阁楼的γ负责把余下的空白接上。',
        '探索东西两环；回到中庭时，认出自己在别处留下的路。', 'β与γ各缺一半。', 'hub')

    # 03: unfolding the vertical sheet creates the stair and opens the underpass at once.
    r = Room(3, 'α的两面', 48, 32, 28, (-350, 0))
    r.floor(0, 48, 28)
    r.control(10, 28, 'yard-alpha', 'α')
    for k in range(10):
        r.platform(21, 18+k, 2, 1, toX=14+2*k, toY=27-k,
                   switch='yard-alpha', seconds=.4, label='α' if k == 0 else '')
    r.floor(34, 45, 18)
    r.control(41, 18, 'yard-alpha', 'α', False, derivative=True,
              message='d α · 纸阶重新折成门，下面仍有回路')
    r.control(42, 28, 'yard-alpha', 'α', message='α · 从背面也能重新展开')
    r.entry('hub', 4, 28)
    r.entry('beta', 36, 18, -1)
    r.entry('underpass', 42, 28, -1)
    r.exit('hub', 1, 28, '↶ 中庭')
    r.exit('beta', 36, 18, 'β 隔页室')
    r.exit('underpass', 45, 28, 'δ 地下演算')
    r.coins([(15, 27), (25, 22), (37, 18)])
    r.sign('α', 22, 14)
    r.waypoints((10, 28), *[(14+2*k, 27-k) for k in range(10)], (37, 18))
    add(3, r, '门拆开之后成了台阶；再折起来，下层的另一条路才显得有意思。',
        '展开α上行，或从纸页背面走入地下联络道。', '同一个α，也写在背面。')

    # 04: a small courtyard with two opposed approaches, not a blind end.
    r = Room(4, 'β在隔页', 48, 33, 29, (-350, -280))
    r.floor(0, 48, 29)
    r.stairs(10, 28, 8)
    r.floor(26, 30, 21)
    r.stairs(44, 28, 8, direction=-1)
    r.control(26, 21, 'beta', 'β', signal=True,
              message='β · 中庭的纸阶已展开，隔墙的下路也接通了')
    r.platform(34, 13, 2, 16, toY=0, signal='beta', label='β')
    r.control(47, 29, 'beta', 'β', signal=True,
              message='β · 隔页背面的同一个算子')
    r.entry('alpha', 4, 29)
    r.entry('hub', 28, 21, -1)
    r.entry('gallery', 46, 29, -1)
    r.exit('alpha', 1, 29, 'α 西庭')
    r.exit('hub', 28, 21, 'β 中庭上层', {'signal': 'beta', 'lockedText': '脚边的β还没有接通'})
    r.exit('gallery', 46, 29, '◇ 证明廊')
    r.checkpoint(38, 29)
    r.sign('β', 30, 17)
    r.waypoints(*[(10+2*k, 28-k) for k in range(8)], (26, 21), (28, 21))
    add(4, r, '按下这一页的β，另一页便多出一段楼梯。也可以从证明廊绕到它背后。',
        '把β送回中庭；上层捷径、下层来路和证明廊均可回返。', '页边的β并不止写了一处。')

    # 05: a sheet is first a lift, then a bridge; the opened lower return remains usable.
    r = Room(5, '折纸库的夹层', 50, 34, 30, (350, 0), chase=True)
    r.floor(0, 50, 30)
    r.terminal(5, 30)
    r.platform(14, 30, 8, 1, toY=20, switch='store-alpha', seconds=2.8, label='α')
    r.control(17, 30, 'store-alpha', 'α', collision=False,
              message='α · 留在纸上，它会把你带到夹层')
    r.control(11, 30, 'store-alpha', 'α', False, derivative=True,
              message='d α · 纸页回到下层')
    r.floor(5, 14, 20)
    r.floor(22, 31, 20)
    r.control(27, 20, 'store-release', 'ε', derivative=True,
              message='d ε · 夹层外的封板收起，下层连向阁楼')
    r.platform(35, 12, 2, 18, toY=0, switch='store-release', label='ε')
    r.control(41, 30, 'store-release', 'ε', derivative=True,
              message='d ε · 背面也能打开夹层封板')
    r.relic(8, 20, '夹层里的旁注')
    r.relic(25, 20, '被折起来的一页')
    r.entry('hub', 3, 30)
    r.entry('underpass', 9, 30)
    r.entry('loft', 43, 30, -1)
    r.exit('hub', 1, 30, '↶ 中庭')
    r.exit('underpass', 7, 30, 'δ 地下演算')
    r.exit('loft', 46, 30, 'γ 阁楼')
    r.checkpoint(32, 30)
    r.patrol(23, 30, 30, 85)
    r.sign('α ↑', 17, 25)
    r.sign('ε', 35, 9)
    r.waypoints((5, 30, {'interact': True}), (17, 30), (24, 20), (27, 20), (32, 30), (47, 30))
    add(5, r, '书库的纸页没有消失，只是把夹层抬到了你面前。',
        '乘α进入夹层，从ε另一面打开下层通路；可带助手收两处旁注。', '纸上有可以站稳的位置。')

    # 06: one diagonal climb, a high side loop, and two distinct ground-level returns.
    r = Room(6, 'γ的阁楼', 54, 36, 32, (350, -280), chase=True)
    r.floor(0, 54, 32)
    r.stairs(12, 31, 12)
    r.floor(36, 45, 20)
    r.control(39, 20, 'gamma', 'γ', signal=True,
              message='γ · 中庭横桥展开；阁楼侧门也露出来了')
    r.platform(46, 18, 2, 14, toY=1, signal='gamma', label='γ')
    r.entry('paper', 4, 32)
    r.entry('hub', 10, 32)
    r.entry('gallery', 42, 20, -1)
    r.entry('submit', 50, 32, -1)
    r.exit('paper', 1, 32, 'ε 折纸库')
    r.exit('hub', 7, 32, 'γ 中庭下层', {'signal': 'gamma', 'lockedText': '阁楼上的γ尚未展开'})
    r.exit('gallery', 42, 20, '◇ 证明廊')
    r.exit('submit', 51, 32, 'β · γ 提交台')
    r.checkpoint(37, 20)
    r.terminal(4, 32)
    r.relic(38, 20, '阁楼的解法')
    r.patrol(24, 31, 32, 85)
    r.sign('γ', 40, 16)
    r.waypoints(*[(12+2*k, 31-k) for k in range(12)], (39, 20), (49, 32), (52, 32))
    add(6, r, '从高处看，来路、隔页和提交台终于落在同一张图上。',
        '展开γ后，可回中庭，也可从侧门接近提交台或进入证明廊。', '向下也有两条回路。')

    # 07: over the divider first; under it on subsequent trips.
    r = Room(7, '地下演算', 50, 28, 23, (0, 290), chase=True)
    r.floor(0, 50, 23)
    for k in range(8):
        r.platform(7+2*k, 22-k, 2, 1,
                   **({'toY': 2, 'switch': 'under-delta'} if k < 2 else {}))
    r.floor(23, 30, 15)
    for k in range(8):
        r.platform(30+2*k, 15+k, 2, 1,
                   **({'toY': 2, 'switch': 'under-delta'} if k >= 6 else {}))
    r.platform(21, 16, 3, 7, toY=3, switch='under-delta', label='δ')
    r.control(34, 17, 'under-delta', 'δ', derivative=True,
              message='d δ · 上面的证明，打开了下面的回路')
    r.control(0, 23, 'under-delta', 'δ', False, message='δ · 折回上层的纸阶')
    r.control(49, 23, 'under-delta', 'δ', False, message='δ · 从背面折回纸阶')
    r.entry('alpha', 4, 23)
    r.entry('paper', 46, 23, -1)
    r.exit('alpha', 1, 23, 'α 西庭背面')
    r.exit('paper', 47, 23, 'ε 折纸库')
    r.terminal(5, 23)
    r.relic(25, 15, '两页之间的批注')
    r.sign('δ', 22, 12)
    r.waypoints(*[(7+2*k, 22-k) for k in range(8)], (27, 15), (34, 17), (45, 23), (48, 23))
    add(7, r, '第一次从上面翻过去；再来时，已经可以从桌底穿过。',
        '打通两条主环之间的联络道；上行取得批注，下行缩短回程。', '分隔板下面的空白可以留下来。', 'crosslink')

    # 08: the closed lower divider makes the assistant follow the collection arch.
    r = Room(8, '请沿证明经过', 58, 35, 31, (0, -550), chase=True)
    r.floor(0, 58, 31)
    for k in range(11):
        r.platform(6+2*k, 30-k, 2, 1,
                   **({'toY': 2, 'switch': 'gallery-delta'} if k < 2 else {}))
    r.floor(28, 34, 20)
    for k in range(11):
        r.platform(54-2*k, 30-k, 2, 1,
                   **({'toY': 2, 'switch': 'gallery-delta'} if k < 2 else {}))
    r.platform(28, 20, 2, 11, toY=3, switch='gallery-delta', label='δ')
    r.control(42, 24, 'gallery-delta', 'δ', derivative=True,
              message='d δ · 下路开放，助手也能认出这条捷径')
    r.control(0, 31, 'gallery-delta', 'δ', False, message='δ · 上层证明重新折回')
    r.entry('beta', 3, 31)
    r.entry('loft', 56, 31, -1)
    r.exit('beta', 1, 31, 'β 隔页室')
    r.exit('loft', 56, 31, 'γ 阁楼')
    r.terminal(4, 31)
    r.relic(29, 20, '过程比答案多一行')
    r.relic(32, 20, '留给同伴的空白')
    r.patrol(38, 44, 31, 85)
    r.sign('◇', 30, 17)
    r.waypoints((4, 31, {'interact': True}), *[(6+2*k, 30-k) for k in range(11)],
                (31, 20), (42, 24), (56, 31), (3, 31))
    add(8, r, '答案在顶上。别太早替助手打开下路，它也会选择近路。',
        '带助手经过上层收藏，再打开下路；这条选修通道连接β与γ。', '封板留着的时候，它会沿你的证明经过。', 'optional')

    # 09: both entries are below the proof.  Entering from the loft cannot skip beta.
    r = Room(9, '提交之前', 46, 31, 27, (350, 280))
    r.floor(0, 46, 27)
    for k in range(11):
        r.platform(14+2*k, 3, 2, 1, toY=26-k, signal='beta', label='β' if k == 0 else '')
    r.floor(36, 46, 16)
    r.platform(29, 16, 2, 11, toY=2, signal='gamma', label='γ')
    r.entry('hub', 4, 27)
    r.entry('loft', 10, 27, -1)
    r.entry('final', 38, 16)
    r.exit('hub', 1, 27, '↶ 中庭')
    r.exit('loft', 7, 27, 'γ 阁楼')
    r.exit('final', 41, 16, '进入最后一行')
    r.checkpoint(12, 27)
    r.sign('β · γ', 26, 12)
    r.waypoints((12, 27), *[(14+2*k, 26-k) for k in range(11)], (42, 16))
    add(9, r, '从哪一页绕来都可以。最后的台阶仍需要两段过程。',
        '沿β纸阶穿过γ留下的空白，保存后进入最后一行。', '两段过程在这里再次接上。', 'convergence')

    # 10: alpha is the only way to beta. beta is the only way to d-alpha.
    # d-alpha opens the sealed vault roof. gamma inside the vault opens its left
    # wall and replaces the old alpha ascent with a reverse ascent to a caged exit.
    r = Room(10, '最后一行会改写', 60, 41, 37, (700, 280), start=2, chase=True)
    r.r['aiPolicy'] = 'start'
    r.r['nativeCampaign']['requireAI'] = True
    r.floor(0, 60, 37)
    r.terminal(6, 37)
    r.control(3, 37, 'final-alpha', 'α', message='α · 纸阶与井盖接成第一段路')
    for k in range(10):
        r.platform(8+2*k, 2, 2, 1, toY=36-k, switch='final-alpha',
                   seconds=.55, label='α' if k == 0 else '')
    # The roof withdraws sideways into the right gallery. A vertical withdrawal
    # would unintentionally carry a player entering the drop slot up to the ceiling.
    r.platform(46, 27, 14, 1, toX=28, switch='final-alpha', seconds=.7, label='α')
    r.floor(42, 59, 27)
    r.control(55, 27, 'final-beta', 'β', message='β · 上层向左折回，井盖的另一面在那里')
    for k in range(10):
        r.platform(51-2*k, 2, 2, 1, toY=26-k, switch='final-beta',
                   seconds=.25, label='β' if k == 0 else '')
    r.floor(20, 31, 17)
    r.control(23, 17, 'final-alpha', 'α', False, derivative=True,
              message='d α · 来时的桥撤去，中央留下可以落入的空白')
    # The drop slot is x31..33; neither the upper landing nor beta's last step covers it.
    r.platform(28, 28, 2, 9, toY=4, switch='final-gamma', label='γ')
    r.wall(41, 28, 37, 2)
    r.control(35, 37, 'final-gamma', 'γ', message='γ · 井壁拆开，第一段路反向重组')
    for k in range(10):
        r.platform(26-2*k, 0, 2, 1, toY=36-k, switch='final-gamma',
                   seconds=1.1, label='γ' if k == 0 else '')
    r.floor(0, 8, 27)
    r.floor(0, 10, 12)
    r.platform(8, 12, 2, 15, toY=0, switch='final-gamma', label='γ')
    r.checkpoint(57, 27)
    r.checkpoint(25, 17)
    r.relic(14, 30, '走回来的最后一行')
    r.patrol(44, 50, 27, 85)
    r.exit('complete', 3, 27, '提交数学作业')
    r.sign('α', 17, 30)
    r.sign('β', 48, 22)
    r.sign('d α', 24, 14)
    r.sign('γ', 35, 33)
    r.r['nativeCampaign']['orderedProof'] = [
        {'step': 'alpha', 'control': [3, 37], 'target': [55, 27]},
        {'step': 'beta', 'control': [55, 27], 'target': [23, 17]},
        {'step': 'd-alpha', 'control': [23, 17], 'drop': [31.5, 17], 'target': [35, 37]},
        {'step': 'gamma', 'control': [35, 37], 'target': [4, 27]},
    ]
    r.waypoints((6, 37, {'interact': True}), (3, 37),
                *[(8+2*k, 36-k) for k in range(10)], (55, 27),
                *[(51-2*k, 26-k) for k in range(10)], (23, 17),
                (31.5, 17), (35, 37), *[(26-2*k, 36-k) for k in range(10)], (4, 27))
    add(10, r, '纸阶变成井盖，井盖又变成入口。追在身后的助手也得重新找路。最后一行回到了起点上方。',
        '在追逐中读懂四次改写：α上行，β折返，dα入井，γ沿重组的来路提交。',
        '出口一直在那里，抵达它的过程还在纸的另一面。', 'finale')

    edges = []

    def link(a, out_label, b, in_label):
        edges.append({
            'id': f'network-calculus-link-{len(edges)+1:02}',
            'from': {'roomId': by_number[a].id, 'exitId': f'{by_number[a].id}-out-{out_label}'},
            'to': {'roomId': by_number[b].id, 'entryId': f'{by_number[b].id}-in-{in_label}'},
            'velocity': 'reset',
        })

    def pair(a, a_label, b, b_label):
        link(a, a_label, b, b_label)
        link(b, b_label, a, a_label)

    pair(1, 'hub', 2, 'intro')
    pair(2, 'alpha', 3, 'hub')
    pair(3, 'beta', 4, 'alpha')
    pair(4, 'hub', 2, 'beta')
    pair(2, 'paper', 5, 'hub')
    pair(5, 'loft', 6, 'paper')
    pair(6, 'hub', 2, 'gamma')
    pair(3, 'underpass', 7, 'alpha')
    pair(7, 'paper', 5, 'underpass')
    pair(4, 'gallery', 8, 'beta')
    pair(8, 'loft', 6, 'gallery')
    pair(2, 'submit', 9, 'hub')
    pair(6, 'submit', 9, 'loft')
    link(9, 'final', 10, 'start')

    course = deepcopy(old_course)
    course.update(id='network-calculus', name='高数 · 一纸回环', kind='calculus',
                  notes='双主环、地下联络、上层选修；终局由空间可达性约束四段改写。',
                  rooms=rooms, connections=edges, defaultSize={'cols': 48, 'rows': 32})
    course.setdefault('aiId', 'calculus-assistant')
    course['nativeCampaign'] = {
        'signals': ['beta', 'gamma'], 'network': True,
        'mainLoops': [[2, 3, 4, 2], [2, 5, 6, 2]],
        'crosslink': [3, 7, 5], 'electiveLoop': [4, 8, 6],
        'convergence': [2, 9, 10], 'optionalRooms': ['network-calculus-08'],
    }
    # Cheap structural checks deliberately do not claim normal-input playability.
    room_map = {room['id']: room for room in rooms}
    for edge in edges:
        src = room_map[edge['from']['roomId']]
        dst = room_map[edge['to']['roomId']]
        assert any(e['id'] == edge['from']['exitId'] for e in src['exits'])
        assert any(e['id'] == edge['to']['entryId'] for e in dst['entries'])
    assert len(rooms) == 10 and len(edges) == 27
    return course
