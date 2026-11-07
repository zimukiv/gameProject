using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace RoomLab.Native
{
    // Short action and door feedback only. Repeated background props/captions are disabled.
    // No colliders, timers, input or gameplay writes.
    public sealed class NativeGuidedPresentation : IDisposable
    {
        readonly NativeMotion game;
        readonly GameObject root;
        readonly Material material;
        readonly Texture2D pixel;
        readonly Sprite white;
        readonly Font font;
        readonly Color accent, muted, paper;
        readonly List<DoorCue> doors = new List<DoorCue>();
        readonly List<AmbientCue> ambient = new List<AmbientCue>();
        readonly Particle[] particles = new Particle[24];
        readonly Pulse[] pulses = new Pulse[6];
        readonly HashSet<string> floorCells = new HashSet<string>();
        JObject lastEvent;
        float clock, landing, takeoff;
        int particleCursor, pulseCursor;
        bool disposed;
        public Vector3 StudentScale { get; private set; } = Vector3.one;
        public float StudentTilt { get; private set; }

        sealed class DoorCue { public NativeRegion door; public LineRenderer frame, sill; public bool open; public float changed; }
        sealed class AmbientCue { public SpriteRenderer sprite; public Vector3 origin; public Color color; public float phase; public bool page; }
        sealed class Particle { public SpriteRenderer sprite; public Vector2 position, velocity; public Color color; public float age, life, size, angle, spin; public bool steam; }
        sealed class Pulse { public LineRenderer line; public Vector3 position; public Color color; public float age, life; public bool square; }

        public NativeGuidedPresentation(NativeMotion game, Transform parent)
        {
            this.game=game;
            root=new GameObject("Campus action feedback / noncolliding");root.transform.SetParent(parent,false);
            material=new Material(Shader.Find("Sprites/Default"));
            pixel=new Texture2D(1,1,TextureFormat.RGBA32,false){name="Guided shared white pixel",filterMode=FilterMode.Point};pixel.SetPixel(0,0,Color.white);pixel.Apply();
            white=Sprite.Create(pixel,new Rect(0,0,1,1),new Vector2(.5f,.5f),1);
            font=Resources.Load<Font>(game.Course.Kind=="physics"?"PhysicsPixelFont/FusionPixel":"DiegeticFont/LXGWWenKai-Regular");
            bool math=game.Course.Kind=="calculus", water=game.Course.Kind=="slacker";
            accent=math?new Color(.26f,.48f,.47f):water?new Color(.86f,.71f,.47f):new Color(.35f,.78f,.78f);
            muted=math?new Color(.29f,.33f,.28f,.28f):new Color(.67f,.71f,.71f,.22f);
            paper=math?new Color(.75f,.70f,.56f,.32f):new Color(.83f,.77f,.65f,.24f);
            // Do not decorate authored rooms or restore the repeated two-corner props, even when
            // an older JSON still contains dressing metadata. Keep the original background intact.
            foreach(var door in game.Room.Exits){
                float left=door.X+.12f,right=door.X+door.W-.12f,bottom=door.Y+door.H;
                var cue=new DoorCue{door=door,open=DoorOpen(door)};
                cue.frame=Stroke("Door jamb feedback",9,.045f,WithAlpha(accent,.32f),new Vector2(left,bottom-.05f),new Vector2(left,bottom-1.55f),new Vector2(left+.25f,bottom-1.8f));
                // Only the lower jamb and sill: destination captions remain unobstructed above.
                cue.sill=Stroke("Door threshold light",9,.065f,WithAlpha(accent,.5f),new Vector2(left,bottom-.035f),new Vector2(right,bottom-.035f));
                doors.Add(cue);
            }
            for(int i=0;i<particles.Length;i++){var sprite=Box("Pooled footnote particle",0,0,.08f,.08f,Color.clear,12);sprite.enabled=false;particles[i]=new Particle{sprite=sprite};}
            for(int i=0;i<pulses.Length;i++){var line=MakeLine("Pooled action echo",16,11,.035f);line.loop=true;line.enabled=false;pulses[i]=new Pulse{line=line};}
            lastEvent=game.Events.Count>0?game.Events[game.Events.Count-1]:null;
        }

        static Color WithAlpha(Color c,float alpha){c.a=alpha;return c;}
        Vector3 Point(float x,float y)=>new Vector3(x,game.Room.Rows-y,0);
        LineRenderer MakeLine(string name,int count,int order,float width)
        {
            var go=new GameObject(name);go.transform.SetParent(root.transform,false);
            var line=go.AddComponent<LineRenderer>();line.sharedMaterial=material;line.useWorldSpace=true;line.positionCount=count;line.startWidth=line.endWidth=width;line.sortingOrder=order;
            line.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;line.receiveShadows=false;
            return line;
        }
        LineRenderer Stroke(string name,int order,float width,Color color,params Vector2[] points)
        {
            var line=MakeLine(name,points.Length,order,width);line.startColor=line.endColor=color;
            for(int i=0;i<points.Length;i++)line.SetPosition(i,Point(points[i].x,points[i].y));return line;
        }
        SpriteRenderer Box(string name,float x,float y,float w,float h,Color color,int order=-4)
        {
            var go=new GameObject(name);go.transform.SetParent(root.transform,false);var sprite=go.AddComponent<SpriteRenderer>();sprite.sprite=white;sprite.sharedMaterial=material;sprite.sortingOrder=order;sprite.color=color;go.transform.position=Point(x+w/2,y+h/2);go.transform.localScale=new Vector3(w,h,1);return sprite;
        }
        void Label(string text,float x,float y,float size,Color color)
        {
            if(font==null||string.IsNullOrEmpty(text))return;
            var go=new GameObject("Campus note / "+text);go.transform.SetParent(root.transform,false);go.transform.position=Point(x,y);
            var label=go.AddComponent<TextMesh>();label.font=font;label.fontSize=40;label.characterSize=size;label.anchor=TextAnchor.MiddleCenter;label.text=text;label.color=color;
            var renderer=go.GetComponent<MeshRenderer>();renderer.sharedMaterial=font.material;renderer.sortingOrder=-2;
        }
        int RoomSeed(){unchecked{int seed=17;foreach(char c in game.Room.Id)seed=seed*31+c;return seed&0x7fffffff;}}
        bool ClearDressing(float x,float y)
        {
            // This is placement exclusion, not a gameplay collider. Keep props away from signposts.
            foreach(var o in game.Room.Objects)if(Mathf.Abs((float)o.X+.5f-x)<3.3f&&Mathf.Abs(o.Y-(y-1.5f))<4.7f)return false;
            foreach(var d in game.Room.Exits)if(Mathf.Abs(d.X+d.W/2f-x)<4.5f&&Mathf.Abs(d.Y+d.H-y)<5.5f)return false;
            foreach(var p in game.Room.Entries)if(Mathf.Abs(p.X-x)<2.5f&&Mathf.Abs(p.Y+1-y)<3)return false;
            return true;
        }
        void BuildDressing(int density,JObject dressing)
        {
            var choices=new List<Vector2>();
            foreach(var tile in game.Room.Tiles){
                int x=tile.X,y=tile.Y;if(!tile.Collision||x<3||x>game.Room.Cols-5||y<6||floorCells.Contains(x+","+(y-1)))continue;
                bool flat=true;for(int k=-1;k<=2;k++)if(!floorCells.Contains((x+k)+","+y)||floorCells.Contains((x+k)+","+(y-1)))flat=false;
                if(flat&&ClearDressing(x+.5f,y))choices.Add(new Vector2(x+.5f,y));
            }
            int seed=RoomSeed();var used=new List<Vector2>();
            for(int n=0;n<density;n++){
                float desiredX=n==0?game.Entry.X+7:game.Room.Cols*.69f,desiredY=n==0?game.Entry.Y+1:game.Room.Rows*.64f;
                Vector2 at=default;float best=float.MaxValue;
                foreach(var c in choices){bool near=false;foreach(var p in used)if(Vector2.Distance(p,c)<8)near=true;if(near)continue;float score=Mathf.Abs(c.x-desiredX)+Mathf.Abs(c.y-desiredY)*1.4f;if(score<best){best=score;at=c;}}
                if(best==float.MaxValue)break;used.Add(at);
                string overrideLabel=n==0&&dressing?["label"]?.Type==JTokenType.String?(string)dressing["label"]:null;
                if(overrideLabel!=null&&(overrideLabel.Length>10||Array.Exists(overrideLabel.ToCharArray(),char.IsControl)))overrideLabel=null;
                if(game.Course.Kind=="calculus")PaperCorner(at.x,at.y,seed+n,overrideLabel);
                else if(game.Course.Kind=="slacker")ClassroomCorner(at.x,at.y,seed+n,overrideLabel);
                else LabCorner(at.x,at.y,seed+n,overrideLabel);
            }
        }
        void PaperCorner(float x,float y,int seed,string caption)
        {
            // A rear-plane binder, its page tab and crossed-out working: the standable edge stays separate.
            Box("Exercise binder",x-1.8f,y-2.7f,3.6f,2.1f,paper);
            Stroke("Binder spine",-3,.035f,muted,new Vector2(x-1.45f,y-2.7f),new Vector2(x-1.45f,y-.6f));
            for(int i=0;i<3;i++)Stroke("Old pencil working",-3,.022f,muted,new Vector2(x-1.15f,y-2.25f+i*.4f),new Vector2(x+.9f-(i%2)*.6f,y-2.25f+i*.4f));
            var tab=Box("Paper tab",x+.95f,y-2.95f,.55f,.52f,WithAlpha(accent,.32f),-3);ambient.Add(new AmbientCue{sprite=tab,origin=tab.transform.position,color=tab.color,phase=seed%7,page=true});
            Stroke("Crossed out draft",-3,.025f,muted,new Vector2(x-.2f,y-1.5f),new Vector2(x+.85f,y-1.85f));
            Label(caption??new[]{"背面还能写","这步先留着","借一张草稿纸"}[seed%3],x,y-3.32f,.12f,WithAlpha(muted,.48f));
            Box("Loose paper",x-1.2f,y-.27f,1.2f,.08f,WithAlpha(paper,.36f));Box("Loose paper offset",x-.95f,y-.35f,1.15f,.07f,WithAlpha(paper,.32f));
        }
        void ClassroomCorner(float x,float y,int seed,string caption)
        {
            Box("Noticeboard backing",x-1.75f,y-3.1f,3.5f,2.0f,WithAlpha(new Color(.25f,.29f,.31f),.35f));
            Stroke("Noticeboard top",-3,.04f,muted,new Vector2(x-1.75f,y-3.1f),new Vector2(x+1.75f,y-3.1f));
            Box("Pinned course handout",x-1.28f,y-2.8f,1.45f,1.3f,paper,-3);Box("Pinned note",x+.42f,y-2.55f,.87f,.82f,WithAlpha(accent,.23f),-3);
            for(int i=0;i<3;i++)Stroke("Printed handout line",-2,.018f,muted,new Vector2(x-1.08f,y-2.55f+i*.23f),new Vector2(x-.28f,y-2.55f+i*.23f));
            Label(caption??new[]{"课件在群里","下节还在这儿","组员看下消息"}[seed%3],x,y-3.55f,.12f,WithAlpha(new Color(.9f,.84f,.7f),.51f));
            Stroke("Wall socket",-3,.025f,muted,new Vector2(x+1.2f,y-.95f),new Vector2(x+1.6f,y-.95f),new Vector2(x+1.6f,y-.55f),new Vector2(x+1.2f,y-.55f),new Vector2(x+1.2f,y-.95f));
            Stroke("Socket slots",-3,.025f,muted,new Vector2(x+1.31f,y-.84f),new Vector2(x+1.31f,y-.7f));
            Stroke("Socket slots",-3,.025f,muted,new Vector2(x+1.49f,y-.84f),new Vector2(x+1.49f,y-.7f));
            var lamp=Box("Projector standby",x+1.35f,y-2.83f,.12f,.08f,WithAlpha(accent,.5f),-2);ambient.Add(new AmbientCue{sprite=lamp,origin=lamp.transform.position,color=lamp.color,phase=seed%7});
        }
        void LabCorner(float x,float y,int seed,string caption)
        {
            Box("Bench oscilloscope shadow",x-1.4f,y-1.75f,2.8f,1.4f,WithAlpha(new Color(.22f,.35f,.38f),.35f));
            Stroke("Rear test lead",-3,.03f,muted,new Vector2(x-1.9f,y-.08f),new Vector2(x-1.9f,y-2.5f),new Vector2(x+.1f,y-2.5f),new Vector2(x+.1f,y-1.75f));
            Stroke("Oscilloscope trace",-2,.025f,WithAlpha(accent,.32f),new Vector2(x-1.05f,y-.85f),new Vector2(x-.7f,y-.85f),new Vector2(x-.5f,y-1.25f),new Vector2(x-.25f,y-.55f),new Vector2(x,y-1.05f),new Vector2(x+.3f,y-.85f));
            var led=Box("Experimental circuit lamp",x+.85f,y-.7f,.16f,.16f,WithAlpha(accent,.65f),-2);ambient.Add(new AmbientCue{sprite=led,origin=led.transform.position,color=led.color,phase=seed%7});
            Label(caption??new[]{"先断电","线别接反","数据记了吗"}[seed%3],x,y-2.9f,.12f,WithAlpha(accent,.45f));
        }
        bool DoorOpen(NativeRegion door)=>game.CampaignExitOpen&&game.ReworkExitOpen(door);
        NativeObject FindObject(string id){foreach(var o in game.Room.Objects)if(o.Id==id)return o;return null;}
        void Echo(float x,float y,Color color,bool square)
        {
            var pulse=pulses[pulseCursor++%pulses.Length];pulse.position=Point(x,y);pulse.color=color;pulse.age=0;pulse.life=.65f;pulse.square=square;pulse.line.enabled=true;
        }
        void Scatter(float x,float y,int count,Color color,bool steam,float spread=.7f)
        {
            for(int i=0;i<count;i++){
                var p=particles[particleCursor++%particles.Length];float spreadStep=(i-(count-1)*.5f)/Math.Max(1,count-1);
                p.position=Point(x,y);p.velocity=new Vector2(spreadStep*spread*2,.45f+(i%3)*.27f);p.age=0;p.life=steam?.85f:.48f+(i%3)*.09f;p.size=steam?.08f:.055f+(i%2)*.035f;p.angle=i*41;p.spin=steam?0:(i%2==0?140:-140);p.steam=steam;p.color=color;p.sprite.enabled=true;
            }
        }
        void ReadEvents()
        {
            int start=lastEvent==null?0:game.Events.IndexOf(lastEvent)+1;
            for(int i=Math.Max(0,start);i<game.Events.Count;i++){
                var e=game.Events[i];if((string)e["room"]!=game.Room.Id)continue;
                string type=(string)e["type"];var o=FindObject((string)e["id"]);
                float footX=(float)(game.Player.x+game.Player.w/2)/32,footY=(float)(game.Player.y+game.Player.h)/32;
                if(type=="land"){landing=.16f;Scatter(footX,footY-.04f,4,WithAlpha(accent,.43f),false,1.2f);}
                else if(type=="jump"){takeoff=.14f;Scatter(footX,footY,2,WithAlpha(accent,.36f),false,.4f);}
                else if(type=="dash")Scatter(footX,footY-.4f,5,WithAlpha(accent,.45f),false,.8f);
                else if(type=="checkpoint"&&o!=null){Echo(o.X+.5f,o.Y+.35f,new Color(.6f,.92f,.78f,.72f),true);Scatter(o.X+.5f,o.Y-.15f,5,WithAlpha(accent,.65f),false);}
                else if(type=="resource-used"&&o!=null){bool coffee=(double?)e["delta"]>0;Scatter(o.X+.5f,o.Y+.25f,coffee?5:7,coffee?new Color(.95f,.87f,.67f,.54f):new Color(.84f,.78f,.93f,.63f),coffee,.65f);}
                else if((type=="calculus.integral"||type=="calculus.derivative"||type=="slacker.checkin"||type=="physics.thermal")&&o!=null)Echo(o.X+.5f,o.Y+.4f,WithAlpha(accent,.68f),type!="physics.thermal");
            }
            if(game.Events.Count>0)lastEvent=game.Events[game.Events.Count-1];
        }
        public void Refresh(double dt)
        {
            if(disposed)return;ReadEvents();
            float step=game.Mode=="playing"&&game.RespawnRemaining<=0?(float)Math.Max(0,Math.Min(dt,.06)):0;clock+=step;
            landing=Mathf.Max(0,landing-step);takeoff=Mathf.Max(0,takeoff-step);
            float impact=Mathf.Sin(Mathf.PI*landing/.16f),lift=Mathf.Sin(Mathf.PI*takeoff/.14f);
            StudentScale=new Vector3(1+impact*.055f-lift*.025f,1-impact*.065f+lift*.045f,1);
            StudentTilt=Mathf.Clamp((float)game.Player.vx/100,-2.5f,2.5f)+(game.Player.grounded?(float)Math.Sin(clock*15)*Mathf.Clamp01((float)Math.Abs(game.Player.vx)/220)*.7f:0);
            foreach(var a in ambient){float wave=Mathf.Sin(clock*1.2f+a.phase);a.sprite.color=WithAlpha(a.color,a.color.a*(.86f+.14f*wave));if(a.page)a.sprite.transform.localRotation=Quaternion.Euler(0,0,wave*1.8f);}
            foreach(var d in doors){bool open=DoorOpen(d.door);if(open!=d.open){d.open=open;d.changed=.8f;if(open)Echo(d.door.X+d.door.W/2f,d.door.Y+d.door.H-.3f,WithAlpha(accent,.65f),false);}d.changed=Mathf.Max(0,d.changed-step);float glow=d.open?.42f+.08f*Mathf.Sin(clock*2):.13f;d.frame.startColor=d.frame.endColor=WithAlpha(accent,glow*.7f);d.sill.startColor=d.sill.endColor=WithAlpha(accent,glow+d.changed*.35f);}
            foreach(var p in particles){if(!p.sprite.enabled)continue;p.age+=step;if(p.age>=p.life){p.sprite.enabled=false;continue;}p.position+=p.velocity*step;if(p.steam)p.velocity.x=Mathf.Sin(clock*5+p.angle)*.13f;else p.velocity.y-=2.3f*step;p.angle+=p.spin*step;p.sprite.transform.position=p.position;p.sprite.transform.localRotation=Quaternion.Euler(0,0,p.angle);float size=p.size*(p.steam?1+p.age*.7f:1);p.sprite.transform.localScale=new Vector3(size,p.steam?size*.7f:size*.5f,1);p.sprite.color=WithAlpha(p.color,p.color.a*(1-p.age/p.life));}
            foreach(var p in pulses){if(!p.line.enabled)continue;p.age+=step;if(p.age>=p.life){p.line.enabled=false;continue;}float t=p.age/p.life,radius=.15f+t*.6f;for(int i=0;i<16;i++){float a=i*Mathf.PI/8;Vector2 v=new Vector2(Mathf.Cos(a),Mathf.Sin(a));if(p.square)v/=Mathf.Max(Mathf.Abs(v.x),Mathf.Abs(v.y));p.line.SetPosition(i,p.position+(Vector3)(v*radius));}p.line.startColor=p.line.endColor=WithAlpha(p.color,p.color.a*(1-t));}
        }
        public void Dispose()
        {
            if(disposed)return;disposed=true;root.SetActive(false);UnityEngine.Object.Destroy(root);UnityEngine.Object.Destroy(white);UnityEngine.Object.Destroy(pixel);UnityEngine.Object.Destroy(material);
        }
    }
}
