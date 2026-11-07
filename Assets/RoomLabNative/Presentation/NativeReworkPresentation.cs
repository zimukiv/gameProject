using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace RoomLab.Native
{
    public sealed class NativeReworkPresentation:IDisposable
    {
        readonly NativeMotion game;readonly GameObject root;readonly Sprite tile;readonly Texture2D texture;readonly Material material;readonly bool ownsTexture;
        readonly List<Tuple<JToken,SpriteRenderer,TextMesh>> platforms=new List<Tuple<JToken,SpriteRenderer,TextMesh>>();
        readonly List<LineRenderer> platformEdges=new List<LineRenderer>();
        readonly List<SpriteRenderer> patrols=new List<SpriteRenderer>();readonly List<LineRenderer> routes=new List<LineRenderer>();
        readonly LineRenderer target;readonly Font font;
        sealed class NearNote {public TextMesh text;public double first=-1;public bool inside;}
        readonly List<NearNote> notes=new List<NearNote>();
        sealed class ResourceMark {public NativeObject item;public List<LineRenderer> lines=new List<LineRenderer>();public TextMesh amount;}
        readonly List<ResourceMark> resources=new List<ResourceMark>();readonly Func<NativeObject,bool> customResource;
        public NativeReworkPresentation(NativeMotion game,Transform parent,Func<string,Sprite> actor,Func<NativeObject,bool> customResource=null)
        {
            this.customResource=customResource;this.game=game;root=new GameObject("Authored room / phase and patrol cues");root.transform.SetParent(parent,false);font=Resources.Load<Font>(game.Course.Kind=="physics"?"PhysicsPixelFont/FusionPixel":"DiegeticFont/LXGWWenKai-Regular");
            string tileKey=game.Course.Kind=="calculus"?"rework-calculus-paper-tile":"rework-"+game.Course.Kind+"-tile-4";var source=Resources.Load<Texture2D>("PhysicsPixel/"+tileKey);if(source==null){source=CreateTile(game.Course.Kind,4);ownsTexture=true;}texture=NativeAssetOverrides.Texture(tileKey,source);if(texture!=source&&ownsTexture){UnityEngine.Object.Destroy(source);ownsTexture=false;}tile=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(.5f,.5f),texture.width,0,SpriteMeshType.FullRect);material=new Material(Shader.Find("Sprites/Default"));
            if(game.IsAwarenessResource)foreach(var o in game.Room.Objects)if(o.Raw["rework"]?["clarityDelta"]!=null){
                bool coffee=(double)o.Raw["rework"]["clarityDelta"]>0;var mark=new ResourceMark{item=o};Color ink=coffee?new Color(.96f,.79f,.45f):new Color(.8f,.72f,.95f);
                void Stroke(params Vector2[] points){var line=Line(coffee?"Single-use coffee":"Single-use folded notes",points.Length);line.sortingOrder=10;line.startWidth=line.endWidth=.055f;line.startColor=line.endColor=ink;for(int i=0;i<points.Length;i++)line.SetPosition(i,Point(o.X+points[i].x,o.Y+points[i].y));mark.lines.Add(line);}
                if(coffee){Stroke(new Vector2(.16f,.35f),new Vector2(.2f,.83f),new Vector2(.68f,.83f),new Vector2(.74f,.35f),new Vector2(.16f,.35f));Stroke(new Vector2(.74f,.42f),new Vector2(.91f,.42f),new Vector2(.91f,.64f),new Vector2(.71f,.68f));Stroke(new Vector2(.35f,.27f),new Vector2(.29f,.16f),new Vector2(.37f,.03f));Stroke(new Vector2(.08f,.9f),new Vector2(.82f,.9f));}
                else{Stroke(new Vector2(.15f,.1f),new Vector2(.65f,.1f),new Vector2(.85f,.3f),new Vector2(.85f,.88f),new Vector2(.15f,.88f),new Vector2(.15f,.1f));Stroke(new Vector2(.65f,.1f),new Vector2(.65f,.3f),new Vector2(.85f,.3f));Stroke(new Vector2(.27f,.47f),new Vector2(.7f,.47f));Stroke(new Vector2(.27f,.64f),new Vector2(.61f,.64f));}
                mark.amount=Label(((double)o.Raw["rework"]["clarityDelta"]).ToString("+0;-0"),o.X+.5,o.Y-.35);mark.amount.characterSize=.12f;resources.Add(mark);
            }
            var shownBands=new HashSet<string>();
            if(game.ReworkPlatforms!=null)foreach(var p in game.ReworkPlatforms){var sr=AddSprite("Phase platform "+p["id"],tile,2);sr.drawMode=SpriteDrawMode.Tiled;sr.size=new Vector2((float?)p["w"]??1,(float?)p["h"]??1);string band=(string)p["band"],mark=(string)p["label"]??"";if(band!=null&&shownBands.Add(band))mark=band=="awake"?"□":band=="haze"?"○":"◇";var label=Label(mark,0,0);platforms.Add(Tuple.Create(p,sr,label));platformEdges.Add(Line("Standable paper edge",2));}
            foreach(var p in game.Patrols){var sr=AddSprite("巡查助手 / no collection",actor("ai-chase00"),9);sr.transform.localScale=Vector3.one;patrols.Add(sr);var line=Line("巡查路线",((JArray)p.spec["nodes"]).Count);int i=0;foreach(var n in p.spec["nodes"])line.SetPosition(i++,Point((double)n["x"],(double)n["y"]));line.startColor=line.endColor=new Color(.95f,.45f,.3f,.25f);routes.Add(line);}
            target=Line("坐标标记",5);target.startColor=target.endColor=new Color(.65f,.35f,.95f,.85f);
            if(game.Room.Raw["nativeCampaign"]?["signs"] is JArray signs)foreach(var s in signs)Label((string)s["text"],(double)s["x"],(double)s["y"]);
            foreach(var o in game.Room.Objects)if(o.Raw["rework"] is JObject m&&(m["label"]!=null||m["clarityTarget"]!=null||m["switch"]!=null||m["signal"]!=null)){string text=(string)m["label"]??(m["clarityTarget"]!=null?((double)m["clarityTarget"]<35?"小憩":(double)m["clarityTarget"]<65?"投影":"咖啡"):o.Type=="calculus.integral"?"∫":"d");var label=Label(text,o.X+.5,o.Y-1.3);if(m["clarityTarget"]!=null)notes.Add(new NearNote{text=label});}
        }
        Vector3 Point(double x,double y)=>new Vector3((float)x,game.Room.Rows-(float)y,0);
        SpriteRenderer AddSprite(string name,Sprite sprite,int order){var go=new GameObject(name);go.transform.SetParent(root.transform,false);var sr=go.AddComponent<SpriteRenderer>();sr.sprite=sprite;sr.sortingOrder=order;return sr;}
        TextMesh Label(string text,double x,double y){var go=new GameObject("Guide / "+text);go.transform.SetParent(root.transform,false);go.transform.position=Point(x,y);var tm=go.AddComponent<TextMesh>();tm.font=font;tm.fontSize=48;tm.characterSize=.19f;tm.anchor=TextAnchor.MiddleCenter;tm.text=text;tm.color=game.Course.Kind=="calculus"?new Color(.12f,.23f,.3f):new Color(.96f,.87f,.63f);var render=go.GetComponent<MeshRenderer>();render.sharedMaterial=font.material;render.sortingOrder=8;return tm;}
        LineRenderer Line(string name,int count){var go=new GameObject(name);go.transform.SetParent(root.transform,false);var l=go.AddComponent<LineRenderer>();l.sharedMaterial=material;l.positionCount=count;l.startWidth=l.endWidth=.05f;l.sortingOrder=5;return l;}
        public void Refresh()
        {
            foreach(var note in notes){double x=note.text.transform.position.x*32,y=(game.Room.Rows-note.text.transform.position.y)*32;double distance=NativeMotion.Hypot(game.Player.x-x,game.Player.y-y);bool near=distance<120;if(near&&!note.inside){note.first=game.Elapsed;note.inside=true;}if(distance>190)note.inside=false;var color=note.text.color;color.a=near&&note.first>=0?(float)Math.Max(0,Math.Min(1,(note.first+3.5-game.Elapsed)*2)):0;note.text.color=color;}
            foreach(var resource in resources){bool present=!game.IsSpent(resource.item)&&game.LayerActive(resource.item.Raw);foreach(var line in resource.lines)line.enabled=present&&!(customResource?.Invoke(resource.item)??false);bool near=NativeMotion.Hypot(game.Player.x-resource.item.X*32,game.Player.y-resource.item.Y*32)<85;resource.amount.gameObject.SetActive(present&&near);}
            int platformIndex=0;foreach(var p in platforms){var rect=game.ReworkPlatformRect(p.Item1);p.Item2.transform.position=Point((rect.x+rect.w/2)/32,(rect.y+rect.h/2)/32);bool active=game.LayerActive(p.Item1);string band=(string)p.Item1["band"];
                Color c=band=="awake"?new Color(.35f,.85f,.88f):band=="dream"?new Color(.77f,.54f,.94f):band=="haze"?new Color(.98f,.79f,.44f):game.Course.Kind=="calculus"?new Color(.82f,.78f,.69f):Color.white;float visibility=(float)game.ReworkPlatformVisibility(p.Item1);c.a=(active?1:.16f)*visibility;p.Item2.color=c;var edge=platformEdges[platformIndex++];edge.enabled=game.Course.Kind=="calculus"&&visibility>0;edge.SetPosition(0,Point(rect.x/32,rect.y/32));edge.SetPosition(1,Point((rect.x+rect.w)/32,rect.y/32));edge.startColor=edge.endColor=new Color(.3f,.29f,.25f,(active?1:.2f)*visibility);
                p.Item3.transform.position=Point((rect.x+rect.w/2)/32,rect.y/32-.35);p.Item3.color=game.Course.Kind=="calculus"?new Color(.12f,.23f,.3f,(active?1:.35f)*visibility):new Color(c.r,c.g,c.b,(active?1:.45f)*visibility);
            }
            for(int i=0;i<patrols.Count;i++){var p=game.Patrols[i];patrols[i].enabled=game.PatrolActive;routes[i].enabled=game.PatrolActive;patrols[i].transform.position=Point(p.x/32,(p.y+14)/32);patrols[i].flipX=p.direction<0;patrols[i].color=p.clock<1?new Color(1,.7f,.4f,.35f):new Color(1,.5f,.35f);}
            target.enabled=game.Course.Kind=="calculus"&&game.AI.active&&game.CampaignSkill=="charge";if(target.enabled){var p=game.ReworkSkillTarget;var a=Point(p.x/32,p.y/32);for(int i=0;i<5;i++){float angle=i*Mathf.PI/2;target.SetPosition(i,a+new Vector3(Mathf.Cos(angle)*.65f,Mathf.Sin(angle)*.65f,0));}}
        }
        // Crisp project-native tile art, matching paper rulers / classroom desk edges.
        public static Texture2D CreateTile(string kind,int index)
        {
            var t=new Texture2D(32,32,TextureFormat.RGBA32,false);t.filterMode=FilterMode.Point;t.wrapMode=TextureWrapMode.Clamp;
            Color ink=kind=="calculus"?new Color(.2f,.29f,.35f):new Color(.23f,.26f,.36f),top=kind=="calculus"?new Color(.91f,.86f,.68f):new Color(.76f,.58f,.36f);
            for(int y=0;y<32;y++)for(int x=0;x<32;x++){Color c=ink;if(y>=27)c=top;else if(y==26)c=new Color(.22f,.64f,.67f);else if(x==0||y==0||x==31)c=ink*.7f;else if(y==7)c=Color.Lerp(ink,top,.12f);if(kind=="calculus"&&y>=28&&x%8==0)c=ink;t.SetPixel(x,y,c);}
            if(index==5||index==6){for(int y=10;y<24;y++)for(int x=4;x<28;x++)t.SetPixel(x,y,index==5?new Color(.18f,.67f,.61f):new Color(.7f,.42f,.6f));}
            t.Apply();return t;
        }
        public void Dispose(){UnityEngine.Object.Destroy(root);UnityEngine.Object.Destroy(tile);if(ownsTexture)UnityEngine.Object.Destroy(texture);UnityEngine.Object.Destroy(material);}
    }
}
