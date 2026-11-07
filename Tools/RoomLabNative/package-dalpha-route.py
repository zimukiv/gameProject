"""Package an already built symbol-label and weak-hint edition locally; never alter previous deliveries."""
import hashlib
import json
import shutil
import wave
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT.parent / '交付/DDL-dα下行路线修复版-20261108'
CAMPAIGNS = ('deadline-autosave.json', 'deadline-guided.json', 'deadline-network.json', 'deadline-rework.json', 'deadline-night.json')
SOURCE = ROOT / 'Assets/StreamingAssets/RoomLabNative/Campaign'
DISPLAY_COPY = ROOT / 'Assets/RoomLabNative/Resources/DisplayCopy/contact-auto.json'
RUNTIME = BUILD / 'RoomLabPhysics_Data/StreamingAssets/RoomLabNative/Campaign'
REPORTS = ROOT / 'Validation/Native/DAlphaFix20261108'
DOCUMENTS = (
    ('Handoff/CUSTOM_ASSETS_DALPHA_ROUTE_20261108.txt', '自定义资产与关卡规范.txt'),
    ('Handoff/DALPHA_ROUTE_CUSTOMIZATION_ADDENDUM.txt', '符号房名与弱提示补充规范.txt'),
    ('Handoff/DALPHA_ROUTE_20261108.md', '设计与测试/dα下行路线修复.md'),
    ('Handoff/DALPHA_ROUTE_20261108.txt', '本轮改动.txt'),
    ('Handoff/REWORK_ART_SOURCES_20261107.json', '设计与测试/沿用美术来源.json'),
    ('Assets/RoomLabNative/Resources/DiegeticFont/OFL.txt', '字体许可/霞鹜文楷-OFL.txt'),
    ('Assets/StreamingAssets/RoomLabNative/Licenses/FusionPixel-OFL.txt', '字体许可/FusionPixel-OFL.txt'),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def is_report(path):
    relative = path.relative_to(REPORTS)
    if any(part.lower().startswith(('beforeinteraction', 'beforesymbols', 'source-before')) for part in relative.parts) or 'backup' in path.name.lower():
        return False
    if any(part.lower() in ('bin', 'obj', 'disk', 'disk-fixtures', 'isolated-progress', 'editorroundtrip', 'editor3', 'cache') for part in relative.parts):
        return False
    if path.suffix.lower() == '.md':
        return True
    if path.suffix.lower() != '.json':
        return False
    return len(relative.parts) == 1 or path.name in ('results.json', 'result.json', 'data-contract.json', 'frozen-integrity.json', 'autosave-runtime.json', 'dalpha-runtime.json', 'campaign-runtime.json', 'guided-ui-checks.json')


def main():
    assert BUILD.resolve().parent == (ROOT.parent / '交付').resolve()
    assert BUILD.name == 'DDL-dα下行路线修复版-20261108'
    # Check the whole build/document contract before writing any delivery content.
    # A missing executable is a clear pre-build state, never a successful package.
    required = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    required += [SOURCE / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS]
    required += [ROOT / source for source, _ in DOCUMENTS]
    required += [REPORTS / 'Runtime/autosave-runtime.json', REPORTS / 'Runtime/dalpha-runtime.json', DISPLAY_COPY]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit('DALPHA_ROUTE_PACKAGE_NOT_READY: 请先完成 Unity 构建与报告，再运行打包。缺少：\n' + '\n'.join(missing))
    for name in CAMPAIGNS:
        if digest(SOURCE / name) != digest(RUNTIME / name):
            raise SystemExit('DALPHA_ROUTE_PACKAGE_STALE_BUILD: 运行时关卡与当前源码不一致：' + name)

    # An earlier binary or display catalog must not certify this edition.
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
        raise SystemExit('DALPHA_ROUTE_PACKAGE_UNVERIFIED: 本轮运行报告未完整通过')
    if (evidence.get('displayCopyRooms') != 32 or evidence.get('displayCopySourceUnchanged') is not False or
            evidence.get('sourceRevision') != 'dalpha-descent-20261108; explicit legacy migration'):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_UNVERIFIED: 缺少本轮32房显示文案与显式来源迁移验收')
    if evidence.get('displayCopyCatalogSha256') != digest(DISPLAY_COPY):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_STALE_COPY: 运行报告文案与当前源码模板不一致')
    if evidence.get('source') != digest(SOURCE / CAMPAIGNS[0]):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_STALE_EVIDENCE: 运行报告关卡来源与当前源码不一致')
    assembly = BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll'
    if evidence.get('runtimeAssemblySha256') != digest(assembly):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_STALE_EVIDENCE: 运行报告并非当前构建程序集')

    route = json.loads((REPORTS / 'Runtime/dalpha-runtime.json').read_text(encoding='utf-8-sig'))
    route_checks = route.get('checks', [])
    route_required = {'ordinary input reaches completed exit', 'no deaths',
                      'developer controls unused', 'all replay markers captured'}
    route_passed = {c.get('check') for c in route_checks if isinstance(c, dict) and c.get('pass') is True}
    if (not route_checks or not all(isinstance(c, dict) and c.get('pass') is True for c in route_checks)
            or not route_required.issubset(route_passed) or route.get('normalInputOnly') is not True
            or route.get('completed') is not True or route.get('deaths') != 0):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_UNVERIFIED: 本轮普通输入终局路线未完整通过')
    if route.get('source') != digest(SOURCE / CAMPAIGNS[0]) or route.get('runtimeAssemblySha256') != digest(assembly):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_STALE_EVIDENCE: 终局路线报告与本包关卡或程序集不一致')

    campaign = json.loads((SOURCE / CAMPAIGNS[0]).read_text(encoding='utf-8'))
    display_copy = json.loads(DISPLAY_COPY.read_text(encoding='utf-8-sig'))
    if display_copy.get('sourceSha256') != digest(SOURCE / CAMPAIGNS[0]):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_STALE_COPY: 显示文案绑定的关卡来源不一致')
    display_courses = display_copy.get('courses', {})
    if set(display_courses) != {c['id'] for c in campaign['courses']}:
        raise SystemExit('DALPHA_ROUTE_PACKAGE_INVALID_COPY: 文案课程映射不完整')
    for course in campaign['courses']:
        labels = display_courses[course['id']].get('rooms', {})
        if set(labels) != {room['id'] for room in course['rooms']}:
            raise SystemExit('DALPHA_ROUTE_PACKAGE_INVALID_COPY: 文案房间映射不完整：' + course['id'])
        for room in course['rooms']:
            entry = labels[room['id']]
            if not isinstance(entry.get('name'), str) or not entry['name'].strip() or entry.get('originalName') != room['name']:
                raise SystemExit('DALPHA_ROUTE_PACKAGE_INVALID_COPY: 房间符号或原名不匹配：' + room['id'])
    if campaign['nativeCampaign'].get('saveMode') != 'contact-auto-v1' or campaign['nativeCampaign'].get('authoredCourses') != ['physics']:
        raise SystemExit('DALPHA_ROUTE_PACKAGE_INVALID: 自动存档或原物理关标记无效')
    asset_files = []
    for asset in campaign['assets']:
        relative = Path(asset['path'])
        if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'assets':
            raise SystemExit('DALPHA_ROUTE_PACKAGE_INVALID: 素材路径不安全')
        source_asset, runtime_asset = SOURCE / relative, RUNTIME / relative
        if not source_asset.is_file() or not runtime_asset.is_file() or digest(source_asset) != digest(runtime_asset):
            raise SystemExit('DALPHA_ROUTE_PACKAGE_STALE_BUILD: 原作者资源缺失或构建不一致：' + asset['path'])
        asset_files.append((source_asset, runtime_asset, relative))
    rooms = sum(len(c['rooms']) for c in campaign['courses'])
    connections = sum(len(c['connections']) for c in campaign['courses'])
    relics = sum(o['type'] == 'common.collectible' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    flags = sum(o['type'] == 'common.checkpoint' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
    if (rooms, connections, relics, flags) != (32, 67, 27, 49):
        raise SystemExit('DALPHA_ROUTE_PACKAGE_REVIEW_REQUIRED: 房间/连接/藏品/旗数与本轮合同不符')

    for name in ('自定义资产/images', '自定义资产/audio', '资产模板/images', '资产模板/audio',
                 '关卡导入', '关卡源文件', '文案模板', '字体许可', '设计与测试/验收'):
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
    shutil.copy2(DISPLAY_COPY, BUILD / '文案模板/contact-auto.json')
    (BUILD / '文案模板/使用说明.txt').write_text(
        'contact-auto.json 是显示文案模板，不是可导入关卡，也不是成品热加载文件。\n'
        '修改后放回 Unity 源码 Assets/RoomLabNative/Resources/DisplayCopy/contact-auto.json，再重新构建。\n'
        '保留 sourceSha256、课程ID、房间ID、出口ID；修改 name/notes/objective/arrivalHint/progressHint/softHint/locked 中的显示文本。\n'
        '仅关卡来源完全匹配时生效，自定义导入关卡保留作者原文。不要为改显示名而重写关卡JSON或存档source字段。\n'
        '图片/音频同名替换仍放入自定义资产/images或audio，重启即可；ui.json仍只控制标题与颜色。\n', encoding='utf-8-sig')
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
    readme = (ROOT / 'Handoff/DALPHA_ROUTE_20261108.txt').read_text(encoding='utf-8')
    (BUILD / '开始前读我.txt').write_text(readme, encoding='utf-8-sig')
    lines = ['本轮路径与房间意图（设计者参考，含原编辑器名与解法）',
             '游戏内使用符号房名；本文件保留原解法便于维护，不在玩家界面显示。',
             '连接仍保留，前向分支按阶段开放；返程门不另加锁。', '']
    for course in campaign['courses']:
        lines.append('【' + course['name'] + '】')
        labels = display_courses[course['id']]['rooms']
        names = {r['id']: labels[r['id']]['name'] for r in course['rooms']}
        for room in course['rooms']:
            lines += [names[room['id']] + ' / 原编辑器名：' + room['name'],
                      room.get('notes', ''), room.get('nativeCampaign', {}).get('objective', '')]
            for edge in course['connections']:
                if edge['from']['roomId'] != room['id']:
                    continue
                door = next(e for e in room['exits'] if e['id'] == edge['from']['exitId'])
                condition = labels[room['id']].get('locked', {}).get(door['id'], door.get('rework', {}).get('lockedText'))
                lines.append('  → ' + names[edge['to']['roomId']] + ('（尚未满足时：' + condition + '）' if condition else ''))
            lines.append('')
    (BUILD / '设计与测试/逐房流程说明.txt').write_text('\n'.join(lines), encoding='utf-8-sig')
    (BUILD / '设计与测试/测试说明.txt').write_text(
        '本目录只收录 DAlphaFix20261108 本轮报告。Runtime/autosave-runtime.json 对应当前Windows程序。\n'
        '打包前核对实际运行程序集、关卡、文案模板哈希；源码检查或定位截图不代表真人完整首通。\n'
        'dα路线及存档迁移测试范围以各报告为准。旧版数字不作为本版验收。\n', encoding='utf-8-sig')
    manifest = {'edition': 'local-dalpha-route-20261108', 'rooms': rooms, 'directedConnections': connections,
                'collectibles': relics, 'checkpointFlags': flags, 'manualSaveSlots': 6, 'automaticHistoryCount': 3,
                'authoredCourses': ['physics'], 'authoredSvgAssets': len(asset_files),
                'displayCopyRooms': 32, 'displayCopySourceSha256': display_copy['sourceSha256'],
                'displayCopyCatalogSha256': digest(DISPLAY_COPY),
                'displayOnlyRevision': False, 'coreFixes': ['in-place-fold-and-readable-descent'], 'releaseTag': 'roomlab-native-v2-ddl-dalpha-route-20261108',
                'downloadName': 'RoomLab-Demo-v2-DDL-DAlphaRoute-20261108-win-x64.zip',
                'features': ['in-place-fold-and-readable-descent', 'symbolic-room-labels', 'subtle-temporary-hints', 'authored-physics-preserved', 'contact-autosave', 'interaction-required-doors', 'removed-repeated-background-props', 'destination-door-signs', 'known-room-resource-counts', 'staged-forward-routes'],
                'chapters': [{'id': c['id'], 'rooms': len(c['rooms']), 'connections': len(c['connections'])} for c in campaign['courses']],
                'images': len(catalog['images']), 'audio': len(catalog['audio']),
                'durationTargetMinutes': 30, 'firstTimeHumanDurationVerified': False, 'files': {}}
    hashed = [BUILD / 'RoomLabPhysics.exe', BUILD / 'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll']
    hashed += [BUILD / destination for _, destination in DOCUMENTS]
    hashed += [BUILD / name for name in ('开始前读我.txt', '关卡导入/把关卡放这里.txt', '设计与测试/逐房流程说明.txt', '设计与测试/测试说明.txt', '资产模板/asset-catalog.json', '文案模板/contact-auto.json', '文案模板/使用说明.txt')]
    hashed += [BUILD / '关卡源文件' / name for name in CAMPAIGNS] + [RUNTIME / name for name in CAMPAIGNS] + report_paths
    hashed += [BUILD / '关卡源文件' / relative for _, _, relative in asset_files] + [runtime_asset for _, runtime_asset, _ in asset_files]
    for path in hashed:
        manifest['files'][path.relative_to(BUILD).as_posix()] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    (BUILD / '构建核验记录.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('DALPHA_ROUTE_PACKAGE', rooms, 'rooms', relics, 'relics', flags, 'flags', 6, 'slots', len(report_paths), 'reports')


if __name__ == '__main__':
    main()
