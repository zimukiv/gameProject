"""Package an already built autosave edition locally; never alter previous deliveries."""
import hashlib
import json
import shutil
import wave
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT.parent / '交付/DDL-自动存档与原物理关本地版-20261107'
CAMPAIGNS = ('deadline-autosave.json', 'deadline-guided.json', 'deadline-network.json', 'deadline-rework.json', 'deadline-night.json')
SOURCE = ROOT / 'Assets/StreamingAssets/RoomLabNative/Campaign'
RUNTIME = BUILD / 'RoomLabPhysics_Data/StreamingAssets/RoomLabNative/Campaign'
REPORTS = ROOT / 'Validation/Native/AutoSave20261107'
DOCUMENTS = (
    ('Handoff/CUSTOM_ASSETS_AUTOSAVE_20261107.txt', '自定义资产与关卡规范.txt'),
    ('Handoff/AUTOSAVE_CUSTOMIZATION_ADDENDUM.txt', '自动存档与原物理关补充规范.txt'),
    ('Handoff/AUTOSAVE_20261107.md', '设计与测试/自动存档与原物理关设计.md'),
    ('Handoff/NETWORK_RESOURCE_20261107.md', '设计与测试/沿用路径网络与资源设计.md'),
    ('Handoff/REWORK_ART_SOURCES_20261107.json', '设计与测试/沿用美术来源.json'),
    ('Assets/RoomLabNative/Resources/DiegeticFont/OFL.txt', '字体许可/霞鹜文楷-OFL.txt'),
    ('Assets/StreamingAssets/RoomLabNative/Licenses/FusionPixel-OFL.txt', '字体许可/FusionPixel-OFL.txt'),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def is_report(path):
    relative = path.relative_to(REPORTS)
    if any(part.lower() in ('bin', 'obj', 'disk', 'disk-fixtures', 'isolated-progress', 'editorroundtrip', 'editor3', 'cache') for part in relative.parts):
        return False
    if path.suffix.lower() == '.md':
        return True
    if path.suffix.lower() != '.json':
        return False
    return len(relative.parts) == 1 or path.name in ('results.json', 'result.json', 'data-contract.json', 'frozen-integrity.json', 'autosave-runtime.json', 'campaign-runtime.json', 'guided-ui-checks.json')


def main():
    assert BUILD.resolve().parent == (ROOT.parent / '交付').resolve()
    assert BUILD.name == 'DDL-自动存档与原物理关本地版-20261107'
    # Check the whole build/document contract before writing any delivery content.
    # A missing executable is a clear pre-build state, never a successful package.
    required = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    required += [SOURCE / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS]
    required += [ROOT / source for source, _ in DOCUMENTS]
    required += [REPORTS / 'LevelChecks/REPORT.md', REPORTS / 'LevelChecks/data-contract.json',
                 REPORTS / 'LevelChecks/Physics/results.json',
                 REPORTS / 'LevelChecks/Math/results.json', REPORTS / 'LevelChecks/Water/results.json',
                 REPORTS / 'LevelChecks/WaterCollections/results.json']
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit('AUTOSAVE_PACKAGE_NOT_READY: 请先完成 Unity 构建与报告，再运行打包。缺少：\n' + '\n'.join(missing))
    for name in CAMPAIGNS:
        if digest(SOURCE / name) != digest(RUNTIME / name):
            raise SystemExit('AUTOSAVE_PACKAGE_STALE_BUILD: 运行时关卡与当前源码不一致：' + name)

    campaign = json.loads((SOURCE / CAMPAIGNS[0]).read_text(encoding='utf-8'))
    if campaign['nativeCampaign'].get('saveMode') != 'contact-auto-v1' or campaign['nativeCampaign'].get('authoredCourses') != ['physics']:
        raise SystemExit('AUTOSAVE_PACKAGE_INVALID: 自动存档或原物理关标记无效')
    asset_files = []
    for asset in campaign['assets']:
        relative = Path(asset['path'])
        if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'assets':
            raise SystemExit('AUTOSAVE_PACKAGE_INVALID: 素材路径不安全')
        source_asset, runtime_asset = SOURCE / relative, RUNTIME / relative
        if not source_asset.is_file() or not runtime_asset.is_file() or digest(source_asset) != digest(runtime_asset):
            raise SystemExit('AUTOSAVE_PACKAGE_STALE_BUILD: 原作者资源缺失或构建不一致：' + asset['path'])
        asset_files.append((source_asset, runtime_asset, relative))
    rooms = sum(len(c['rooms']) for c in campaign['courses'])
    connections = sum(len(c['connections']) for c in campaign['courses'])
    relics = sum(o['type'] == 'common.collectible' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    flags = sum(o['type'] == 'common.checkpoint' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    if (rooms, connections, relics, flags) != (32, 67, 27, 49):
        raise SystemExit('AUTOSAVE_PACKAGE_REVIEW_REQUIRED: 房间/连接/藏品/旗数与本轮合同不符')

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
    readme = f'''DDL · 截止之前 — 本地试玩版

双击 RoomLabPhysics.exe。三章、{rooms} 个房间、{relics} 件可选藏品，{flags} 处存档旗。
第一章恢复为原作者的 11 房物理关，房间、机关、参数与素材保留原样；后两章继续沿用已打磨的路径。
每个背景重复出现的两处杂物和字条已经移除。之前的试玩版仍在相邻交付目录。

默认 A/D 移动，空格跳，左 Shift 水平冲刺，S 蹲下，E 交互，Esc 暂停，M 地图，R 从存档点重来。实际键位以设置为准。
高数和水课落地走到门槛便自动过门、保存目标入口，不用按 E；可跳过暂时不想进入的侧门。
门上方会写明将去的地方。刚到房间时，须先走离来路门口再折返，避免被连续送回；物理保留原出口接触方式。
先把眼前的一段走明白：前向支路会随进度展开，走过的空间会出现新的回路。
场景提示短暂出现；想再看当前要做的事，可以打开暂停页。

碰到旗子只会自动保存，不打断游戏；站着不动不会反复刷档。自动记录保留最近 3 份，三章共用。
在旗子旁按 E 才打开 6 格手动存档，选已占用的格子会先询问是否覆盖；取消不会覆盖手动档。
主菜单和暂停读档页可切换“自动 / 手动”。自动三份历史和手动六槽各自独立，旧版个人存档保留。
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
        '验收目录仅复制 AutoSave20261107 的 JSON/Markdown 报告并保留目录结构；不带测试存档、隔离进度、编译缓存或编辑器重复关卡。\n'
        'LevelChecks：原物理参数与正常输入逐帧对照、喷气首门，高数与水课通路、AI收藏、画框回访、安全位置及数据合同。\n'
        'CoreChecks：自动历史轮换、手动确认/取消、失败/恢复、门槛与返回保护等专项；以其实际报告内容为准。\n'
        '运行窗口、界面与构建结果请看各自报告；静态编译与直接放置的截图检查不证明完整通关。\n'
        '分房间状态夹具只证明该状态可走；整体首次游玩时长和新玩家是否迷路仍需试玩反馈。\n'
        '构建核验记录列出本包程序、五份运行时关卡、五份可编辑源文件、9份配套SVG及所附验收报告的 SHA-256。\n', encoding='utf-8-sig')
    manifest = {'edition': 'local-autosave-20261107', 'rooms': rooms, 'directedConnections': connections,
                'collectibles': relics, 'checkpointFlags': flags, 'manualSaveSlots': 6, 'automaticHistoryCount': 3,
                'authoredCourses': ['physics'], 'authoredSvgAssets': len(asset_files),
                'features': ['authored-physics-preserved', 'contact-autosave', 'threshold-contact-doors', 'removed-repeated-background-props', 'destination-door-signs', 'known-room-resource-counts', 'staged-forward-routes'],
                'chapters': [{'id': c['id'], 'rooms': len(c['rooms']), 'connections': len(c['connections'])} for c in campaign['courses']],
                'images': len(catalog['images']), 'audio': len(catalog['audio']),
                'durationTargetMinutes': 30, 'firstTimeHumanDurationVerified': False, 'files': {}}
    hashed = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    hashed += [BUILD / '关卡源文件' / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS] + report_paths
    hashed += [BUILD / '关卡源文件' / relative for _, _, relative in asset_files] + [runtime_asset for _, runtime_asset, _ in asset_files]
    for path in hashed:
        manifest['files'][path.relative_to(BUILD).as_posix()] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    (BUILD / '构建核验记录.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('AUTOSAVE_PACKAGE', rooms, 'rooms', relics, 'relics', flags, 'flags', 6, 'slots', len(report_paths), 'reports')


if __name__ == '__main__':
    main()
