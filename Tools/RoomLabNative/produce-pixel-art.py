"""Deterministic production cuts. Source masters are immutable; no generated art here."""
import json, hashlib, shutil
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'resource/native-demo-pixel-v1'
OUT=ROOT/'Assets/RoomLabNative/Resources/PhysicsPixel'
OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((SOURCE/'ART_MANIFEST.json').read_text(encoding='utf-8-sig'))
records=[]; previews=[]
for file,asset in manifest['assets'].items():
    path=SOURCE/asset['path']; raw=path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==asset['sha256']
    image=Image.open(path).convert('RGBA')
    if not asset['sprites']:
        result=image.resize((640,360),Image.Resampling.NEAREST);result.save(OUT/'background.png');continue
    family=file.split('_master')[0]
    for item in asset['sprites']:
        name=item['name']
        if name.startswith('legacy'):continue
        x,y,w,h=item['sourceRect'];tw,th=item['targetCanvas'];crop=image.crop((x,y,x+w,y+h))
        # Keep the registered source baseline, rather than independently centering frames.
        character=family in ('player','ai')
        if character:
            bbox=item['alpha128BBox']; scale=42/194 if family=='player' else 42/210
            anchor=item['sourceAnchor']; ax=(anchor[0]-x)*scale;ay=(anchor[1]-y)*scale
            # Reject disconnected neighbouring pose pixels, retaining all low-alpha pixels
            # attached to a selected body. Death/skill fragments deliberately stay intact.
            if family=='player' and not name.startswith('death'):
                alpha=crop.getchannel('A');pix=alpha.load();seen=set();components=[]
                for py in range(h):
                    for px in range(w):
                        if pix[px,py]<32 or (px,py) in seen:continue
                        todo=[(px,py)];seen.add((px,py));part=[]
                        while todo:
                            a,b=todo.pop();part.append((a,b))
                            for q in ((a-1,b),(a+1,b),(a,b-1),(a,b+1)):
                                if 0<=q[0]<w and 0<=q[1]<h and q not in seen and pix[q[0],q[1]]>=32:seen.add(q);todo.append(q)
                        components.append(part)
                if components:
                    body=max(components,key=len);keep=set(body)
                    for a,b in body:
                        for dx in range(-2,3):
                            for dy in range(-2,3):keep.add((a+dx,b+dy))
                    for py in range(h):
                        for px in range(w):
                            if (px,py) not in keep:pix[px,py]=0
                    crop.putalpha(alpha)
            resized=crop.resize((max(1,round(w*scale)),max(1,round(h*scale))),Image.Resampling.NEAREST)
            result=Image.new('RGBA',(tw,th));result.alpha_composite(resized,(round(tw/2-ax),round(th-8-ay)))
        else:
            result=crop.resize((tw,th),Image.Resampling.NEAREST)
        if family=='terrain_pickups' and name=='groundFill':result=result.crop((7,12,27,30)).resize((32,32),Image.Resampling.NEAREST)
        target=f'{family}-{name}';result.save(OUT/(target+'.png'))
        records.append({'name':target,'source':asset['path'],'sourceSha256':asset['sha256'],'sourceRect':item['sourceRect'],'sourceAnchor':item.get('sourceAnchor'),'outputSize':[tw,th],'outputSha256':hashlib.sha256((OUT/(target+'.png')).read_bytes()).hexdigest(),'registration':'fixed source baseline' if character else 'canvas','alphaCleanup':'largest connected body plus 2px fringe' if family=='player' and not name.startswith('death') else 'preserve alpha'})
        previews.append((target,result))
sheet=Image.new('RGB',(640,((len(previews)+7)//8)*104),(23,34,56));draw=ImageDraw.Draw(sheet)
for i,(name,img) in enumerate(previews):
    x=i%8*80;y=i//8*104;view=img.copy();view.thumbnail((68,76),Image.Resampling.NEAREST);sheet.paste(view,(x+(80-view.width)//2,y),view);draw.text((x,y+77),name.replace('mechanisms-','')[:13],fill='white')
evidence=ROOT/'Validation/Native/P4';evidence.mkdir(parents=True,exist_ok=True);sheet.save(evidence/'production-contactsheet.png')
(evidence/'production-manifest.json').write_text(json.dumps({'sourceManifestSha256':hashlib.sha256((SOURCE/'ART_MANIFEST.json').read_bytes()).hexdigest(),'playerUniquePoses':22,'dashSlots':['dash00','dash01','dash01'],'records':records},ensure_ascii=False,indent=2),encoding='utf-8')
fontOut=ROOT/'Assets/RoomLabNative/Resources/PhysicsPixelFont';fontOut.mkdir(parents=True,exist_ok=True)
shutil.copy2(SOURCE/'fonts/fusion-pixel-12px-proportional-zh_hans.ttf',fontOut/'FusionPixel.ttf')
licenseOut=ROOT/'Assets/StreamingAssets/RoomLabNative/Licenses';licenseOut.mkdir(parents=True,exist_ok=True)
shutil.copy2(SOURCE/'fonts/OFL.txt',licenseOut/'FusionPixel-OFL.txt');shutil.copytree(SOURCE/'fonts/LICENSES',licenseOut/'UpstreamFonts',dirs_exist_ok=True)
shutil.copy2(SOURCE/'ART_MANIFEST.json',evidence/'art-source-manifest.json')
print('PIXEL_PRODUCTION_PASS sprites='+str(len(records)))

