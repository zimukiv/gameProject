"""Package the new local build; never writes the earlier delivery."""
import json,shutil,wave,hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
build=root.parent/'交付/DDL-箱庭重做本地版-20261107'
assert build.resolve().parent== (root.parent/'交付').resolve()
for folder in ['自定义资产/images','自定义资产/audio','资产模板/images','资产模板/audio','关卡导入','关卡源文件','字体许可','设计与测试']:(build/folder).mkdir(parents=True,exist_ok=True)
catalog={'images':{},'audio':{}}
for p in (root/'Assets/RoomLabNative/Resources/PhysicsPixel').glob('*.png'):
 with Image.open(p) as im:catalog['images'][p.stem]={'width':im.width,'height':im.height,'format':'PNG','file':f'images/{p.name}'}
 shutil.copy2(p,build/'资产模板/images'/p.name)
for p in (root/'Assets/RoomLabNative/Resources/DeadlineAudio').glob('*.wav'):
 with wave.open(str(p)) as w:catalog['audio'][p.stem]={'sampleRate':w.getframerate(),'channels':w.getnchannels(),'bits':w.getsampwidth()*8,'seconds':round(w.getnframes()/w.getframerate(),5),'file':f'audio/{p.name}'}
 shutil.copy2(p,build/'资产模板/audio'/p.name)
(build/'资产模板/asset-catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
ui=build/'自定义资产/ui.json'
if not ui.exists():ui.write_text(json.dumps({'title':'DDL · 柳暗花明','ink':'#0E1624','paper':'#E0DEC4','accent':'#5E9D91'},ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copy2(root/'Handoff/CUSTOM_ASSETS_REWORK_20261107.txt',build/'自定义资产与关卡规范.txt')
for name in ['deadline-rework.json','deadline-night.json']:shutil.copy2(root/'Assets/StreamingAssets/RoomLabNative/Campaign'/name,build/'关卡源文件'/name)
shutil.copy2(root/'Assets/RoomLabNative/Resources/DiegeticFont/OFL.txt',build/'字体许可/霞鹜文楷-OFL.txt')
shutil.copy2(root/'Assets/StreamingAssets/RoomLabNative/Licenses/FusionPixel-OFL.txt',build/'字体许可/FusionPixel-OFL.txt')
shutil.copy2(root/'Handoff/REWORK_ART_SOURCES_20261107.json',build/'设计与测试/本轮美术来源.json')
(build/'关卡导入/把关卡放这里.txt').write_text('把 RoomLab 导出的 JSON 或 ZIP 放在这里。\n启动游戏，在主菜单点击“替换导入”，选择该文件。\n带图片的关卡建议导出ZIP。详细规则见上一层“自定义资产与关卡规范.txt”。\nRoomLab编辑器保留重做扩展字段，但不会模拟Unity专属意识分层、信号和巡逻。\n',encoding='utf-8-sig')
(build/'开始前读我.txt').write_text('''DDL · 柳暗花明 — 箱庭重做本地评判版

双击 RoomLabPhysics.exe。三个章节、30间主线房与3间选修房、33件可选藏品。
◆门通向选修收藏房。主线按章节连续推进，最后一间交卷后查看下一条作业通知。
原作者Demo与机制示例仍在“作业待办”；旧24房版本保留在旁边旧交付目录。

A/D移动，空格跳跃，左Shift水平冲刺，S蹲下，E接通助手，Esc暂停，M地图，R检查点重试。
实际键位以设置页面为准。藏品由主助手领取：带它经过，给它一点跟上来的空间。
靠近座位短暂出现名称；离开再靠近可以重看。长操作说明和小故事在暂停页。
同一机关需重新触发时，先离开再踩入。灰暗的门尚未接通；控制板和路线使用相同符号。
冷台上有“○ ○”时，需等助手也到达，避免把它关在冰桥下面。
被抓、落下或机关位置不便时，可重试检查点；暂停页可返回房间入口并保留已完成机关。

这版按首次学习、探索与收集约30分钟设计；真实首次时长仍待试玩校准。
熟悉路线的自动输入明显更快，不能作为30分钟体验已达标的证据。
本次验证覆盖正常移动/跳跃/冲刺通路、逐件领取、存档、数据往返及独立Windows程序。
具体结果与未覆盖项见“本地验收结果.txt”。

想先看本次高数美术：主菜单“作业待办”选择第二章，再开始。
高数前景使用纸页材质，墨线标可站立边缘；世界批注与高数/水课状态栏使用文楷。

图片与声音：从“资产模板”复制同名文件到“自定义资产/images”或audio，修改后重启。
字体：按规范在Unity工程替换，再构建；直接把TTF放在成品旁不会生效。
关卡：编辑“关卡源文件/deadline-rework.json”，导出后通过游戏“替换导入”。
撤回素材替换只需移出覆盖文件。不要覆盖旧存档或RoomLabPhysics_Data。

所有成品留在本地，未推送GitHub或关卡云端。
源码：G:\\project null\\gameProject-roomlab255
测试：源码内Validation/Native/Rework20261107；构建日志保留在同一位置。
''',encoding='utf-8-sig')
campaign=json.loads((build/'关卡源文件/deadline-rework.json').read_text(encoding='utf-8'))
lines=['关卡流程与设计意图（含解法，试玩前可不读）','计划体验：实验楼8–10分钟；纸上空间10–12分钟；水课8–10分钟。这是设计分配，未经过首次真人计时校准。','']
for c in campaign['courses']:
 lines+=['【'+c['name']+'】']
 for r in c['rooms']:
  lines += [r['name']+('〔选修〕' if r['nativeCampaign'].get('optional') else ''),r['notes'],r['nativeCampaign']['objective']]
  for e in c['connections']:
   if e['from']['roomId']==r['id']:lines.append('  → '+e['to']['roomId']+' / '+e['to']['entryId'])
  lines.append('')
(build/'设计与测试/关卡流程说明.txt').write_text('\n'.join(lines),encoding='utf-8-sig')
manifest={'edition':'local-rework-20261107','rooms':sum(len(c['rooms']) for c in campaign['courses']),'collectibles':sum(o['type']=='common.collectible' for c in campaign['courses'] for r in c['rooms'] for o in r['objects']),'images':len(catalog['images']),'audio':len(catalog['audio']),'files':{}}
for path in [build/'RoomLabPhysics.exe',build/'RoomLabPhysics_Data/Managed/Assembly-CSharp.dll',build/'关卡源文件/deadline-rework.json',build/'RoomLabPhysics_Data/StreamingAssets/RoomLabNative/Campaign/deadline-rework.json']:
 manifest['files'][str(path.relative_to(build))]={'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(build/'构建核验记录.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('REWORK_PACKAGE',manifest['rooms'],'rooms',manifest['collectibles'],'collectibles',manifest['images'],'images',manifest['audio'],'audio')
