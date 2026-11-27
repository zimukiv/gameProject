using System;
using System.Collections.Generic;
using UnityEngine;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed partial class NativePixelWorld:IDisposable
    {
        public readonly GameObject Root;public readonly NativeMotion Game;public readonly NativeDemoAssets Assets;public readonly bool Builtin;
        readonly Dictionary<string,Sprite> pixels=new Dictionary<string,Sprite>();readonly Dictionary<string,SpriteRenderer> objects=new Dictionary<string,SpriteRenderer>();readonly Dictionary<string,SpriteRenderer> consoles=new Dictionary<string,SpriteRenderer>();readonly Dictionary<string,SpriteRenderer> moves=new Dictionary<string,SpriteRenderer>();
        readonly List<Tuple<NativeRegion,SpriteRenderer>> exits=new List<Tuple<NativeRegion,SpriteRenderer>>();
        readonly List<Tuple<NativeRegion,SpriteRenderer>> entryDoors=new List<Tuple<NativeRegion,SpriteRenderer>>();
        readonly HashSet<string> authoredExits=new HashSet<string>(StringComparer.Ordinal);
        readonly Dictionary<string,SpriteRenderer> zoneTints=new Dictionary<string,SpriteRenderer>();readonly HashSet<string> nativeSize=new HashSet<string>(StringComparer.Ordinal);SpriteRenderer roomTint;
        readonly List<Tuple<JToken,SpriteRenderer>> phaseTiles=new List<Tuple<JToken,SpriteRenderer>>();
        readonly List<Tuple<SpriteRenderer,string,MotionRect,double>> custom=new List<Tuple<SpriteRenderer,string,MotionRect,double>>();SpriteRenderer player,ai;string room;double animation;string pose;Sprite white;
        NativeReworkPresentation reworkPresentation;readonly List<Texture2D> generatedTextures=new List<Texture2D>();NativeCampaignEffects campaignEffects;NativeMathPresentation mathPresentation;NativeDreamPresentation dreamPresentation;NativeGuidedPresentation guidedPresentation;SpriteRenderer themeBackdrop;bool authorBackdrop;
        public NativePixelWorld(NativeMotion game,NativeDemoAssets assets,bool builtin){Game=game;Assets=assets;Builtin=builtin;Root=new GameObject("Physics Demo Render Candidate");Root.SetActive(false);var t=new Texture2D(1,1);t.SetPixel(0,0,Color.white);t.Apply();white=Sprite.Create(t,new Rect(0,0,1,1),new Vector2(.5f,.5f),32);try{Rebuild();}catch{Dispose();throw;}}
        Sprite Pixel(string name,bool actor=false){if(!pixels.TryGetValue(name,out var s)){var t=NativeAssetOverrides.Texture(name,Resources.Load<Texture2D>("PhysicsPixel/"+name));if(t==null)throw new NativeDataException("内置像素切片缺失："+name);s=Sprite.Create(t,new Rect(0,0,t.width,t.height),actor?new Vector2(.5f,.125f):new Vector2(.5f,.5f),32);pixels.Add(name,s);}return s;}
        Sprite ThemeMechanism(NativeObject o){
            int column=o.Type=="calculus.integral"?0:o.Type=="calculus.derivative"?1:o.Type=="slacker.checkin"?2:o.Type=="slacker.awake"?3:-1;
            if(column<0)return null;
            if(Game.Course.Kind=="calculus"&&column<2)return WorldSlice(column+5);
            bool active=RenderState(o)=="active";string key="theme-"+column+(active?"-active":"-idle");
            if(!pixels.TryGetValue(key,out var sprite)){
                var texture=NativeAssetOverrides.Texture("theme-mechanisms",Resources.Load<Texture2D>("PhysicsPixel/theme-mechanisms"));
                // Generated atlas 1254x1254; bounds use Unity bottom-left coordinates.
                int[] left={24,336,648,944};int[] width={288,272,268,288};
                sprite=Sprite.Create(texture,new Rect(left[column],active?202:738,width[column],310),new Vector2(.5f,.5f),32);
                pixels.Add(key,sprite);
            }return sprite;
        }
        Sprite ReworkTile(int index){string key="revision-tile-"+Game.Course.Kind+"-"+index;if(!pixels.TryGetValue(key,out var sprite)){string tileKey=Game.Course.Kind=="calculus"?"rework-calculus-paper-tile":"rework-"+Game.Course.Kind+"-tile-"+index;var texture=Resources.Load<Texture2D>("PhysicsPixel/"+tileKey);if(texture==null){texture=NativeReworkPresentation.CreateTile(Game.Course.Kind,index);generatedTextures.Add(texture);}texture=NativeAssetOverrides.Texture(tileKey,texture);sprite=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(.5f,.5f),32);pixels[key]=sprite;}return sprite;}
        Sprite WorldSlice(int index){if(Game.IsRework&&index<7)return ReworkTile(index);
            string kind=Game.Course.Kind,key=kind+"-world-"+index;
            if(pixels.TryGetValue(key,out var cached))return cached;
            var texture=NativeAssetOverrides.Texture(kind+"-world",Resources.Load<Texture2D>("PhysicsPixel/"+kind+"-world"));
            // Source atlas 1774x887. Rectangles below are x, top, width, height.
            Rect[] rects=kind=="calculus"?new[]{new Rect(72,56,330,338),new Rect(490,56,350,338),new Rect(934,56,340,338),new Rect(1378,65,338,328),new Rect(56,508,340,336),new Rect(478,554,370,232),new Rect(924,554,362,232),new Rect(1362,480,378,364)}:new[]{new Rect(54,49,350,346),new Rect(490,49,350,346),new Rect(934,49,350,346),new Rect(1370,49,350,346),new Rect(32,574,382,218),new Rect(520,490,292,300),new Rect(936,474,342,356),new Rect(1354,436,388,416)};
            var r=rects[index];r.y=texture.height-r.y-r.height;
            cached=Sprite.Create(texture,r,new Vector2(.5f,.5f),32);pixels.Add(key,cached);return cached;
        }
        Sprite WorldArt(string type,string fallback,int index){
            if(!Builtin){var authored=Bound(type,"idle");if(authored!=null)return authored;}
            return Game.Course.Kind=="calculus"||Game.Course.Kind=="slacker"?WorldSlice(index):Pixel(fallback);
        }
        SpriteRenderer Add(string name,Sprite sprite,MotionRect r,int order){var go=new GameObject(name);go.transform.SetParent(Root.transform);var sr=go.AddComponent<SpriteRenderer>();sr.sprite=sprite??white;sr.sortingOrder=order;Place(sr,r);return sr;}
        void Place(SpriteRenderer sr,MotionRect r){sr.transform.position=new Vector3((float)(r.x+r.w/2)/32,Game.Room.Rows-(float)(r.y+r.h/2)/32,0);sr.transform.localScale=new Vector3((float)r.w/sr.sprite.rect.width,(float)r.h/sr.sprite.rect.height,1);}
        // Keeps the artwork's own pixel size and only centres it on the tile. Stretching every pickup to
        // the 32px tile made the 26px and 15px tokens render at exactly the same size.
        void PlaceNative(SpriteRenderer sr,MotionRect r){sr.transform.position=new Vector3((float)(r.x+r.w/2)/32,Game.Room.Rows-(float)(r.y+r.h/2)/32,0);sr.transform.localScale=Vector3.one;}
        string Bind(string type,string slot,NativeObject o=null){return NativeDemoAssets.Binding(Game.Project,Game.Course,Game.Room,type,slot,o);}
        // The editor ships thirteen placeholder SVGs as its built-in art; a project that only uses them
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
            "4494e03047ab7698589c0baf3b327f3e49efda905bde5eb04c20e224d3a3cf4e",
            "beef45b44661c2540093ed4ab322c9d98de1bc9e76372864323840e84468ba8c",
            "a31c43b76d73d875ccdb93a9f6fbf430d004552d5013e3f1f07314dcb7581a8e",
            "14a9f72267b91b29018c67a34adde61e369d57859d7c21eac5b674779f651534",
            "d7b44300ee63fd093f7274b55f11c2255afca7fcb29506bb252cbc603fdbb1b7"};
        readonly Dictionary<string,bool> placeholderCache=new Dictionary<string,bool>(StringComparer.Ordinal);
        internal bool Placeholder(string id){
            if(string.IsNullOrEmpty(id))return false;
            if(placeholderCache.TryGetValue(id,out var cached))return cached;
            var asset=Game.Project.Assets.Find(v=>v.Id==id);
            bool placeholder=asset!=null&&asset.Bytes!=null&&PlaceholderHashes.Contains(NativeProjectLoader.Sha(asset.Bytes));
            placeholderCache[id]=placeholder;return placeholder;
        }
        // 出口画在判定用的同一份实时矩形上：绑了机关砖就跟着砖走，没绑定等同作者坐标。
        MotionRect ExitVisualRect(NativeRegion exit,bool authored)
        {
            var live=Game.ExitRect(exit);
            return authored?live:new MotionRect(null,(live.x+live.w/2.0)-32,live.y+live.h-96,64,96);
        }
        MotionRect EntryDoorRect(NativeRegion entry)
        {
            var live=Game.EntryRect(entry);
            return new MotionRect(null,live.x+live.w*.5-32,live.y+live.h-96,64,96);
        }
        Sprite Bound(string type,string slot,NativeObject o=null){string id=Bind(type,slot,o);if(id==null||Placeholder(id))return null;if(!Assets.Has(id))return null;var a=Game.Project.Assets.Find(v=>v.Id==id);return Assets.Get(id,Game.RoomTime,a?.Fps??6);}
        // An exported project package can carry no art bindings at all; fall back to the built-in pixel
        // slices so an imported level stays readable instead of turning into white/grey blocks.
        Sprite Art(string type,string slot,string fallback,NativeObject o=null,bool actor=false){if(!Builtin){var bound=Bound(type,slot,o);if(bound!=null)return bound;}return Pixel(fallback,actor);}
        void Rebuild(){guidedPresentation?.Dispose();guidedPresentation=null;reworkPresentation?.Dispose();reworkPresentation=null;campaignEffects?.Dispose();campaignEffects=null;mathPresentation?.Dispose();mathPresentation=null;dreamPresentation?.Dispose();dreamPresentation=null;themeBackdrop=null;previewVignette=null;foreach(Transform t in Root.transform)UnityEngine.Object.Destroy(t.gameObject);objects.Clear();teacherVisualX.Clear();zoneTints.Clear();consoles.Clear();moves.Clear();custom.Clear();phaseTiles.Clear();exits.Clear();entryDoors.Clear();authoredExits.Clear();nativeSize.Clear();room=Game.Room.Id;var r=Game.Room;
            string bg=(string)(r.ArtBindings?.Property("background")!=null?r.ArtBindings["background"]:Game.Course.ArtBindings?["background"]);
            if(UseWebPreviewBackground) BuildWebPreviewBackground();else { authorBackdrop=!Builtin&&Assets.Has(bg)&&!Placeholder(bg);string backgroundName=Game.IsRework&&Game.Course.Kind=="calculus"?"rework-calculus-background":Game.IsRework&&Game.Course.Kind=="slacker"?"rework-classroom-awake":Game.Course.Kind=="calculus"?"calculus-background":Game.Course.Kind=="slacker"?"slacker-background":"background";var backdrop=Builtin?Pixel(backgroundName):(Assets.Has(bg)&&!Placeholder(bg)?Assets.Get(bg,0):Pixel(backgroundName));if(backdrop!=null){var b=Add("Laboratory background",backdrop,new MotionRect(null,0,0,r.Cols*32,r.Rows*32),-20);themeBackdrop=b;b.color=(Assets.Has(bg)&&!Placeholder(bg)&&!Builtin)||Game.Course.Kind!="physics"?Color.white:new Color(.42f,.46f,.56f);} }
            roomTint=Add("Room temperature light",white,new MotionRect(null,0,0,r.Cols*32,r.Rows*32),-15);foreach(var zone in r.Zones)zoneTints.Add(zone.Id,Add("Temperature zone "+zone.Id,white,new MotionRect(null,zone.X*32,zone.Y*32,zone.W*32,zone.H*32),-9));var cells=new HashSet<string>();foreach(var t in r.Tiles)cells.Add(t.X+","+t.Y);
            foreach(var t in r.Tiles){string n=!cells.Contains(t.X+","+(t.Y-1))?(!cells.Contains((t.X-1)+","+t.Y)?"groundTopLeft":!cells.Contains((t.X+1)+","+t.Y)?"groundTopRight":"groundTopMiddle"):"groundFill";var rect=new MotionRect(null,t.X*32,t.Y*32,32,32);var s=Add("Terrain "+t.X+","+t.Y,WorldArt("common.solid","terrain_pickups-"+n,n=="groundTopLeft"?0:n=="groundTopMiddle"?1:n=="groundTopRight"?2:3),rect,0);if(Game.IsRework&&Game.Course.Kind=="calculus"&&(Builtin||Bound("common.solid","idle")==null)){s.color=new Color(.82f,.78f,.69f);if(!cells.Contains(t.X+","+(t.Y-1))){var edge=Add("Paper standable edge",white,new MotionRect(null,t.X*32,t.Y*32,32,2),3);edge.color=new Color(.30f,.29f,.25f);}}if(Game.IsRework&&t.Raw["rework"]!=null)phaseTiles.Add(Tuple.Create((JToken)t.Raw,s));if(!Builtin){string id=Bind("common.solid","idle");if(id!=null&&!Placeholder(id)&&Assets.Has(id))custom.Add(Tuple.Create(s,id,rect,Game.Project.Assets.Find(v=>v.Id==id)?.Fps??6));}}
            foreach(var e in r.Exits){
                var exitArt=WorldArt("common.exit","campus_interactables-exitOpen",7);
                bool authored=!Builtin&&Bound("common.exit","idle")!=null;
                if(authored)authoredExits.Add(e.Id);
                exits.Add(Tuple.Create(e,Add("Lab exit / window / noncolliding visual",exitArt,ExitVisualRect(e,authored),1)));
            }
            if(Game.IsEditorBuild15)foreach(var entry in r.Entries){
                if(r.Exits.Exists(exit=>MotionRect.Overlap(Game.ExitRect(exit),Game.EntryRect(entry))))continue;
                var art=WorldArt("common.exit","campus_interactables-exitOpen",7);
                entryDoors.Add(Tuple.Create(entry,Add("Room entrance door",art,EntryDoorRect(entry),1)));
            }
            foreach(var o in r.Objects){var rect=Game.ObjectRect(o);var sprite=Add(o.Id,Visual(o),rect,2);objects.Add(o.Id,sprite);if(o.Type=="common.small"||o.Type=="common.coin"){nativeSize.Add(o.Id);sprite.transform.localScale=Vector3.one;}
                if(o.Type=="physics.jet"){string direction=o.Text("direction","up");float angle=direction=="left"?90f:direction=="right"?-90f:direction=="down"?180f:0f;if(angle!=0)sprite.transform.rotation=Quaternion.Euler(0,0,angle);}
                if(o.Type=="physics.thermal")consoles.Add(o.Id,Add("Central thermal control",Pixel("physics_mechanisms-coldConsole"),new MotionRect(null,o.X*32,o.Y*32-12,32,16),3));if(o.Type=="physics.rail"){
                    var path=o.Parameters["path"] as JArray;if(path!=null)for(int i=1;i<path.Count;i++){var a=path[i-1];var b=path[i];float ax=(float)a["x"],ay=(float)a["y"],bx=(float)b["x"],by=(float)b["y"];float dx=bx-ax,dy=by-ay;var rail=Add("Noncolliding electromagnetic rail",Pixel("physics_cannon-railMiddle"),new MotionRect(null,(ax+bx)*16,(ay+by)*16,32,8),1);rail.transform.position=new Vector3((ax+bx)/2,r.Rows-(ay+by)/2,0);rail.transform.localScale=new Vector3(Mathf.Sqrt(dx*dx+dy*dy),.5f,1);rail.transform.rotation=Quaternion.Euler(0,0,-Mathf.Atan2(dy,dx)*Mathf.Rad2Deg);}
                    {var barrel=Add("Decorative cannon barrel (no collider)",Pixel("physics_cannon-cannonRightIdle"),new MotionRect(null,o.X*32-16,o.Y*32-32,64,32),1);if(o.Text("direction","right")=="left")barrel.flipX=true;}
                }}
            foreach(var m in r.Movables)moves.Add(m.Id,Add(m.Id,WorldArt("common.solid","terrain_pickups-platformMiddle",4),Game.MovableRect(m),2));
            player=Add("Student visual / separate 24x28 motor",Art("player","idle","player-idle00",null,true),Game.Player.Rect,10);assistantWasVisible=false;ai=Add("CRT assistant",Art("ai","idle","ai-idle00"),new MotionRect(null,0,0,24,28),9);
            if(Game.IsRework)reworkPresentation=new NativeReworkPresentation(Game,Root.transform,name=>Pixel(name,true),o=>!Builtin&&Bound(o.Type,RenderState(o),o)!=null);if(Game.IsCampaign||NativeDisplayCopy.Active(Game))campaignEffects=new NativeCampaignEffects(Game,Root.transform);if(Game.Course.Kind=="calculus")mathPresentation=new NativeMathPresentation(Game,Root.transform,authorBackdrop);
            if(Game.Course.Kind=="slacker")dreamPresentation=new NativeDreamPresentation(Game,Root.transform);
            if(Game.IsGuided)guidedPresentation=new NativeGuidedPresentation(Game,Root.transform);
        }
        string RenderState(NativeObject o)=>Game.IsAwarenessResource&&o.Type=="common.checkpoint"?(Game.ResourceAnchorRoom==Game.Room.Id&&Game.ResourceAnchor?.checkpoint.id==o.Id?"active":"idle"):Game.VisualState(o);
        string BuiltinName(NativeObject o){switch(o.Type){case "common.small":return "campus_interactables-tokenSmall";case "common.coin":return "campus_interactables-tokenBig";case "common.collectible":return "campus_interactables-collectibleOpen";case "common.spike":return "terrain_pickups-spike"+Cap(Game.SpikeFacing(o));case "common.checkpoint":return "physics_mechanisms-checkpoint"+(RenderState(o)=="active"?"Active":"Idle");case "common.aiStart":return "physics_mechanisms-aiActivator"+(Game.AI.active?"On":"Off");case "physics.ice":return "terrain_pickups-ice"+Cap(RenderState(o));case "physics.thermal":return "physics_cannon-thermalBlock"+Cap(Game.TemperatureAt(o));case "physics.jet":return "physics_mechanisms-jetIdle";case "physics.rail":return "physics_cannon-railStart";default:return "campus_interactables-noticeScreen";}}
        readonly Dictionary<string,float> teacherVisualX = new Dictionary<string,float>();
        void PlaceTeacherArt(SpriteRenderer renderer,NativeObject teacher)
        {
            var r=Game.ObjectRect(teacher);
            float x=(float)(r.x+r.w*.5)/32;
            if(teacherVisualX.TryGetValue(teacher.Id,out var previous)&&Mathf.Abs(x-previous)>.0001f)
                renderer.flipX=x<previous;
            teacherVisualX[teacher.Id]=x;
            renderer.transform.position=new Vector3(x,Game.Room.Rows-(float)(r.y+r.h)/32,0);
            renderer.transform.localScale=Vector3.one;
        }
        Sprite TeacherArt(NativeObject teacher)
        {
            var state=Game.ObjectStates[teacher.Id];
            if(Game.IsBuild15TeacherAlert(teacher))return Pixel("supplement-slacker_teacher_alert",true);
            bool walking=teacher.Parameters["path"] is JArray path&&path.Count>0||
                teacher.Number("speed",1.5)>0&&teacher.Number("patrolMinX",0)!=teacher.Number("patrolMaxX",4);
            int frame=(int)(state.teacherTime*(walking?8:3))%(walking?4:2);
            return Pixel("supplement-slacker_teacher_"+(walking?"walk_":"idle_")+frame.ToString("00"),true);
        }
        Sprite Visual(NativeObject o){if(Game.IsEditorBuild15){
            switch(o.Type){
                case "item.calculator":return Pixel("supplement-common_calculator");
                case "item.icedTea":return Pixel("supplement-common_icedtea");
                case "item.phone":return Pixel("supplement-common_phone");
                case "slacker.teacher":return TeacherArt(o);
            }
        }if(!Builtin){var bound=Bound(o.Type,RenderState(o),o);if(bound!=null)return bound;}return ThemeMechanism(o)??Pixel(BuiltinName(o));}
        static string Cap(string v){return char.ToUpperInvariant(v[0])+v.Substring(1);}
        public Transform EffectsRoot{get{return Root.transform;}}
        public Sprite Fx(string name){return Pixel(name);}
        NativeWorldEffects worldEffects;
        string assistantAction;
        double assistantActionStarted;
        bool assistantWasVisible;

        static float KeepSpriteInside(float position,float min,float max,float lowOffset,float highOffset)
        {
            float low=min-lowOffset, high=max-highOffset;
            return low<=high ? Mathf.Clamp(position,low,high) : (low+high)*.5f;
        }

        void RefreshAssistant(Camera camera)
        {
            bool visible=Game.AI.active&&Game.AiSpawnDelay<=0;
            ai.enabled=visible;
            if(!visible){assistantWasVisible=false;return;}

            string action=Game.AssistantStarting ? "idle" : Game.AI.warning!=null||Game.CampaignSkill=="charge" ? "skill" :
                worldEffects.KnockbackPlaying||Game.CampaignSkill=="recover" ? "knockback" : "chase";
            if(!assistantWasVisible||assistantAction!=action||Game.Elapsed<assistantActionStarted){
                assistantWasVisible=true;
                assistantAction=action;
                assistantActionStarted=Game.Elapsed;
            }
            double time=Game.Elapsed-assistantActionStarted;
            int frames=action=="idle"?1:action=="skill"?4:action=="knockback"?2:6;
            int sample=(int)(time*(action=="skill"?10:8));
            int frame=action=="knockback"?Math.Min(sample,frames-1):sample%frames;
            var customSprite=Builtin?null:Bound("ai",action)??Bound("ai","idle");
            ai.sprite=customSprite??Pixel("ai-"+action+frame.ToString("00"),true);
            ai.color=Game.CampaignSkill=="burst"?new Color(1,.7f,.55f):Color.white;

            // Keep the full visual (including the pivot offset) inside room edges.
            // Do not pull an actor from outside the camera view onto the screen.
            var rect=new MotionRect(null,Game.AI.x-12,Game.AI.y-14,24,28);
            if(customSprite!=null)Place(ai,rect);
            else{
                ai.transform.localScale=Vector3.one;
                ai.transform.position=new Vector3((float)Game.AI.x/32,Game.Room.Rows-(float)(Game.AI.y+14)/32,0);
            }
            var position=ai.transform.position;
            var bounds=ai.bounds;
            var low=bounds.min-position;
            var high=bounds.max-position;
            position.x=KeepSpriteInside(position.x,0,Game.Room.Cols,low.x,high.x);
            position.y=KeepSpriteInside(position.y,0,Game.Room.Rows,low.y,high.y);

            var center=camera.transform.position;
            float halfHeight=camera.orthographicSize,halfWidth=halfHeight*camera.aspect;
            float left=center.x-halfWidth,right=center.x+halfWidth;
            float bottom=center.y-halfHeight,top=center.y+halfHeight;
            if(position.x>=left&&position.x<=right&&position.y>=bottom&&position.y<=top){
                position.x=KeepSpriteInside(position.x,Mathf.Max(0,left),Mathf.Min(Game.Room.Cols,right),low.x,high.x);
                position.y=KeepSpriteInside(position.y,Mathf.Max(0,bottom),Mathf.Min(Game.Room.Rows,top),low.y,high.y);
            }
            ai.transform.position=position;
        }

        JObject lastImpactEvent;
        float hitFlash;
        Color hitTint;
        void RefreshHitFeedback(double dt)
        {
            hitFlash=Mathf.Max(0,hitFlash-(float)dt);
            var events=Game.Events;
            if(events.Count>0&&!ReferenceEquals(lastImpactEvent,events[events.Count-1]))
            {
                int start=lastImpactEvent==null?0:events.IndexOf(lastImpactEvent)+1;
                for(int i=start;i<events.Count;i++)
                {
                    var entry=events[i];
                    if((string)entry["room"]!=Game.Room.Id)continue;
                    var kind=(string)entry["type"];
                    if(kind!="assistant-impact"&&kind!="teacher-knockback")continue;
                    hitTint=kind=="assistant-impact"?new Color(.42f,.92f,1f):new Color(1f,.48f,.27f);
                    hitFlash=.32f;
                }
                lastImpactEvent=events[events.Count-1];
            }
            float pulse=hitFlash/.32f;
            player.color=pulse>0?Color.Lerp(hitTint,Color.white,Mathf.Abs(Mathf.Sin(pulse*14))*.6f):Color.white;
            if(pulse>0)player.transform.localScale+=new Vector3(.12f,-.08f,0)*pulse;
        }

        public void Refresh(double dt,Camera camera,bool map){if(room!=Game.Room.Id)Rebuild();worldEffects??=new NativeWorldEffects(EffectsRoot,Fx,()=>Game);worldEffects.TrackPlayer();worldEffects.Tick(dt);if(Game.IsGuided&&Game.Mode!="playing")dt=0;animation+=dt;var p=Game.Player;string next=Game.RespawnRemaining>0?"death":p.dash>0?"dash":p.crouching?"crouch":!p.grounded?(p.vy<0?"jump":"fall"):Math.Abs(p.vx)>1?"run":"idle";if(next!=pose){pose=next;animation=0;}if(Builtin||Bind("player",pose)==null&&Bind("player","idle")==null){int count=pose=="run"?6:pose=="idle"||pose=="death"?4:pose=="dash"?3:2;int f=(int)(animation*(pose=="dash"?14:pose=="idle"?6:10));f=pose=="jump"||pose=="death"||pose=="crouch"||pose=="dash"?Math.Min(count-1,f):f%count;if(pose=="dash")f=Math.Min(1,f);player.sprite=Pixel("player-"+pose+f.ToString("00"),true);player.transform.localScale=Vector3.one;player.transform.position=new Vector3((float)(p.x+p.w/2)/32,Game.Room.Rows-(float)(p.y+p.h)/32,0);player.flipX=p.face<0;}else{player.sprite=Bound("player",pose)??Bound("player","idle")??Pixel("player-idle00",true);Place(player,p.Rect);}
            RefreshHitFeedback(dt);
            guidedPresentation?.Refresh(dt);if(guidedPresentation!=null&&Builtin){player.transform.localScale=guidedPresentation.StudentScale;player.transform.localRotation=Quaternion.Euler(0,0,guidedPresentation.StudentTilt);}
            if(Game.IsRework)foreach(var e in exits)e.Item2.color=Game.CampaignExitOpen&&Game.ReworkExitOpen(e.Item1)?Color.white:new Color(.48f,.48f,.46f,.75f);reworkPresentation?.Refresh();campaignEffects?.Refresh();mathPresentation?.Refresh(dt);dreamPresentation?.Refresh(dt);if(dreamPresentation!=null&&themeBackdrop!=null&&!authorBackdrop){if(Game.IsRework){themeBackdrop.sprite=Pixel(Game.AwarenessBand=="dream"?"rework-classroom-dream":"rework-classroom-awake");themeBackdrop.color=Game.AwarenessBand=="haze"?new Color(.77f,.74f,.84f):Color.white;}else themeBackdrop.color=Color.Lerp(new Color(.66f,.61f,.78f),Color.white,dreamPresentation.Clarity);}
            foreach(var o in Game.Room.Objects){var s=objects[o.Id];s.sprite=Visual(o)??white;if(Game.IsEditorBuild15&&o.Type=="slacker.teacher")PlaceTeacherArt(s,o);else if(nativeSize.Contains(o.Id))PlaceNative(s,Game.ObjectRect(o));else Place(s,Game.ObjectRect(o));s.enabled=(Game.Rules==NativeGameplayRules.EditorBuild15&&o.Type=="common.coin")?!Game.ObjectStates[o.Id].used:!Game.Credited.Contains(Game.Room.Id+"/"+o.Id)&&!Game.IsSpent(o)&&!Game.IsBuild15TeacherRemoved(o)&&!(Game.IsAwarenessResource&&o.Raw["rework"]?["clarityDelta"]!=null&&(Builtin||Bound(o.Type,RenderState(o),o)==null));if(o.Type=="common.coin")s.color=Game.Credited.Contains(Game.Room.Id+"/"+o.Id)?new Color(.52f,.54f,.58f):Color.white;if(Game.IsRework)s.color=Game.LayerActive(o.Raw)?Color.white:new Color(.6f,.7f,.9f,.12f);if(Game.IsCampaign&&Game.LayerActive(o.Raw)&&o.Type=="common.collectible"){s.transform.position+=new Vector3(0,(float)Math.Sin(Game.Elapsed*3+o.X)*.08f,0);s.color=Color.Lerp(Color.white,new Color(.65f,1,1),(float)(Math.Sin(Game.Elapsed*3)*.5+.5));}
                if(Game.LayerActive(o.Raw)&&(o.Type=="calculus.integral"||o.Type=="calculus.derivative")&&(Builtin||Bound(o.Type,RenderState(o),o)==null))s.color=RenderState(o)=="active"?new Color(.65f,.85f,1):Color.white;
                if(o.Type=="physics.ice"){
                    bool solid=Game.ObjectStates[o.Id].solid;
                    bool authored=!Builtin&&Bound(o.Type,RenderState(o),o)!=null;
                    s.color=solid||authored?Color.white:new Color(.65f,.85f,1,.32f);
                    // A low puddle marks the missing platform, never its former standable top.
                    if(!solid&&!authored){var footprint=Game.ObjectRect(o);Place(s,new MotionRect(null,footprint.x,footprint.y+footprint.h-3,footprint.w,3));}
                }
                if(consoles.TryGetValue(o.Id,out var console)){console.enabled=Builtin||Bound(o.Type,RenderState(o),o)==null;console.sprite=Pixel("physics_mechanisms-"+(Game.TemperatureAt(o)=="hot"?"hotConsole":"coldConsole"));}if(o.Type=="physics.thermal")s.color=!Builtin&&Bound(o.Type,RenderState(o),o)!=null?Color.white:Game.TemperatureAt(o)=="hot"?new Color(1,.82f,.7f):new Color(.7f,.9f,1);if(Game.IsRework&&!Game.LayerActive(o.Raw)){var color=s.color;color.a=.12f;s.color=color;if(consoles.TryGetValue(o.Id,out var hiddenConsole))hiddenConsole.enabled=false;}}
            foreach(var t in phaseTiles)t.Item2.color=Game.LayerActive(t.Item1)?Color.white:new Color(.6f,.7f,.9f,.16f);foreach(var m in Game.Room.Movables){Place(moves[m.Id],Game.MovableRect(m));if(Game.IsRework)moves[m.Id].color=Game.LayerActive(m.Raw)?Color.white:new Color(.6f,.7f,.9f,.16f);}foreach(var e in exits)Place(e.Item2,ExitVisualRect(e.Item1,authoredExits.Contains(e.Item1.Id)));foreach(var e in entryDoors)Place(e.Item2,EntryDoorRect(e.Item1));foreach(var c in custom){c.Item1.sprite=Assets.Get(c.Item2,Game.RoomTime,c.Item4);Place(c.Item1,c.Item3);}
            roomTint.color=TemperatureTint(Game.RoomEnvironment,Game.Course.Kind=="physics"&&!Game.IsEditorBuild15?.10f:0);foreach(var zone in zoneTints){bool hot=Game.Zones[zone.Key]=="hot";zone.Value.color=TemperatureTint(Game.Zones[zone.Key],Game.Course.Kind!="physics"||Game.IsEditorBuild15?0:hot?.22f:.18f);zone.Value.sortingOrder=hot?-7:-8;}bool full=map||Game.Room.CameraMode=="room";float rows=(float)(full?Game.Room.Rows:Game.Room.CameraRows),cols=(float)(full?Game.Room.Cols:Game.Room.CameraCols);float aspect=Mathf.Max(.25f,camera.aspect);float baseSize=Mathf.Max(rows/2,cols/2/aspect);camera.orthographicSize=Game.IsEditorBuild15&&!full?baseSize:NativeCameraView.Apply(baseSize,full,(float)Game.Room.Cols,(float)Game.Room.Rows,(float)Game.Room.CameraCols,(float)Game.Room.CameraRows,aspect);float hy=camera.orthographicSize,hx=hy*aspect;float x=full?Game.Room.Cols/2f:Mathf.Clamp((float)p.x/32,Mathf.Min(hx,Game.Room.Cols/2f),Mathf.Max(Game.Room.Cols-hx,Game.Room.Cols/2f));float y=full?Game.Room.Rows/2f:Mathf.Clamp(Game.Room.Rows-(float)p.y/32,Mathf.Min(hy,Game.Room.Rows/2f),Mathf.Max(Game.Room.Rows-hy,Game.Room.Rows/2f));camera.transform.position=new Vector3(Mathf.Round(x*32)/32,Mathf.Round(y*32)/32,-10);RefreshWebPreviewBackground(camera);RefreshAssistant(camera);camera.backgroundColor=Game.RoomEnvironment=="hot"?new Color(.12f,.065f,.06f):new Color(.04f,.065f,.11f);
        }
        static Color TemperatureTint(string t,float alpha){return t=="hot"?new Color(1,.26f,.03f,alpha):new Color(.06f,.46f,1,alpha);}
        public string ThermalHint{get{int hot=0,cold=0;foreach(var o in Game.Room.Objects)if(o.Type=="physics.ice"){if(Game.TemperatureAt(o)=="hot")hot++;else cold++;}return hot+cold==0?null:hot>0&&cold==0?"温区：热 · 冰已融化，踩控温板切冷生成冰":cold>0&&hot==0?"温区：冷 · 冰可站立，持续站立会融化，离开后按设定再生":"温区：冷热并存 · 重叠区域以热为准";}}
        public void Dispose(){guidedPresentation?.Dispose();guidedPresentation=null;reworkPresentation?.Dispose();campaignEffects?.Dispose();foreach(var texture in generatedTextures)UnityEngine.Object.Destroy(texture);campaignEffects=null;mathPresentation?.Dispose();dreamPresentation?.Dispose();Root.SetActive(false);UnityEngine.Object.Destroy(Root);foreach(var s in pixels.Values)UnityEngine.Object.Destroy(s);UnityEngine.Object.Destroy(white.texture);UnityEngine.Object.Destroy(white);}
    }
}
