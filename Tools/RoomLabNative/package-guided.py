"""Package an already built guided edition locally; never alter previous deliveries."""
import hashlib
import json
import shutil
import wave
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT.parent / '交付/DDL-引导与多存档本地版-20261107'
CAMPAIGNS = ('deadline-guided.json', 'deadline-network.json', 'deadline-rework.json', 'deadline-night.json')
SOURCE = ROOT / 'Assets/StreamingAssets/RoomLabNative/Campaign'
RUNTIME = BUILD / 'RoomLabPhysics_Data/StreamingAssets/RoomLabNative/Campaign'
REPORTS = ROOT / 'Validation/Native/Guided20261107'
DOCUMENTS = (
    ('Handoff/CUSTOM_ASSETS_GUIDED_20261107.txt', '自定义资产与关卡规范.txt'),
    ('Handoff/GUIDED_CUSTOMIZATION_ADDENDUM.txt', '新增存档与引导规范.txt'),
    ('Handoff/GUIDED_20261107.md', '设计与测试/引导与经典存档设计.md'),
    ('Handoff/NETWORK_RESOURCE_20261107.md', '设计与测试/沿用路径网络与资源设计.md'),
    ('Handoff/REWORK_ART_SOURCES_20261107.json', '设计与测试/沿用美术来源.json'),
    ('Assets/RoomLabNative/Resources/DiegeticFont/OFL.txt', '字体许可/霞鹜文楷-OFL.txt'),
    ('Assets/StreamingAssets/RoomLabNative/Licenses/FusionPixel-OFL.txt', '字体许可/FusionPixel-OFL.txt'),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    assert BUILD.resolve().parent == (ROOT.parent / '交付').resolve()
    assert BUILD.name == 'DDL-引导与多存档本地版-20261107'
    # Check the whole build/document contract before writing any delivery content.
    # A missing executable is a clear pre-build state, never a successful package.
    required = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    required += [SOURCE / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS]
    required += [ROOT / source for source, _ in DOCUMENTS]
    required += [REPORTS / 'LevelChecks/REPORT.md', REPORTS / 'LevelChecks/data-contract.json',
                 REPORTS / 'LevelChecks/Math/results.json', REPORTS / 'LevelChecks/Water/results.json',
                 REPORTS / 'LevelChecks/WaterCollections/results.json']
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit('GUIDED_PACKAGE_NOT_READY: 请先完成 Unity 构建与报告，再运行打包。缺少：\n' + '\n'.join(missing))
    for name in CAMPAIGNS:
        if digest(SOURCE / name) != digest(RUNTIME / name):
            raise SystemExit('GUIDED_PACKAGE_STALE_BUILD: 运行时关卡与当前源码不一致：' + name)

    campaign = json.loads((SOURCE / CAMPAIGNS[0]).read_text(encoding='utf-8'))
    if campaign['nativeCampaign'].get('guided') is not True:
        raise SystemExit('GUIDED_PACKAGE_INVALID: 新关卡没有启用 guided 规则')
    rooms = sum(len(c['rooms']) for c in campaign['courses'])
    connections = sum(len(c['connections']) for c in campaign['courses'])
    relics = sum(o['type'] == 'common.collectible' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    flags = sum(o['type'] == 'common.checkpoint' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    if (rooms, connections, relics, flags) != (32, 69, 35, 67):
        raise SystemExit('GUIDED_PACKAGE_REVIEW_REQUIRED: 房间/连接/藏品/旗数与本轮合同不符')

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
    for source, destination in DOCUMENTS:
        shutil.copy2(ROOT / source, BUILD / destination)
    report_paths = []
    for path in sorted(REPORTS.rglob('*')):
        relative = path.relative_to(REPORTS)
        if not path.is_file() or path.suffix.lower() not in ('.json', '.md') or any(part.lower() in ('bin', 'obj') for part in relative.parts):
            continue
        target = BUILD / '设计与测试/验收' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        report_paths.append(target)

    (BUILD / '关卡导入/把关卡放这里.txt').write_text(
        '把 RoomLab 2.5.5 / 3.0 导出的 JSON 或 ZIP 放在这里。\n'
        '用键盘 Arrow 方向键连续输入 ↑↑↓↓←→←→ 打开隐藏开发页，再点“替换导入”选择文件；W/A/S/D 不代替这组按键。\n'
        '带图片建议用 ZIP。原 Demo/示例、教程、恢复内置大关和导入规则切换也在隐藏开发页。\n'
        '新试玩版使用 deadline-guided.json；其余三份历史 JSON 单独保留。\n'
        '编辑器能保留扩展字段，不表示它模拟了全部资源、改路与存档规则；请在本 Unity 试玩程序复测。\n', encoding='utf-8-sig')
    readme = f'''DDL · 截止之前 — 本地试玩版

双击 RoomLabPhysics.exe。三章、{rooms} 个房间、{relics} 件可选藏品，{flags} 处存档旗。
想先看本轮改动：作业待办→第二章或第三章→新游戏。之前的试玩版仍在相邻交付目录。

默认 A/D 移动，空格跳，左 Shift 水平冲刺，S 蹲下，E 交互，Esc 暂停，M 地图，R 从存档点重来。实际键位以设置为准。
高数和水课站在门前按 E 切房；门上方会写明将去的地方。物理保留原出口方式。
先把眼前的一段走明白：前向支路会随进度展开，走过的空间会出现新的回路。
场景提示短暂出现；想再看当前要做的事，可以打开暂停页。

碰到旗子，会自动打开经典存档选择界面。三章共用 6 个手动槽，自己选一格保存。
选已占用的槽会先询问是否覆盖；取消不改写原存档和原检查点。
暂停和主菜单都可选槽读取。暂停里的“从上个存档点开始”用于当前一局的快速重试。
旧版个人存档保留，不会被新槽改写；手动槽与自动继续记录各自独立。

水课的咖啡 +30、讲义 -30，每份只能按 E 用一次。清醒度在右上角独立显示，外侧图案表示状态。
清醒度和剩余道具随身跨房，不会通过进出门补满。读档/重试会恢复保存时的资源与机关状态。
不必一直清醒：困一点也能看到别的路。先决定这份道具用在哪里，走错了可以从上一存档点重来。
藏品由主助手领取；接通可选终端后，带它经过藏品，给它留一点跟上来的空间。

M 打开地图，两种模式都会暂停。当前全景显示所在房间；沿途总图显示已探索房间和走过的连接。
水课总图会列出已知房间剩余的咖啡、讲义数量，不透露未到房间的库存。
地图可即时切换，设置里可选默认模式；地图不能传送。

替换素材：从资产模板复制同名文件到自定义资产/images 或 audio，保持尺寸/格式后重启，无需口令。
本轮关卡源文件是 deadline-guided.json；network、rework、night 三份历史版本同时保留。
字体、布景、程序图案和导入扩展字段规范见“自定义资产与关卡规范.txt”。
设计者入口：用键盘 Arrow 方向键连续输入 ↑↑↓↓←→←→ 打开隐藏开发页，W/A/S/D 不代替这组按键。
替换导入、原 Demo/示例、教程、恢复内置大关和导入规则切换集中在隐藏页；正常游玩不需要打开它。
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
            lines += [room['name'], room['notes'], room['nativeCampaign'].get('objective', '')]
            for edge in course['connections']:
                if edge['from']['roomId'] != room['id']:
                    continue
                door = next(e for e in room['exits'] if e['id'] == edge['from']['exitId'])
                condition = door.get('rework', {}).get('lockedText')
                lines.append('  → ' + names[edge['to']['roomId']] + ('（尚未满足时：' + condition + '）' if condition else ''))
            lines.append('')
    (BUILD / '设计与测试/逐房流程说明.txt').write_text('\n'.join(lines), encoding='utf-8-sig')
    (BUILD / '设计与测试/测试说明.txt').write_text(
        '验收目录完整复制 Guided20261107 下的 JSON/Markdown 报告，排除 bin/obj 编译缓存，保留原目录结构。\n'
        'LevelChecks：高数与水课正常输入通路、AI 收藏、画框变清醒后回访、安全位置及数据合同。\n'
        'SaveChecks：存档确认/取消/失败/恢复等专项；以其实际报告内容为准。\n'
        '运行窗口、界面与构建结果请看各自报告；静态编译与直接放置的截图检查不证明完整通关。\n'
        '分房间状态夹具只证明该状态可走；整体首次游玩时长和新玩家是否迷路仍需试玩反馈。\n'
        '构建核验记录列出本包程序、四份运行时关卡、四份可编辑源文件及所附验收报告的 SHA-256。\n', encoding='utf-8-sig')
    manifest = {'edition': 'local-guided-20261107', 'rooms': rooms, 'directedConnections': connections,
                'collectibles': relics, 'checkpointFlags': flags, 'manualSaveSlots': 6,
                'features': ['destination-door-signs', 'known-room-resource-counts', 'staged-forward-routes', 'classic-save-choice'],
                'chapters': [{'id': c['id'], 'rooms': len(c['rooms']), 'connections': len(c['connections'])} for c in campaign['courses']],
                'images': len(catalog['images']), 'audio': len(catalog['audio']),
                'durationTargetMinutes': 30, 'firstTimeHumanDurationVerified': False, 'files': {}}
    hashed = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    hashed += [BUILD / '关卡源文件' / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS] + report_paths
    for path in hashed:
        manifest['files'][path.relative_to(BUILD).as_posix()] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    (BUILD / '构建核验记录.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('GUIDED_PACKAGE', rooms, 'rooms', relics, 'relics', flags, 'flags', 6, 'slots', len(report_paths), 'reports')


if __name__ == '__main__':
    main()
