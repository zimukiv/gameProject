"""Package the validated connected Windows build, then verify an extracted copy."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tag', required=True, help='Release identifier, e.g. 20261026-v2')
args = parser.parse_args()
if not re.fullmatch(r'\d{8}(?:-v\d+)?', args.tag):
    parser.error('Use YYYYMMDD or YYYYMMDD-vN for --tag')

root = Path(__file__).resolve().parents[2]
build = root / 'Builds/RoomLabConnected'
source = root / 'Tools/RoomLabRuntimeApp'
out = root.parent / '资料/试玩导出'
archive = out / f'RoomLab-试玩版-{args.tag}.zip'
folder = f'RoomLab-Playtest-{args.tag}'
validation = root / f'.roomlab-downloads/playtest-export-validation-{args.tag}'
report_file = root / f'Validation/LatestRoomLabEvidence/playtest-export-{args.tag}.json'
if archive.exists() or validation.exists() or report_file.exists():
    raise SystemExit('Release already exists; choose a new --tag instead of overwriting')


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


# Refuse to ship stale gameplay sources or an assembly older than its C# sources.
for file in source.rglob('*'):
    if file.is_file():
        target = build / 'RoomLabRuntime/resources/app' / file.relative_to(source)
        assert target.is_file() and digest(file) == digest(target), f'Stale runtime: {file}'
assembly = build / 'RoomLabUnity_Data/Managed/Assembly-CSharp.dll'
assert assembly.is_file(), 'Build the connected player first'
assert all(file.stat().st_mtime <= assembly.stat().st_mtime
           for file in (root / 'Assets/Scripts').rglob('*.cs')), 'C# changed since build; rebuild first'

readme = f'''RoomLab 试玩版 · Windows 64 位 · {args.tag}

开始试玩
1. 将整个 ZIP 完整解压。
2. 打开 {folder} 文件夹，双击 RoomLabUnity.exe。
无需安装 Unity 或 Node。请保留同目录全部程序文件和 RoomLabRuntime 文件夹。

操作
A / D 或 ← / →：左右移动
空格 / W / ↑：跳跃
Shift：左右冲刺；无左右输入时沿角色朝向
S / ↓：下蹲
R：重试当前房间
Esc：打开/关闭暂停菜单；菜单中可退出游戏
F1 或右上角按钮：选择房间
Esc → 键位设置：修改主按键与备用键，自动保存；也可恢复默认。

冲刺规则
每次落地恢复一次免费冲刺。有付费库存时，落地前还可以付费冲刺一次。
空中最多连续冲刺两次；付费库存上限 3，落地不会补充库存。

开发者模式
Esc → 勾选“开发者模式” → 勾选“锁血” → Esc 返回游戏。
锁血免疫尖刺和 AI 抓捕，AI 不扣 Token；掉落返回当前存档点（未激活时返回房间入口），不扣资源、不计死亡。
R 仍可手动重试。开发者模式与锁血默认关闭，仅本次运行有效。
飞行：勾选“飞行”，左右沿用移动键，跳跃键上升，下蹲键下降，松键悬停。
飞行可穿墙，用于查看布局，不拾取物品、不触发机关或出口。关闭时自动避免卡在墙内。
全局地图预览：可查看当前房间全图或全部房间与连接关系；点击缩略图查看房间。
房间全图支持滚轮缩放、左键拖动平移，预览期间游戏暂停，Esc 返回菜单。

本版内容
包含策划 DDL1.3 的完整 11 个房间，沿出口推进至最后一个出口通关。
新增 7 个存档点，触碰后死亡或重试会从最近存档点继续；只在本次游戏中有效。
包含空中双冲刺输入修复、导轨 Token 拾取修复、四向半圆危险物。
普通水平移动约 0.1 秒加速至满速，冰面保留滑动。
死亡或手动重试后有 0.5 秒静默操作缓冲。
温控从热切冷时立即结冰。
“冰 跑酷”关卡原为 5 秒的 25 个冰块改为累计站立 2 秒融化。

目前是试玩版本，部分危险物位置和朝向后续还会微调。
反馈问题时请记录版本号、房间名称、操作步骤和实际现象。
'''

files = []
for file in sorted(build.rglob('*')):
    if not file.is_file():
        continue
    rel = file.relative_to(build)
    if file.suffix.lower() in ('.log', '.pdb'):
        continue
    if any('dontship' in part.lower() or 'donotship' in part.lower() for part in rel.parts):
        continue
    if file.parent == build / 'RoomLabRuntime' and (
        file.name.endswith('preview.png') or file.name.startswith('preview-') or
        file.name in ('README.md', 'source-hashes.json')
    ):
        continue
    files.append((file, rel.as_posix()))
required = ['RoomLabUnity.exe', 'UnityPlayer.dll', 'RoomLabRuntime/RoomLabCore.exe',
            'RoomLabUnity_Data/Managed/Assembly-CSharp.dll',
            'RoomLabRuntime/resources/app/project.json',
            'RoomLabRuntime/resources/app/src/runtime/input-steps.cjs',
            'RoomLabRuntime/LICENSE', 'RoomLabRuntime/LICENSES.chromium.html']
assert all(any(rel == name for _, rel in files) for name in required), 'Incomplete build'
manifest = [{'path': rel, 'bytes': file.stat().st_size, 'sha256': digest(file)} for file, rel in files]
out.mkdir(parents=True, exist_ok=True)
print(f'PACKAGING {archive} files={len(manifest)}', flush=True)
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for file, rel in files:
        z.write(file, f'{folder}/{rel}')
    z.writestr(f'{folder}/开始试玩.txt', readme.encode('utf-8-sig'))
    z.writestr(f'{folder}/package-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8'))

validation.mkdir(parents=True, exist_ok=False)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None, 'ZIP integrity check failed'
    z.extractall(validation)
extracted = validation / folder
for item in manifest:
    assert digest(extracted / item['path']) == item['sha256'], item['path']
for file in source.rglob('*'):
    if file.is_file():
        target = extracted / 'RoomLabRuntime/resources/app' / file.relative_to(source)
        assert target.is_file() and digest(file) == digest(target), str(file)
report = {'tag': args.tag, 'archive': str(archive), 'sha256': digest(archive),
          'zipBytes': archive.stat().st_size, 'fileCount': len(manifest) + 2,
          'allFileHashesVerified': True, 'currentRuntimeAppVerified': True,
          'extractedExecutable': str(extracted / 'RoomLabUnity.exe')}
report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
