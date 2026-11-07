import json, shutil, wave
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
build=root.parent/'交付/DDL-截止之前-初期本地版-20261107'
for folder in ['自定义资产/images','自定义资产/audio','资产模板/images','资产模板/audio','关卡导入','关卡源文件']:(build/folder).mkdir(parents=True,exist_ok=True)
catalog={'images':{},'audio':{}}
for p in (root/'Assets/RoomLabNative/Resources/PhysicsPixel').glob('*.png'):
 with Image.open(p) as im:catalog['images'][p.stem]={'width':im.width,'height':im.height,'format':'PNG','file':f'images/{p.name}'}
 shutil.copy2(p,build/'资产模板/images'/p.name)
for p in (root/'Assets/RoomLabNative/Resources/DeadlineAudio').glob('*.wav'):
 with wave.open(str(p)) as w:catalog['audio'][p.stem]={'sampleRate':w.getframerate(),'channels':w.getnchannels(),'bits':w.getsampwidth()*8,'seconds':round(w.getnframes()/w.getframerate(),5),'file':f'audio/{p.name}'}
 shutil.copy2(p,build/'资产模板/audio'/p.name)
(build/'资产模板/asset-catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
ui=build/'自定义资产/ui.json'
if not ui.exists():ui.write_text(json.dumps({'title':'DDL · 截止之前','ink':'#0E1624','paper':'#E0DEC4','accent':'#33B8B8'},ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copy2(root/'Handoff/CUSTOM_ASSETS_20261107.txt',build/'自定义资产与关卡规范.txt')
shutil.copy2(root/'Assets/StreamingAssets/RoomLabNative/Campaign/deadline-night.json',build/'关卡源文件/deadline-night.json')
(build/'关卡导入/把关卡放这里.txt').write_text('把 RoomLab 导出的 JSON 或 ZIP 放在这里。\n启动游戏，在主菜单点击“替换导入”，选择该文件。\n带图片的关卡建议导出ZIP。不要直接覆盖原作者关卡或玩家存档。\n完整规范请看上一层“自定义资产与关卡规范.txt”。\n',encoding='utf-8-sig')
(build/'开始前读我.txt').write_text('DDL · 截止之前 — 本地初期版\n\n双击 RoomLabPhysics.exe。三章24房，36件可选藏品；原版Demo在“作业待办”保留。\nA/D移动，空格跳跃，左Shift水平冲刺，E启动AI，Esc暂停，M地图，R检查点重试；实际键位以设置页面为准。\n先收Token，启动AI，再带它上高处领取藏品。看到反向阶梯要先经过末端，再折返带路。\n签到漏了可在暂停页返回房间入口，保留本房机关进度。\n第一章结束点击下一条作业通知进入第二章，依次完成三章。\n\n目标首次探索约30分钟；自动无失误主路约19分钟，未包含支路收藏和真人首次学习。\n这是本地评判版，尚无真人完整30分钟试玩与全36件收集验收。\n\n自定义图片/声音：从资产模板取同名文件，保持规范，放到自定义资产/images或audio后重启。\n关卡与对白：用最新RoomLab编辑关卡源文件里的JSON，导出后通过游戏“替换导入”。\n详见“自定义资产与关卡规范.txt”。\n\n未上传云端。旧成品与旧存档保留。\n日志位于 %USERPROFILE%\\AppData\\LocalLow 下本游戏目录的Player.log；运行报告在源码的Validation/Native/EarlyGame20261107。\n',encoding='utf-8-sig')
print('CUSTOMIZATION_PACKAGE',len(catalog['images']),'images',len(catalog['audio']),'audio',str(build))
