"""Original four-note score and sound design; deterministic synthesis, no samples."""
import json, wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Assets/RoomLabNative/Resources/DeadlineAudio';OUT.mkdir(parents=True,exist_ok=True)
SR=22050
rng=np.random.default_rng(1107)
def hz(n):return 440*2**((n-69)/12)
def note(n,length,kind=0):
 t=np.arange(int(length*SR))/SR;f=hz(n)
 if kind==0:v=np.sin(2*np.pi*f*t)+.25*np.sin(4*np.pi*f*t)
 elif kind==1:v=np.sin(2*np.pi*f*t)*np.exp(-t*5)+.32*np.sin(2*np.pi*f*2.003*t)*np.exp(-t*9)
 else:v=np.sin(2*np.pi*f*t+1.3*np.sin(2*np.pi*f*t)*np.exp(-t*4))
 env=np.minimum(t/.012,1)*np.minimum((length-t)/.08,1)*np.exp(-t*.65)
 return v*env
def put(track,samples,at,gain=.15,pan=0):
 i=int(at*SR);n=min(len(samples),len(track)-i)
 if n>0:track[i:i+n,0]+=samples[:n]*gain*(1-pan*.5);track[i:i+n,1]+=samples[:n]*gain*(1+pan*.5)
def save(name,a):
 a=np.clip(a,-.95,.95);raw=(a*32767).astype('<i2')
 with wave.open(str(OUT/(name+'.wav')),'wb') as w:w.setnchannels(2 if a.ndim==2 else 1);w.setsampwidth(2);w.setframerate(SR);w.writeframes(raw.tobytes())
 stats[name]={'seconds':round(len(a)/SR,3),'peak':round(float(abs(a).max()),4),'rms':round(float(np.sqrt(np.mean(a*a))),4)}
stats={}
for kind,tempo,instrument,base in [('physics',104,0,45),('calculus',112,1,50),('slacker',96,2,48)]:
 beat=60/tempo;duration=64*beat
 calm=np.zeros((int(duration*SR),2));chase=calm.copy()
 progression=[0,5,3,7];motif=[12,15,19,17,15,12,10,7]
 for bar in range(16):
  root=base+progression[(bar//2)%4];at=bar*4*beat
  for n in [root+12,root+15,root+19]:put(calm,note(n,3.9*beat,instrument),at,.035,(n-root-15)/8)
  for step in range(8):
   n=root+motif[(step+bar%2*2)%8];put(calm,note(n,.42*beat,instrument),at+step*.5*beat,.075 if bar%4<3 else .055,(-1)**step*.55)
  for b in range(4):
   put(calm,note(root-12 if b%2==0 else root-5,.7*beat,0),at+b*beat,.09)
   put(chase,note(root-12,.35*beat,0),at+b*beat,.11)
   t=np.arange(int(.2*SR))/SR;kick=np.sin(2*np.pi*(43*t+3*(1-np.exp(-t*28))))*np.exp(-t*25)
   put(chase,kick,at+b*beat,.23)
   if b%2:put(chase,rng.normal(0,1,int(.12*SR))*np.exp(-np.arange(int(.12*SR))/SR*35),at+b*beat,.07)
  for step in range(8):
   noise=rng.normal(0,1,int(.035*SR));noise=np.diff(noise,prepend=0)*np.exp(-np.arange(len(noise))/SR*100)
   put(chase,noise,at+step*.5*beat,.025,(-1)**step*.65)
   put(chase,note(root+24+[0,7,3,10][step%4],.22*beat,1),at+step*.5*beat,.045)
 # Both stems share exact loop length and tempo. Gentle seam fades avoid clicks.
 for a in [calm,chase]:
  fade=int(.015*SR);a[:fade]*=np.linspace(0,1,fade)[:,None];a[-fade:]*=np.linspace(1,0,fade)[:,None]
 save(kind+'-explore',calm);save(kind+'-chase',chase)
def effect(name,notes,length=.18,noise=0):
 a=np.zeros(int((len(notes)*length+.15)*SR))
 for i,n in enumerate(notes):
  v=note(n,length+.1,1)*.22;start=int(i*length*SR);a[start:start+len(v)]+=v
 if noise:a+=rng.normal(0,1,len(a))*noise*np.exp(-np.arange(len(a))/SR*18)
 save(name,a)
for name,notes,length,noise in [('ui',[76],.05,0),('jump',[62,69],.055,0),('dash',[78,66,54],.035,.08),('coin',[79,86],.065,0),('collectible',[72,76,79,84],.11,0),('temperature',[60,67,72],.1,.015),('retry',[60,55,48],.13,.02),('finish',[60,64,67,72,79,84],.16,0),('jet',[48,55,67,79],.05,.12),('rail-start',[48,60,72,84],.06,.03),('ice-melt',[89,83,73],.04,.12),('ice-create',[72,79,84],.05,.04),('checkpoint',[67,72],.12,0),('calculus-integral',[60,64,67,72],.06,0),('calculus-derivative',[84,79,76,72],.06,0),('checkin',[72,79],.09,0),('awake',[60,72,84],.07,.015),('ai-start',[48,55,60,67],.12,0),('ai-charge',[60,63,66,69,72],.14,.01),('ai-burst',[84,60],.12,.06),('ai-recover',[67,60],.1,0),('ai-teleport',[91,79,67],.08,.025),('land',[45],.035,.025),('steal',[58,57],.1,.02)]:effect(name,notes,length,noise)
(OUT/'audio-manifest.json').write_text(json.dumps({'provenance':'Original synthesized composition by Codex, 2026-11-07. No external samples. Shared motif, 16 bars per chapter, synchronized chase percussion stems.','clips':stats},indent=2),encoding='utf-8')
print('AUDIO_COMPOSED',len(stats),'clips')
