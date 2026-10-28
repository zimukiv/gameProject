using System;
using System.Collections.Generic;
using UnityEngine;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed class NativePixelWorld:IDisposable
    {
        public readonly GameObject Root;public readonly NativeMotion Game;public readonly NativeDemoAssets Assets;public readonly bool Builtin;
        readonly Dictionary<string,Sprite> pixels=new Dictionary<string,Sprite>();readonly Dictionary<string,SpriteRenderer> objects=new Dictionary<string,SpriteRenderer>();readonly Dictionary<string,SpriteRenderer> effects=new Dictionary<string,SpriteRenderer>();readonly Dictionary<string,SpriteRenderer> consoles=new Dictionary<string,SpriteRenderer>();readonly Dictionary<string,SpriteRenderer> moves=new Dictionary<string,SpriteRenderer>();
        readonly Dictionary<string,SpriteRenderer> zoneTints=new Dictionary<string,SpriteRenderer>();readonly HashSet<string> nativeSize=new HashSet<string>(StringComparer.Ordinal);SpriteRenderer roomTint;
        readonly List<Tuple<SpriteRenderer,string,MotionRect,double>> custom=new List<Tuple<SpriteRenderer,string,MotionRect,double>>();SpriteRenderer player,ai;string room;double animation;string pose;Sprite white;
        public NativePixelWorld(NativeMotion game,NativeDemoAssets assets,bool builtin){Game=game;Assets=assets;Builtin=builtin;Root=new GameObject("Physics Demo Render Candidate");Root.SetActive(false);var t=new Texture2D(1,1);t.SetPixel(0,0,Color.white);t.Apply();white=Sprite.Create(t,new Rect(0,0,1,1),new Vector2(.5f,.5f),32);try{Rebuild();}catch{Dispose();throw;}}
        Sprite Pixel(string name,bool actor=false){if(!pixels.TryGetValue(name,out var s)){var t=Resources.Load<Texture2D>("PhysicsPixel/"+name);if(t==null)throw new NativeDataException("内置像素切片缺失："+name);s=Sprite.Create(t,new Rect(0,0,t.width,t.height),actor?new Vector2(.5f,.125f):new Vector2(.5f,.5f),32);pixels.Add(name,s);}return s;}
        SpriteRenderer Add(string name,Sprite sprite,MotionRect r,int order){var go=new GameObject(name);go.transform.SetParent(Root.transform);var sr=go.AddComponent<SpriteRenderer>();sr.sprite=sprite??white;sr.sortingOrder=order;Place(sr,r);return sr;}
        void Place(SpriteRenderer sr,MotionRect r){sr.transform.position=new Vector3((float)(r.x+r.w/2)/32,Game.Room.Rows-(float)(r.y+r.h/2)/32,0);sr.transform.localScale=new Vector3((float)r.w/sr.sprite.rect.width,(float)r.h/sr.sprite.rect.height,1);}
        // Keeps the artwork's own pixel size and only centres it on the tile. Stretching every pickup to
        // the 32px tile made the 26px and 15px tokens render at exactly the same size.
        void PlaceNative(SpriteRenderer sr,MotionRect r){sr.transform.position=new Vector3((float)(r.x+r.w/2)/32,Game.Room.Rows-(float)(r.y+r.h/2)/32,0);sr.transform.localScale=Vector3.one;}
        string Bind(string type,string slot,NativeObject o=null){return NativeDemoAssets.Binding(Game.Project,Game.Course,Game.Room,type,slot,o);}
        // The editor ships nine placeholder SVGs as its built-in art; a project that only uses them
        // renders as flat boxes, which testers read as "no art". Slots bound to those exact placeholders
        // fall back to the built-in pixel art, while custom art (even reusing a seed-* id) is honoured.
        static readonly HashSet<string> PlaceholderHashes=new HashSet<string>(StringComparer.OrdinalIgnoreCase){
            "7654dd8c088c1994cb6323b680523ade7007f9489094e7476daa02512fe2333c",
            "7ced1ed4c5d649cd4f07c0155057df07b83366882c4408a488fff7d6d0fae04d",
            "23e6ac912d5eea83cd55d401f8d26a63e17a41384249ac54faab0d8461c83d9d",
            "f32967c0f98516ce8390c26bd95604fe670c16d079ccbaf5cef090776ce21992",
            "03ce6332f16b0c788d4bdedf6456477120994d74fce51466142a04f612ebfabb",
            "cc606a5d1fdfe79c2f39752f92aafb6f53846b5b856884f13e368145a0e82068",
            "a9acbaee624d85ae5ddb360d7713cc20263d47f14601a68bf923f9e8129d537c",
            "68f5595b1b90b8769a82ff5163399b6d256b1d3310edb6579084ed75ba099cad",
            "4494e03047ab7698589c0baf3b327f3e49efda905bde5eb04c20e224d3a3cf4e"};
        readonly Dictionary<string,bool> placeholderCache=new Dictionary<string,bool>(StringComparer.Ordinal);
        internal bool Placeholder(string id){
            if(string.IsNullOrEmpty(id))return false;
            if(placeholderCache.TryGetValue(id,out var cached))return cached;
            var asset=Game.Project.Assets.Find(v=>v.Id==id);
            bool placeholder=asset!=null&&asset.Bytes!=null&&PlaceholderHashes.Contains(NativeProjectLoader.Sha(asset.Bytes));
            placeholderCache[id]=placeholder;return placeholder;
        }
        Sprite Bound(string type,string slot,NativeObject o=null){string id=Bind(type,slot,o);if(id==null||Placeholder(id))return null;if(!Assets.Has(id))return null;var a=Game.Project.Assets.Find(v=>v.Id==id);return Assets.Get(id,Game.RoomTime,a?.Fps??6);}
        // An exported project package can carry no art bindings at all; fall back to the built-in pixel
        // slices so an imported level stays readable instead of turning into white/grey blocks.
        Sprite Art(string type,string slot,string fallback,NativeObject o=null,bool actor=false){if(!Builtin){var bound=Bound(type,slot,o);if(bound!=null)return bound;}return Pixel(fallback,actor);}
        void Rebuild(){foreach(Transform t in Root.transform)UnityEngine.Object.Destroy(t.gameObject);objects.Clear();zoneTints.Clear();effects.Clear();consoles.Clear();moves.Clear();custom.Clear();nativeSize.Clear();room=Game.Room.Id;var r=Game.Room;
            string bg=(string)(r.ArtBindings?.Property("background")!=null?r.ArtBindings["background"]:Game.Course.ArtBindings?["background"]);
            var backdrop=Builtin?Pixel("background"):(Assets.Has(bg)&&!Placeholder(bg)?Assets.Get(bg,0):Pixel("background"));if(backdrop!=null){var b=Add("Laboratory background",backdrop,new MotionRect(null,0,0,r.Cols*32,r.Rows*32),-20);b.color=new Color(.32f,.36f,.46f);}
            roomTint=Add("Room temperature light",white,new MotionRect(null,0,0,r.Cols*32,r.Rows*32),-15);foreach(var zone in r.Zones)zoneTints.Add(zone.Id,Add("Temperature zone "+zone.Id,white,new MotionRect(null,zone.X*32,zone.Y*32,zone.W*32,zone.H*32),-8));var cells=new HashSet<string>();foreach(var t in r.Tiles)cells.Add(t.X+","+t.Y);
            foreach(var t in r.Tiles){string n=!cells.Contains(t.X+","+(t.Y-1))?(!cells.Contains((t.X-1)+","+t.Y)?"groundTopLeft":!cells.Contains((t.X+1)+","+t.Y)?"groundTopRight":"groundTopMiddle"):"groundFill";var rect=new MotionRect(null,t.X*32,t.Y*32,32,32);var s=Add("Terrain "+t.X+","+t.Y,Art("common.solid","idle","terrain_pickups-"+n),rect,0);if(!Builtin){string id=Bind("common.solid","idle");if(id!=null&&!Placeholder(id)&&Assets.Has(id))custom.Add(Tuple.Create(s,id,rect,Game.Project.Assets.Find(v=>v.Id==id)?.Fps??6));}}
            foreach(var e in r.Exits)Add("Lab exit",Art("common.exit","idle","campus_interactables-exitOpen"),new MotionRect(null,e.X*32,e.Y*32,e.W*32,e.H*32),1);
            foreach(var o in r.Objects){var rect=Game.ObjectRect(o);var sprite=Add(o.Id,Visual(o),rect,2);objects.Add(o.Id,sprite);if(o.Type=="common.small"||o.Type=="common.coin"){nativeSize.Add(o.Id);sprite.transform.localScale=Vector3.one;}
                if(o.Type=="physics.jet"){string direction=o.Text("direction","up");float angle=direction=="left"?90f:direction=="right"?-90f:direction=="down"?180f:0f;if(angle!=0)sprite.transform.rotation=Quaternion.Euler(0,0,angle);effects.Add(o.Id,Plume(o,direction));}
                if(o.Type=="physics.thermal")consoles.Add(o.Id,Add("Central thermal control",Pixel("physics_mechanisms-coldConsole"),new MotionRect(null,o.X*32,o.Y*32-12,32,16),3));if(o.Type=="physics.rail"){
                    var path=o.Parameters["path"] as JArray;if(path!=null)for(int i=1;i<path.Count;i++){var a=path[i-1];var b=path[i];float ax=(float)a["x"],ay=(float)a["y"],bx=(float)b["x"],by=(float)b["y"];float dx=bx-ax,dy=by-ay;var rail=Add("Noncolliding electromagnetic rail",Pixel("physics_cannon-railMiddle"),new MotionRect(null,(ax+bx)*16,(ay+by)*16,32,8),1);rail.transform.position=new Vector3((ax+bx)/2,r.Rows-(ay+by)/2,0);rail.transform.localScale=new Vector3(Mathf.Sqrt(dx*dx+dy*dy),.5f,1);rail.transform.rotation=Quaternion.Euler(0,0,-Mathf.Atan2(dy,dx)*Mathf.Rad2Deg);}
                    {var barrel=Add("Decorative cannon barrel (no collider)",Pixel("physics_cannon-cannonRightIdle"),new MotionRect(null,o.X*32-16,o.Y*32-32,64,32),1);if(o.Text("direction","right")=="left")barrel.flipX=true;}
                }}
            foreach(var m in r.Movables)moves.Add(m.Id,Add(m.Id,Art("common.solid","idle","terrain_pickups-platformMiddle"),Game.MovableRect(m),2));
            player=Add("Student visual / separate 24x28 motor",Art("player","idle","player-idle00",null,true),Game.Player.Rect,10);ai=Add("CRT assistant",Art("ai","idle","ai-idle00"),new MotionRect(null,0,0,24,28),9);
        }
        // The plume art points up; place and rotate it to the jet's configured direction.
        SpriteRenderer Plume(NativeObject o,string direction){float px=(float)(o.X*32),py=(float)(o.Y*32),cx,cy,angle;if(direction=="left"){cx=px-8;cy=py+16;angle=90;}else if(direction=="right"){cx=px+72;cy=py+16;angle=-90;}else if(direction=="down"){cx=px+16;cy=py+72;angle=180;}else{cx=px+16;cy=py-8;angle=0;}
            var plume=Add("Jet noncolliding plume",Pixel("physics_cannon-jetActive"),new MotionRect(null,0,0,32,80),3);plume.transform.position=new Vector3(cx/32f,Game.Room.Rows-cy/32f,0);plume.transform.localScale=Vector3.one;plume.transform.rotation=Quaternion.Euler(0,0,angle);return plume;}
        string BuiltinName(NativeObject o){switch(o.Type){case "common.small":return "campus_interactables-tokenSmall";case "common.coin":return "campus_interactables-tokenBig";case "common.collectible":return "campus_interactables-collectibleOpen";case "common.spike":return "terrain_pickups-spike"+Cap(o.Text("direction","up"));case "common.checkpoint":return "physics_mechanisms-checkpoint"+(Game.VisualState(o)=="active"?"Active":"Idle");case "common.aiStart":return "physics_mechanisms-aiActivator"+(Game.AI.active?"On":"Off");case "physics.ice":return "terrain_pickups-ice"+Cap(Game.VisualState(o));case "physics.thermal":return "physics_cannon-thermalBlock"+Cap(Game.TemperatureAt(o));case "physics.jet":return "physics_mechanisms-jetIdle";case "physics.rail":return "physics_cannon-railStart";default:return "campus_interactables-noticeScreen";}}
        Sprite Visual(NativeObject o){if(!Builtin){var bound=Bound(o.Type,Game.VisualState(o),o);if(bound!=null)return bound;}return Pixel(BuiltinName(o));}
        static string Cap(string v){return char.ToUpperInvariant(v[0])+v.Substring(1);}
        public void Refresh(double dt,Camera camera,bool map){if(room!=Game.Room.Id)Rebuild();animation+=dt;var p=Game.Player;string next=Game.RespawnRemaining>0?"death":p.dash>0?"dash":p.crouching?"crouch":!p.grounded?(p.vy<0?"jump":"fall"):Math.Abs(p.vx)>1?"run":"idle";if(next!=pose){pose=next;animation=0;}if(Builtin||Bind("player",pose)==null&&Bind("player","idle")==null){int count=pose=="run"?6:pose=="idle"||pose=="death"?4:pose=="dash"?3:2;int f=(int)(animation*(pose=="dash"?14:pose=="idle"?6:10));f=pose=="jump"||pose=="death"||pose=="crouch"||pose=="dash"?Math.Min(count-1,f):f%count;if(pose=="dash")f=Math.Min(1,f);player.sprite=Pixel("player-"+pose+f.ToString("00"),true);player.transform.localScale=Vector3.one;player.transform.position=new Vector3((float)(p.x+p.w/2)/32,Game.Room.Rows-(float)(p.y+p.h)/32,0);player.flipX=p.face<0;ai.sprite=Pixel("ai-"+(Game.AI.active?"chase":"idle")+((int)(Game.Elapsed*8)%(Game.AI.active?6:4)).ToString("00"),true);ai.transform.localScale=Vector3.one;ai.transform.position=new Vector3((float)Game.AI.x/32,Game.Room.Rows-(float)(Game.AI.y+14)/32,0);}else{player.sprite=Bound("player",pose)??Bound("player","idle")??Pixel("player-idle00",true);Place(player,p.Rect);Place(ai,new MotionRect(null,Game.AI.x-12,Game.AI.y-14,24,28));}
            ai.enabled=Game.AI.active;foreach(var o in Game.Room.Objects){var s=objects[o.Id];s.sprite=Visual(o)??white;if(nativeSize.Contains(o.Id))PlaceNative(s,Game.ObjectRect(o));else Place(s,Game.ObjectRect(o));s.enabled=!Game.Credited.Contains(Game.Room.Id+"/"+o.Id)&&(o.Type!="physics.ice"||Game.ObjectStates[o.Id].solid);if(effects.TryGetValue(o.Id,out var effect))effect.enabled=Game.ObjectStates[o.Id].cooldown>0;if(consoles.TryGetValue(o.Id,out var console))console.sprite=Pixel("physics_mechanisms-"+(Game.TemperatureAt(o)=="hot"?"hotConsole":"coldConsole"));if(o.Type=="physics.thermal")s.color=Game.TemperatureAt(o)=="hot"?new Color(1,.82f,.7f):new Color(.7f,.9f,1);}
            foreach(var m in Game.Room.Movables)Place(moves[m.Id],Game.MovableRect(m));foreach(var c in custom){c.Item1.sprite=Assets.Get(c.Item2,Game.RoomTime,c.Item4);Place(c.Item1,c.Item3);}
            roomTint.color=TemperatureTint(Game.RoomEnvironment,.10f);foreach(var zone in zoneTints){bool hot=Game.Zones[zone.Key]=="hot";zone.Value.color=TemperatureTint(Game.Zones[zone.Key],hot?.22f:.18f);zone.Value.sortingOrder=hot?-7:-8;}bool full=map||Game.Room.CameraMode=="room";float rows=(float)(full?Game.Room.Rows:Game.Room.CameraRows),cols=(float)(full?Game.Room.Cols:Game.Room.CameraCols);float aspect=Mathf.Max(.25f,camera.aspect);float baseSize=Mathf.Max(rows/2,cols/2/aspect);camera.orthographicSize=NativeCameraView.Apply(baseSize,full,(float)Game.Room.Cols,(float)Game.Room.Rows,(float)Game.Room.CameraCols,(float)Game.Room.CameraRows,aspect);float hy=camera.orthographicSize,hx=hy*aspect;float x=full?Game.Room.Cols/2f:Mathf.Clamp((float)p.x/32,Mathf.Min(hx,Game.Room.Cols/2f),Mathf.Max(Game.Room.Cols-hx,Game.Room.Cols/2f));float y=full?Game.Room.Rows/2f:Mathf.Clamp(Game.Room.Rows-(float)p.y/32,Mathf.Min(hy,Game.Room.Rows/2f),Mathf.Max(Game.Room.Rows-hy,Game.Room.Rows/2f));camera.transform.position=new Vector3(Mathf.Round(x*32)/32,Mathf.Round(y*32)/32,-10);camera.backgroundColor=Game.RoomEnvironment=="hot"?new Color(.12f,.065f,.06f):new Color(.04f,.065f,.11f);
        }
        static Color TemperatureTint(string t,float alpha){return t=="hot"?new Color(1,.26f,.03f,alpha):new Color(.06f,.46f,1,alpha);}
        public string ThermalHint{get{int hot=0,cold=0;foreach(var o in Game.Room.Objects)if(o.Type=="physics.ice"){if(Game.TemperatureAt(o)=="hot")hot++;else cold++;}return hot+cold==0?null:hot>0&&cold==0?"温区：热 · 冰已融化，踩控温板切冷生成冰":cold>0&&hot==0?"温区：冷 · 冰可站立，持续站立会融化，离开后按设定再生":"温区：冷热并存 · 重叠区域以热为准";}}
        public void Dispose(){Root.SetActive(false);UnityEngine.Object.Destroy(Root);foreach(var s in pixels.Values)UnityEngine.Object.Destroy(s);UnityEngine.Object.Destroy(white.texture);UnityEngine.Object.Destroy(white);}
    }
}
