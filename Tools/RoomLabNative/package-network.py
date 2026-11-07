"""Local network delivery. This script never writes any previous delivery."""
import hashlib,json,shutil,wave
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
build=root.parent/'交付/DDL-回环与清醒资源本地版-20261107'
assert build.resolve().parent==(root.parent/'交付').resolve()
for name in ['自定义资产/images','自定义资产/audio','资产模板/images','资产模板/audio','关卡导入','关卡源文件','字体许可','设计与测试']:(build/name).mkdir(parents=True,exist_ok=True)
catalog={'images':{},'audio':{}}
for p in (root/'Assets/RoomLabNative/Resources/PhysicsPixel').glob('*.png'):
 with Image.open(p) as im:catalog['images'][p.stem]={'width':im.width,'height':im.height,'format':'PNG','file':'images/'+p.name}
 shutil.copy2(p,build/'资产模板/images'/p.name)
for p in (root/'Assets/RoomLabNative/Resources/DeadlineAudio').glob('*.wav'):
 with wave.open(str(p)) as w:catalog['audio'][p.stem]={'sampleRate':w.getframerate(),'channels':w.getnchannels(),'bits':w.getsampwidth()*8,'seconds':round(w.getnframes()/w.getframerate(),5),'file':'audio/'+p.name}
 shutil.copy2(p,build/'资产模板/audio'/p.name)
(build/'资产模板/asset-catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
ui=build/'自定义资产/ui.json'
if not ui.exists():ui.write_text(json.dumps({'title':'DDL · 回环与余量','ink':'#0E1624','paper':'#E0DEC4','accent':'#5E9D91'},ensure_ascii=False,indent=2),encoding='utf-8')
for name in ['deadline-network.json','deadline-rework.json','deadline-night.json']:shutil.copy2(root/'Assets/StreamingAssets/RoomLabNative/Campaign'/name,build/'关卡源文件'/name)
for source,dest in [('Handoff/CUSTOM_ASSETS_NETWORK_20261107.txt','自定义资产与关卡规范.txt'),('Handoff/NETWORK_RESOURCE_20261107.md','设计与测试/路径网络与资源设计.md'),('Handoff/REWORK_ART_SOURCES_20261107.json','设计与测试/沿用美术来源.json'),('Assets/RoomLabNative/Resources/DiegeticFont/OFL.txt','字体许可/霞鹜文楷-OFL.txt'),('Assets/StreamingAssets/RoomLabNative/Licenses/FusionPixel-OFL.txt','字体许可/FusionPixel-OFL.txt')]:shutil.copy2(root/source,build/dest)
(build/'关卡导入/把关卡放这里.txt').write_text('把 RoomLab 2.5.5 / 3.0 导出的 JSON 或 ZIP 放在这里。\n游戏主菜单“替换导入”选择文件。带图片建议用 ZIP。\n网络、资源、变形平台等扩展需在此Unity试玩程序中检查；编辑器保留数据并不等于它也模拟了全部新规则。\n',encoding='utf-8-sig')
campaign=json.loads((build/'关卡源文件/deadline-network.json').read_text(encoding='utf-8'))
count=sum(len(c['rooms']) for c in campaign['courses'])
relics=sum(o['type']=='common.collectible' for c in campaign['courses'] for r in c['rooms'] for o in r['objects'])
readme=f'''DDL · 回环与余量 — 本地试玩版

双击 RoomLabPhysics.exe。{count}个房间、三章、{relics}件可选藏品。旧箱庭版与初期版都保留在相邻交付目录。
想先看改动：作业待办→第二章或第三章→新游戏。

默认 A/D 移动，空格跳，左Shift水平冲刺，S蹲下，E交互，Esc暂停，M地图，R从存档点重来。实际键位以设置为准。
高数/水课站在门前按E切房；物理章仍保留原出口方式。

高数：上下回廊互相借路，同一处不止经过一次。符号表示关联，不是逐句攻略。
水课：咖啡+30、讲义-30，一次性，按E使用。清醒度随身跨房，回到房间入口不会补满、不会补货。
旗子旁按E保存当时整章状态；暂停页“从上个存档点开始”同时恢复那时的资源、道具、机关与藏品。
已探索地图知识保留。继续游戏也从该旗子恢复。
不必保持最高的清醒度，梦/朦胧/清醒各有可看的内容。物品可以先留在原处，返回时再用。
藏品由主助手领取；可选终端会在本房开启追逐，带它经过藏品，给它跟上来的空间。

M打开地图，两种模式都会暂停。
当前全景：本房整个空间。沿途总图：已到过的子场景与实际走过的连接，不暴露未探索内容。
地图右上可随时切换，设置里可设默认模式。地图不能传送。

素材：从资产模板复制同名文件到自定义资产/images或audio，保持尺寸/格式后重启。
关卡：本轮文件是关卡源文件/deadline-network.json；旧两版文件一并保留。
字体及程序图案的替换方式、完整字段规范见自定义资产与关卡规范.txt。
设计与测试目录含路径与解法，想自己探索可先不看。

约30分钟是首次探索目标，尚未真人首次计时校准；熟路自动通路测试不是体验时长证明。
准确验收结论见本地验收结果.txt。源码 G:\\project null\\gameProject-roomlab255。
全部保留本地，未上传GitHub或关卡云端。
'''
(build/'开始前读我.txt').write_text(readme,encoding='utf-8-sig')
lines=['本轮路径网络与房间意图（含解法）','']
for c in campaign['courses']:
 lines.append('【'+c['name']+'】')
 names={r['id']:r['name'] for r in c['rooms']}
 for r in c['rooms']:
  lines += [r['name'],r['notes'],r['nativeCampaign'].get('objective','')]
  lines += ['  → '+names[e['to']['roomId']] for e in c['connections'] if e['from']['roomId']==r['id']]
  lines.append('')
(build/'设计与测试/逐房流程说明.txt').write_text('\n'.join(lines),encoding='utf-8-sig')
reports=root/'Validation/Native/Network20261107'
for source,dest in [('CORE-ACCEPTANCE.md','核心验收.md'),('CORE-ACCEPTANCE.json','核心验收.json'),('WaterRoutes/REPORT.md','水课通路验收.md'),('WaterCollections/REPORT.md','水课藏品验收.md'),('WaterCollections/results.json','水课藏品证据.json'),('UI-INTEGRATION-REVIEW.json','界面代码复核.json'),('WaterRoutes/results.json','水课通路证据.json'),('CalculusRoutes/results.json','高数通路证据.json'),('CalculusRoutes/REPORT.md','高数通路验收.md'),('editor-roundtrip-report.json','编辑器往返证据.json'),('editor-native-report.json','原生读回证据.json')]:
 if (reports/source).is_file():shutil.copy2(reports/source,build/'设计与测试'/dest)
manifest={'edition':'local-network-20261107','rooms':count,'collectibles':relics,'chapters':[{'id':c['id'],'rooms':len(c['rooms']),'connections':len(c['connections'])} for c in campaign['courses']],'images':len(catalog['images']),'audio':len(catalog['audio']),'files':{}}
for p in [build/'RoomLabPhysics.exe',build/'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll',build/'关卡源文件/deadline-network.json',build/'RoomLabPhysics_Data/StreamingAssets/RoomLabNative/Campaign/deadline-network.json']:
 manifest['files'][p.relative_to(build).as_posix()]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
assert manifest['files']['关卡源文件/deadline-network.json']['sha256']==manifest['files']['RoomLabPhysics_Data/StreamingAssets/RoomLabNative/Campaign/deadline-network.json']['sha256']
assert hashlib.sha256((root/'Assets/StreamingAssets/RoomLabNative/Campaign/deadline-rework.json').read_bytes()).hexdigest()=='0486d6927672e51d7c85222489d6b133016c9548ac964e35b8ac7cb00d320a94'
(build/'构建核验记录.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('NETWORK_PACKAGE',count,'rooms',relics,'relics',len(catalog['images']),'images',len(catalog['audio']),'audio')
