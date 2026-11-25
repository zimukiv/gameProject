import json
import zipfile
import os
import shutil

source_json_path = 'gameProject/Assets/StreamingAssets/RoomLabNative/Campaign/deadline-autosave.json'
with open(source_json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Update data
physics_collectible_updates = {
    'block-mvniyk1k-zyhvos': ('《涂黑的数据异常点》', '散点图上离群最远的点，被铅笔狠狠涂黑伪装成杂质。'),
    'block-mvoniqsk-w3skhk': ('《绝热膨胀的咖啡罐》', '在冷热温控台边缘放了一夜，熬夜后醒来你和它都浮肿了'),
    'block-mvp28r8e-2mfxfw': ('《未校准的示波器截图》', '实验说明没预习的你不知道为什么波形图是正弦，但至少在 DDL 前打印出来了。'),
    'object-mvnkr562-kiz9e4': ('《第七版终稿.pdf》', '文件名虽然叫终稿，但文件夹里其实还有‘绝对不改版’。'),
    'object-mvnkr562-1izjf3': ('《这真的是最后一版.docx》', '凌晨 4:15 保存，你困到甚至忘了关电脑'),
    'object-mvnkr562-bpx08d': ('《指导老师的红色问号》', '让ai写的“一定正确“的结论旁边，留下一个古法手写的大大的问号'),
    'block-mvp2m49r-a4yljg': ('《答辩通过的拟合曲线》', 'R² 只有 0.68，但在评委老师揉眼睛的瞬间它完美得无可挑剔。')
}

calculus_collectible_updates = {
    'network-calculus-05-object-009': ('《夹层里的旁注》', '不知是谁用铅笔写的‘此处显然可得’，卡了整整两个小时。'),
    'network-calculus-05-object-010': ('《被折起来的一页》', '折痕把两个毫无关系的公式拼在了一起，但你没看出来有什么问题'),
    'network-calculus-06-object-018': ('《阁楼的解法》', '绕了七八层积分的远路，回过头看，原来答案就写在正下方。'),
    'network-calculus-07-object-023': ('《两页之间的批注》', '只有在背光处才看得清的字迹：‘别往下算了，出题人印错了’。'),
    'network-calculus-08-object-028': ('《过程比答案多一行》', '哪怕最后结果算错，阅卷老师看到这一行也能给两分步骤分。'),
    'network-calculus-08-object-029': ('《留给同伴的空白》', '撕掉半截的草稿纸，怎么恰好没有答案'),
    'network-calculus-10-object-042': ('《回家吧孩子回家吧》', '沿着推论原路返回，所有消去的常数项在这一刻重新相遇。')
}

slacker_collectible_updates = {
    'network-slacker-01-obj-010': ('《杯沿的月亮》', '纸杯里晃动的灯影，在第 45 分钟的时候被刚睡醒的你看成了一弯月牙。'),
    'network-slacker-02-obj-022': ('《无人认领的座位》', '倒数第二排靠窗，桌角刻着几年前某位学长算不出的高数公式。'),
    'network-slacker-03-obj-011': ('《再也读不懂的注脚》', '睡意散去时投影幕已经翻了十页，只有黑板边角还留着上节课的板书。'),
    'network-slacker-04-obj-014': ('《画框外的颜色》', '讲台侧面悬挂的名画复制品，褪色边缘印着粉笔灰的灰白。'),
    'network-slacker-05-obj-011': ('《放映间的灰尘》', '投影仪光束里飞舞的尘埃，在黑暗教室里宛如无声的慢动作电影。'),
    'network-slacker-06-obj-009': ('《备用杯套》', '瓦楞纸套被反复捏得变平，上面写满了怕被抽问的假装思考草稿。'),
    'network-slacker-07-obj-013': ('《睡梦中的签名》', '签到表传过来时半睡半醒，名字的最后一笔直接划到了桌面上。'),
    'network-slacker-08-obj-012': ('《答到前的停顿》', '老师点到前排空座位名字时，全教室陷入长达三秒的心虚沉寂。'),
    'network-slacker-09-obj-010': ('《同一个名字》', '点名册上两行完全不同字迹的签名，签的居然是同一个人。'),
    'network-slacker-10-obj-015': ('《留到下课的一分钟》', '讲台上的倒计时走完前，谁也不敢第一个站起来收书包拉拉链。'),
    'network-slacker-10-obj-018': ('《梦的余温》', '额头靠在桌板上压出的红印，提醒你刚才那堂课真的只是做梦。'),
    'network-slacker-11-obj-016': ('《无人放映的结尾》', '幻灯片放到了最后一页‘Thank You’，台下只剩下收拾桌面的声音。'),
    'network-slacker-11-obj-020': ('《走神以后》', '窗外的树影晃了三下，这一页幻灯片就彻底变成了未解之谜。')
}

for c in data['courses']:
    cid = c['id']
    if cid == 'physics':
        for r in c['rooms']:
            for o in r.get('objects', []):
                oid = o.get('id')
                if oid in physics_collectible_updates:
                    name, desc = physics_collectible_updates[oid]
                    o['name'] = name
                    o['text'] = desc
                    if 'rework' not in o or not isinstance(o['rework'], dict):
                        o['rework'] = {}
                    o['rework']['lore'] = desc
                if o.get('type') in ('common.aiStart', 'common.aiStartHollow'):
                    o['name'] = '作业助手'
                    o['text'] = '大作业ddl倒计时开始，带我去各实验数据取样！'
    elif cid == 'guided-calculus':
        for r in c['rooms']:
            for o in r.get('objects', []):
                oid = o.get('id')
                if oid in calculus_collectible_updates:
                    name, desc = calculus_collectible_updates[oid]
                    o['name'] = name
                    o['text'] = desc
                    if 'rework' not in o or not isinstance(o['rework'], dict):
                        o['rework'] = {}
                    o['rework']['lore'] = desc
                if o.get('type') in ('common.aiStart', 'common.aiStartHollow'):
                    o['name'] = '证明题帮手'
                    o['text'] = '草稿纸已铺平，下一步的推导由你带路。'
    elif cid == 'guided-slacker':
        for r in c['rooms']:
            for o in r.get('objects', []):
                oid = o.get('id')
                if oid in slacker_collectible_updates:
                    name, desc = slacker_collectible_updates[oid]
                    o['name'] = name
                    o['text'] = desc
                    if 'rework' not in o or not isinstance(o['rework'], dict):
                        o['rework'] = {}
                    o['rework']['lore'] = desc
                if o.get('type') in ('common.aiStart', 'common.aiStartHollow'):
                    o['name'] = '代签助手'
                    o['text'] = '帮你看一眼老师，你先抓紧时间闭眼歇会。'
                if o.get('type') == 'slacker.awake':
                    delta = o.get('rework', {}).get('clarityDelta', 0)
                    if delta > 0:
                        o['name'] = '冷萃隔夜美式'
                        o['text'] = '纸杯里剩下的大半杯冰美式，苦得你吐了吐舌'
                    else:
                        o['name'] = '全英文PPT讲义'
                        o['text'] = '密密麻麻的专业外语，你发现把两只眼睛都闭起来阅读很舒服'
                if o.get('type') == 'slacker.checkin':
                    o['name'] = '不知道属于谁的签到用笔'
                    o['text'] = '永远只有半管墨的黑色水笔，全班传阅却从不属于任何人。'

# Build zip
os.makedirs('gameProject/关卡导入', exist_ok=True)
zip_name = 'DDL-文案审批定制版.zip'
out_zip_path = os.path.join('gameProject/关卡导入', zip_name)
artifact_zip_path = os.path.join(r'C:\Users\Kayla\.gemini\antigravity\brain\a42de1ec-d516-4c36-9137-6fd81a6f28da', zip_name)

with zipfile.ZipFile(out_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    # 1. project.json
    project_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    z.writestr('project.json', project_bytes)
    
    # 2. Add SVG assets
    assets_dir = 'gameProject/Assets/StreamingAssets/RoomLabNative/assets'
    for f in os.listdir(assets_dir):
        if f.endswith('.svg'):
            z.write(os.path.join(assets_dir, f), arcname='assets/' + f)

shutil.copy2(out_zip_path, artifact_zip_path)

print('Zip created successfully at:', out_zip_path)
print('Zip size:', os.path.getsize(out_zip_path), 'bytes')
print('Artifact copy at:', artifact_zip_path)
