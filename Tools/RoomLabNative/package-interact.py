"""Package an already built interaction-door edition locally; never alter previous deliveries."""
import hashlib
import json
import shutil
import wave
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT.parent / '交付/DDL-互动过门本地版-20261107'
CAMPAIGNS = ('deadline-autosave.json', 'deadline-guided.json', 'deadline-network.json', 'deadline-rework.json', 'deadline-night.json')
SOURCE = ROOT / 'Assets/StreamingAssets/RoomLabNative/Campaign'
RUNTIME = BUILD / 'RoomLabPhysics_Data/StreamingAssets/RoomLabNative/Campaign'
REPORTS = ROOT / 'Validation/Native/InteractDoors20261107'
DOCUMENTS = (
    ('Handoff/CUSTOM_ASSETS_INTERACT_20261107.txt', '自定义资产与关卡规范.txt'),
    ('Handoff/INTERACT_CUSTOMIZATION_ADDENDUM.txt', '互动过门与存档补充规范.txt'),
    ('Handoff/INTERACT_20261107.md', '设计与测试/互动过门设计.md'),
    ('Handoff/REWORK_ART_SOURCES_20261107.json', '设计与测试/沿用美术来源.json'),
    ('Assets/RoomLabNative/Resources/DiegeticFont/OFL.txt', '字体许可/霞鹜文楷-OFL.txt'),
    ('Assets/StreamingAssets/RoomLabNative/Licenses/FusionPixel-OFL.txt', '字体许可/FusionPixel-OFL.txt'),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def is_report(path):
    relative = path.relative_to(REPORTS)
    if any(part.lower().startswith(('beforeinteraction', 'source-before')) for part in relative.parts) or 'backup' in path.name.lower():
        return False
    if any(part.lower() in ('bin', 'obj', 'disk', 'disk-fixtures', 'isolated-progress', 'editorroundtrip', 'editor3', 'cache') for part in relative.parts):
        return False
    if path.suffix.lower() == '.md':
        return True
    if path.suffix.lower() != '.json':
        return False
    return len(relative.parts) == 1 or path.name in ('results.json', 'result.json', 'data-contract.json', 'frozen-integrity.json', 'autosave-runtime.json', 'campaign-runtime.json', 'guided-ui-checks.json')


def main():
    assert BUILD.resolve().parent == (ROOT.parent / '交付').resolve()
    assert BUILD.name == 'DDL-互动过门本地版-20261107'
    # Check the whole build/document contract before writing any delivery content.
    # A missing executable is a clear pre-build state, never a successful package.
    required = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    required += [SOURCE / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS]
    required += [ROOT / source for source, _ in DOCUMENTS]
    required += [REPORTS / 'Runtime/autosave-runtime.json']
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit('INTERACT_PACKAGE_NOT_READY: 请先完成 Unity 构建与报告，再运行打包。缺少：\n' + '\n'.join(missing))
    for name in CAMPAIGNS:
        if digest(SOURCE / name) != digest(RUNTIME / name):
            raise SystemExit('INTERACT_PACKAGE_STALE_BUILD: 运行时关卡与当前源码不一致：' + name)

    # An older automatic-door run must never certify this edition.
    evidence_path = REPORTS / 'Runtime/autosave-runtime.json'
    evidence = json.loads(evidence_path.read_text(encoding='utf-8-sig'))
    checks = evidence.get('checks', [])
    required_checks = {
        'door waits for interaction without saving',
        'interaction enters door without manual modal',
        'one interaction writes one destination autosave',
        'door autosave records destination room',
        'door save loads safe destination',
    }
    passed_names = {check.get('check') for check in checks if isinstance(check, dict) and check.get('pass') is True}
    if (evidence.get('doorMode') != 'interaction' or not checks or
            not all(isinstance(check, dict) and check.get('pass') is True for check in checks) or
            not required_checks.issubset(passed_names)):
        raise SystemExit('INTERACT_PACKAGE_UNVERIFIED: 本轮互动过门运行报告未完整通过')
    if evidence.get('source') != digest(SOURCE / CAMPAIGNS[0]):
        raise SystemExit('INTERACT_PACKAGE_STALE_EVIDENCE: 运行报告关卡来源与当前源码不一致')
    assembly = BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll'
    if evidence.get('runtimeAssemblySha256') != digest(assembly):
        raise SystemExit('INTERACT_PACKAGE_STALE_EVIDENCE: 运行报告并非当前构建程序集')

    campaign = json.loads((SOURCE / CAMPAIGNS[0]).read_text(encoding='utf-8'))
    if campaign['nativeCampaign'].get('saveMode') != 'contact-auto-v1' or campaign['nativeCampaign'].get('authoredCourses') != ['physics']:
        raise SystemExit('INTERACT_PACKAGE_INVALID: 自动存档或原物理关标记无效')
    asset_files = []
    for asset in campaign['assets']:
        relative = Path(asset['path'])
        if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'assets':
            raise SystemExit('INTERACT_PACKAGE_INVALID: 素材路径不安全')
        source_asset, runtime_asset = SOURCE / relative, RUNTIME / relative
        if not source_asset.is_file() or not runtime_asset.is_file() or digest(source_asset) != digest(runtime_asset):
            raise SystemExit('INTERACT_PACKAGE_STALE_BUILD: 原作者资源缺失或构建不一致：' + asset['path'])
        asset_files.append((source_asset, runtime_asset, relative))
    rooms = sum(len(c['rooms']) for c in campaign['courses'])
    connections = sum(len(c['connections']) for c in campaign['courses'])
    relics = sum(o['type'] == 'common.collectible' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    flags = sum(o['type'] == 'common.checkpoint' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    if (rooms, connections, relics, flags) != (32, 67, 27, 49):
        raise SystemExit('INTERACT_PACKAGE_REVIEW_REQUIRED: 房间/连接/藏品/旗数与本轮合同不符')

    for name in ('自定义资产/images', '自定义资产/audio', '资产模板/images', '资产模板/audio',
                 '关卡导入', '关卡源文件', '字体许可', '设计与测试/验收'):
        (BUILD / name).mkdir(parents=True, exist_ok=True)
    catalog = {'images': {}, 'audio': {}}
    for path in sorted((ROOT / 'Assets/RoomLabNative/Resources/PhysicsPixel').glob('*.png')):
        with Image.open(path) as im:
            catalog['images'][path.stem] = {'width': im.width, 'height': im.height, 'format': 'PNG', 'file': 'images/' + path.name}
        shutil.copy2(path, BUILD / '资产模板/images' / path.name)
    for path in sorted((ROOT / 'Assets/RoomLabNative/Resources/DeadlineAudio').glob('*.wav')):
        with wave.open(str(path)) as audio:
            catalog['audio'][path.stem] = {'sampleRate': audio.getframerate(), 'channels': audio.getnchannels(),
                                         'bits': audio.getsampwidth() * 8,
                                         'seconds': round(audio.getnframes() / audio.getframerate(), 5),
                                         'file': 'audio/' + path.name}
        shutil.copy2(path, BUILD / '资产模板/audio' / path.name)
    (BUILD / '资产模板/asset-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    ui = BUILD / '自定义资产/ui.json'
    if not ui.exists():
        ui.write_text(json.dumps({'title': 'DDL · 截止之前', 'ink': '#0E1624', 'paper': '#E0DEC4', 'accent': '#5E9D91'}, ensure_ascii=False, indent=2), encoding='utf-8')
    for name in CAMPAIGNS:
        shutil.copy2(SOURCE / name, BUILD / '关卡源文件' / name)
    for source_asset, _, relative in asset_files:
        destination = BUILD / '关卡源文件' / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_asset, destination)
    for source, destination in DOCUMENTS:
        shutil.copy2(ROOT / source, BUILD / destination)
    report_paths = []
    for path in sorted(REPORTS.rglob('*')):
        relative = path.relative_to(REPORTS)
        if not path.is_file() or not is_report(path):
            continue
        target = BUILD / '设计与测试/验收' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        report_paths.append(target)

    (BUILD / '关卡导入/把关卡放这里.txt').write_text(
        '把 RoomLab 2.5.5 / 3.0 导出的 JSON 或 ZIP 放在这里。\n'
        '用键盘 Arrow 方向键连续输入 ↑↑↓↓←→←→ 打开隐藏开发页，再点“替换导入”选择文件；W/A/S/D 不代替这组按键。\n'
        '带图片建议用 ZIP。原主题示例、教程、恢复内置大关和导入规则切换也在隐藏开发页。原11房物理已是默认第一章。\n'
        '新试玩版使用 deadline-autosave.json；与它同目录的 assets/ 下9份SVG必须一并保留。其余四份历史 JSON 单独保留。\n'
        '编辑器能保留扩展字段，不表示它模拟了全部资源、改路与存档规则；请在本 Unity 试玩程序复测。\n', encoding='utf-8-sig')
    readme = f'''DDL · 截止之前 — 互动过门本地试玩版

双击 RoomLabPhysics.exe。三章、{rooms} 个房间、{relics} 件可选藏品，{flags} 处存档旗。
第一章恢复为原作者的 11 房物理关，房间、机关、参数与素材保留原样；后两章继续沿用已打磨的路径。
每个背景重复出现的两处杂物和字条已经移除。之前的试玩版仍在相邻交付目录。

默认 A/D 移动，空格跳，左 Shift 水平冲刺，S 蹲下，E 交互，Esc 暂停，M 地图，R 从存档点重来。实际键位以设置为准。
三章的门都要走到门内按交互键才进入，默认 E；只是经过门口不会传送，也不会生成过门自动档。
门上方会写明将去的地方，靠近时会短暂提示交互键。进入后自动保存目标房间入口；不必先走离来路门再返回。
先把眼前的一段走明白：前向支路会随进度展开，走过的空间会出现新的回路。
场景提示短暂出现；想再看当前要做的事，可以打开暂停页。

碰到旗子只会自动保存，不打断游戏；站着不动不会反复刷档。自动记录保留最近 3 份，三章共用。
在旗子旁按 E 才打开 6 格手动存档，选已占用的格子会先询问是否覆盖；取消不会覆盖手动档。
主菜单和暂停读档页可切换“自动 / 手动”。自动三份历史和手动六槽各自独立。
本版沿用上一自动存档版的关卡来源、设置与存档目录，已有六槽和三份自动历史可继续读；旧程序留在相邻目录。
暂停里的“从上个存档点开始”用于当前一局的快速重试。

水课的咖啡 +30、讲义 -30，每份只能按 E 用一次。清醒度在右上角独立显示，外侧图案表示状态。
清醒度和剩余道具随身跨房，不会通过进出门补满。读档/重试会恢复保存时的资源与机关状态。
不必一直清醒：困一点也能看到别的路。先决定这份道具用在哪里，走错了可以从上一存档点重来。
藏品由主助手领取；接通可选终端后，带它经过藏品，给它留一点跟上来的空间。

M 打开地图，两种模式都会暂停。当前全景显示所在房间；沿途总图显示已探索房间和走过的连接。
水课总图会列出已知房间剩余的咖啡、讲义数量，不透露未到房间的库存。
地图可即时切换，设置里可选默认模式；地图不能传送。

替换素材：从资产模板复制同名文件到自定义资产/images 或 audio，保持尺寸/格式后重启，无需口令。
本轮关卡源文件是 deadline-autosave.json，同目录 assets/ 下的 9 份原作者 SVG 是它的配套资源。
guided、network、rework、night 四份历史版本同时保留；导入本轮 JSON 时请连同 assets/ 一起复制，或从编辑器导出 ZIP。
字体、布景、程序图案和导入扩展字段规范见“自定义资产与关卡规范.txt”。
设计者入口：用键盘 Arrow 方向键连续输入 ↑↑↓↓←→←→ 打开隐藏开发页，W/A/S/D 不代替这组按键。
替换导入、原主题示例、教程、恢复内置大关和导入规则切换集中在隐藏页；正常游玩不需要打开它。
“设计与测试”含逐房意图和解法，想先自己探索可以暂时不看。

约 30 分钟是首次探索目标，尚未真人首次计时校准；自动熟路通路检查不能证明体验时长。
验收范围与结果见“设计与测试/验收”中的原始报告。源码：{ROOT}。
全部保留本地，未上传 GitHub 或关卡云端。
'''
    (BUILD / '开始前读我.txt').write_text(readme, encoding='utf-8-sig')
    lines = ['本轮路径与房间意图（含解法）', '连接仍保留，前向分支按阶段开放；返程门不另加锁。', '']
    for course in campaign['courses']:
        lines.append('【' + course['name'] + '】')
        names = {r['id']: r['name'] for r in course['rooms']}
        for room in course['rooms']:
            lines += [room['name'], room.get('notes', ''), room.get('nativeCampaign', {}).get('objective', '')]
            for edge in course['connections']:
                if edge['from']['roomId'] != room['id']:
                    continue
                door = next(e for e in room['exits'] if e['id'] == edge['from']['exitId'])
                condition = door.get('rework', {}).get('lockedText')
                lines.append('  → ' + names[edge['to']['roomId']] + ('（尚未满足时：' + condition + '）' if condition else ''))
            lines.append('')
    (BUILD / '设计与测试/逐房流程说明.txt').write_text('\n'.join(lines), encoding='utf-8-sig')
    (BUILD / '设计与测试/测试说明.txt').write_text(
        '验收目录仅复制 InteractDoors20261107 本轮的 JSON/Markdown 报告并保留目录结构；不带源码备份、测试存档、隔离进度或编译缓存。\n'
        'Runtime/autosave-runtime.json：真实Windows程序存读档界面、资源加载与门互动专项。门测试直接放到门内，先验证不按不会进入，再验证按交互键进入并保存，不冒充整关路线完成。\n'
        'CoreChecks：三章门互动、门口物件优先、旗自动与手动、历史恢复等专项；以各报告实际覆盖为准。旧自动门版的通过数字不作为本轮结论。\n'
        '打包前比对运行报告中的关卡与程序集SHA-256，必须对应当前包内文件。\n'
        '运行窗口、界面与构建结果请看各自报告；静态编译与直接放置的截图检查不证明完整通关。\n'
        '分房间状态夹具只证明该状态可走；整体首次游玩时长和新玩家是否迷路仍需试玩反馈。\n'
        '构建核验记录列出本包程序、五份运行时关卡、五份可编辑源文件、9份配套SVG及所附验收报告的 SHA-256。\n', encoding='utf-8-sig')
    manifest = {'edition': 'local-interact-20261107', 'rooms': rooms, 'directedConnections': connections,
                'collectibles': relics, 'checkpointFlags': flags, 'manualSaveSlots': 6, 'automaticHistoryCount': 3,
                'authoredCourses': ['physics'], 'authoredSvgAssets': len(asset_files),
                'features': ['authored-physics-preserved', 'contact-autosave', 'interaction-required-doors', 'removed-repeated-background-props', 'destination-door-signs', 'known-room-resource-counts', 'staged-forward-routes'],
                'chapters': [{'id': c['id'], 'rooms': len(c['rooms']), 'connections': len(c['connections'])} for c in campaign['courses']],
                'images': len(catalog['images']), 'audio': len(catalog['audio']),
                'durationTargetMinutes': 30, 'firstTimeHumanDurationVerified': False, 'files': {}}
    hashed = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    hashed += [BUILD / destination for _, destination in DOCUMENTS]
    hashed += [BUILD / name for name in ('开始前读我.txt', '关卡导入/把关卡放这里.txt', '设计与测试/逐房流程说明.txt', '设计与测试/测试说明.txt', '资产模板/asset-catalog.json')]
    hashed += [BUILD / '关卡源文件' / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS] + report_paths
    hashed += [BUILD / '关卡源文件' / relative for _, _, relative in asset_files] + [runtime_asset for _, runtime_asset, _ in asset_files]
    for path in hashed:
        manifest['files'][path.relative_to(BUILD).as_posix()] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    (BUILD / '构建核验记录.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('INTERACT_PACKAGE', rooms, 'rooms', relics, 'relics', flags, 'flags', 6, 'slots', len(report_paths), 'reports')


if __name__ == '__main__':
    main()
