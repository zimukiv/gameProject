using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public struct MotionInput
    {
        public bool left,right,up,down,jumpPressed,dashPressed,interactPressed;
        public MotionInput WithoutEdges(){var v=this;v.jumpPressed=v.dashPressed=v.interactPressed=false;return v;}
    }
    public struct MotionRect
    {
        public string id; public double x,y,w,h; public int priority,index;
        public MotionRect(string id,double x,double y,double w,double h,int priority=2){this.id=id;this.x=x;this.y=y;this.w=w;this.h=h;this.priority=priority;index=0;}
        public static bool Overlap(MotionRect a,MotionRect b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
    }
    public sealed class MotionPlayer
    {
        public double x,y,w=24,h=28,vx,vy,coyote,buffer,dash,dashX,dashY,launchX,invulnerable=.4;
        public int face=1,dashCount; public bool grounded,freeDash=true,paidDashUsed,launched,crouching;
        public double build15LaunchHold;
        public string support; public MotionRail rail;
        public MotionRect Rect{get{return new MotionRect(null,x,y,w,h);}}
    }
    public sealed class MotionRail
    {
        public string id;public readonly List<MotionRect> points=new List<MotionRect>();public readonly List<double> lengths=new List<double>();
        public double total,distance,speed,acceleration,maxSpeed,angle;public bool allowExit;
    }
    public sealed class MotionObjectState
    {
        public double teacherTime;public int teacherHits;public bool teacherRemoved,teacherTouch;
        public bool used,firedDuringContact,waitingAI,hasWaitingAI,hitAI,hasHitAI,solid;public double cooldown,standing,respawnRemaining;public int generation,signIns,boosts;public bool fired;public string lastTemperature;
        public MotionObjectState Copy(){return (MotionObjectState)MemberwiseClone();}
    }
    // Pixels and double arithmetic deliberately match the editor oracle. Rendering is separate.
    // P2 supports motion-only rooms; P3 adds mechanism/AI/checkpoint state through the partial hooks.
    public sealed partial class NativeMotion
    {
        public const double Step=1.0/120;
        public readonly NativeProject Project;public readonly NativeCourse Course;public NativeRoom Room{get;private set;}
        public NativeRegion Entry{get;private set;}public MotionPlayer Player{get;private set;}
        public string Mode="playing",Message=""; public int Tokens,Charges=3,Recharge,Score,Deaths,Steals,Life=1,AiHits;
        public double Elapsed,RoomTime,RespawnRemaining,ExitCooldown=.4,AiProcessing=.8,AiCooldown;
        // 死亡后先播动画，计时结束再回到复活点
        public double respawnX,respawnY;
        // 骑移动机关砖
        public bool StoryPaused;   // 剧情/提示文字显示期间冻结玩法（不改 Mode，避免触发暂停菜单）
        public string rideId;
        public string RideId;   // 站在哪块移动砖上（动态扫掠判定）
        public readonly Dictionary<string,MotionRect> movableBefore=new Dictionary<string,MotionRect>(StringComparer.Ordinal);
        public bool pendingRespawn;
        // 交付方块是否已经提交过（主线只有在提交后回到起始房间才结算）。
        public bool SubmitDone;
        public bool MainlinePack{get{return Project!=null&&Project.OriginalJson?["mainlinePackage"]!=null;}}
        // AI refresh wait (the editor uses two seconds) and the entrance a wire carries it into.
        public double AiSpawnDelay; string pendingAiEntrance;
        public readonly List<JObject> Events=new List<JObject>(200);
        public readonly HashSet<string> Credited=new HashSet<string>(StringComparer.Ordinal);
        public readonly Dictionary<string,MotionObjectState> ObjectStates=new Dictionary<string,MotionObjectState>(StringComparer.Ordinal);
        readonly List<MotionRect> colliders=new List<MotionRect>(1024);
        readonly List<MotionRect> terrain=new List<MotionRect>(1024);readonly Dictionary<string,JObject> terrainLayers=new Dictionary<string,JObject>();
        readonly Dictionary<string,string> creditKeys=new Dictionary<string,string>(StringComparer.Ordinal);
        readonly Dictionary<string,NativeObject> objects=new Dictionary<string,NativeObject>(StringComparer.Ordinal);
        readonly Dictionary<string,double> config;int initialTokens,initialCharges=3,initialRecharge,initialScore;
        public readonly NativeGameplayRules Rules;public bool IsEditorBuild15 => Rules==NativeGameplayRules.EditorBuild15;
        public int PaidStockCap{get{return Rules==NativeGameplayRules.Editor255Compat?3:1;}}
        // 付费冲刺要先拿到冰红茶才解锁；没解锁时界面不显示这一项。
        public bool PaidDashUnlocked{get{return !IsEditorBuild15||HasBuild15Item("item.icedTea");}}
        public NativeMotion(NativeProject project,string courseId=null,string roomId=null,NativeGameplayRules rules=NativeGameplayRules.Editor255Compat)
        {
            Rules=rules;Charges=Rules==NativeGameplayRules.DemoPhysics?0:PaidStockCap;Project=project;config=project.Performance;Course=project.Courses.Find(c=>c.Id==courseId)??project.Courses[0];
            LoadRoom(roomId??Course.Rooms[0].Id);
        }
        public static bool SupportsRoom(NativeRoom r,out string reason)
        {
            foreach(var o in r.Objects)switch(o.Type){case "common.coin":case "common.small":case "common.collectible":case "common.spike":case "common.aiStart":case "common.aiStartHollow":case "common.aiSpawn":case "common.checkpoint":case "common.portalIn":case "common.portalOut":case "physics.ice":case "physics.thermal":case "physics.jet":case "physics.rail":case "legacy.rotor":case "legacy.integral":case "legacy.derivative":case "calculus.integral":case "calculus.derivative":case "slacker.checkin":case "slacker.awake":case "slacker.teacher":case "common.assignmentSubmit":case "item.calculator":case "item.icedTea":case "item.coffee":case "item.phone":break;default:reason="原生运行时缺少模块："+o.Type;return false;}reason=null;return true;
        }
        public void LoadRoom(string roomId)
        {
            LoadGameplayRoom(roomId,null,null,null);
        }
        public void CaptureEntryResources(){initialTokens=Tokens;initialCharges=Charges;initialRecharge=Recharge;initialScore=Score;}
        public void Retry(string reason="重试当前房间")
        {
            RetryGameplay(reason);
        }
        public void TogglePause(){if(UsesManualSaveSlots&&AwaitingSaveChoice)return;if(Mode=="playing")Mode="paused";else if(Mode=="paused")Mode="playing";}
        public void Emit(string type,JObject extra=null){var e=new JObject{{"type",type},{"room",Room.Id}};if(IsEditorBuild15&&(type=="jump"||type=="land")){e["feetX"]=Player.x+Player.w/2;e["feetY"]=Player.y+Player.h;}if(extra!=null)foreach(var p in extra.Properties())e[p.Name]=p.Value;Events.Add(e);if(Events.Count>200)Events.RemoveAt(0);}
        public void ClearEvents(){Events.Clear();}
        readonly Dictionary<string,(string direction,int dx,int dy)> spikeMounts=
            new Dictionary<string,(string,int,int)>(StringComparer.Ordinal);

        (string direction,int dx,int dy) SpikeMount(NativeObject spike)
        {
            if(spikeMounts.TryGetValue(spike.Id,out var cached))return cached;
            var faces=new[]{(direction:"up",dx:0,dy:-1),(direction:"down",dx:0,dy:1),
                (direction:"left",dx:-1,dy:0),(direction:"right",dx:1,dy:0)};
            bool Solid(double x,double y)=>
                Room.Tiles.Exists(tile=>tile.Collision&&tile.X==x&&tile.Y==y)||
                Room.Movables.Exists(brick=>brick.Raw["collision"]?.Value<bool>()!=false&&brick.X==x&&brick.Y==y);
            var owner=Room.Movables.Find(brick=>brick.Id==(string)spike.Raw["attachmentTo"]);
            var face=faces[0];
            var explicitDirection=spike.Text("direction","");
            int authored=Array.FindIndex(faces,f=>f.direction==explicitDirection);
            bool embedded=Solid(spike.X,spike.Y);
            if(authored>=0)face=faces[authored];
            else if(owner!=null&&(owner.X!=spike.X||owner.Y!=spike.Y))
                face=Math.Abs(spike.Y-owner.Y)>=Math.Abs(spike.X-owner.X)?
                    faces[spike.Y<owner.Y?0:1]:faces[spike.X<owner.X?2:3];
            else if(embedded){
                foreach(var candidate in faces)
                    if(!Solid(spike.X+candidate.dx,spike.Y+candidate.dy)){face=candidate;break;}
            }else{
                foreach(var candidate in faces)
                    if(Solid(spike.X-candidate.dx,spike.Y-candidate.dy)&&
                        !Solid(spike.X+candidate.dx,spike.Y+candidate.dy)){face=candidate;break;}
            }
            bool shift=embedded&&!Solid(spike.X+face.dx,spike.Y+face.dy);
            return spikeMounts[spike.Id]=(face.direction,shift?face.dx:0,shift?face.dy:0);
        }

        public string SpikeFacing(NativeObject spike)=>IsEditorBuild15?SpikeMount(spike).direction:spike.Text("direction","up");

        public MotionRect ObjectRect(NativeObject o){
            if(IsEditorBuild15&&o.Type=="slacker.teacher")return Build15TeacherRect(o);
            if(IsEditorBuild15&&o.Type=="common.spike"){
                var mount=SpikeMount(o);
                return Build15AttachedRect(o.Id,o.Raw,o.X+mount.dx,o.Y+mount.dy,o.W,o.H);
            }
            return Build15AttachedRect(o.Id,o.Raw,o.X,o.Y,o.W,o.H);
        }
        public IReadOnlyList<MotionRect> CollisionRects{get{BuildColliders();return colliders;}}
        void BuildColliders()
        {
            colliders.Clear();if(IsRework){foreach(var b in terrain){if(!terrainLayers.TryGetValue(b.id,out var rule)||LayerActive(rule))colliders.Add(b);}}else colliders.AddRange(terrain);int index=terrain.Count;
            foreach(var o in Room.Objects){if(!LayerActive(o.Raw)||o.Type=="common.spike"||!Build15Solid(o)||Credited.Contains(creditKeys[o.Id])||IsSpent(o)||(o.Type=="physics.ice"&&!ObjectStates[o.Id].solid))continue;var r=ObjectRect(o);if(o.ColliderShape=="pad"){r.h=8;r.priority=1;}r.index=index++;colliders.Add(r);}
            AddReworkColliders();
            // 所有移动机关砖都保留碰撞（跳跃/落地不会被穿模）；
            foreach(var b in Room.Movables)if(LayerActive(b.Raw)&&b.Raw["collision"]?.Value<bool>()!=false){
                if(RideId!=null&&RideId!=b.Id)continue;   // 站在砖上时其它移动砖穿模（只与脚下这块碰撞）
                var r=MovableRect(b);if(objects.TryGetValue((string)b.Raw["padId"]??"",out var pad)&&pad.Type=="legacy.rotor"&&Movables[b.Id].anim!=null)continue;r.index=index++;colliders.Add(r);}
        }
        public void Launch(double x,double y){var p=Player;p.vx=x;p.vy=y;p.launched=true;p.launchX=x;p.rail=null;p.dash=0;p.grounded=false;p.coyote=p.buffer=0;p.invulnerable=Math.Max(p.invulnerable,.3);}
        public void StartRail(NativeObject o)
        {
            var path=o.Parameters["path"] as JArray;if(path==null||path.Count<2){Message="轨道至少需要两个节点。";return;}
            var r=new MotionRail{id=o.Id,acceleration=o.Number("acceleration"),maxSpeed=o.Number("maxSpeed"),angle=o.Number("launchAngle"),allowExit=o.Flag("allowExit",true)};
            foreach(JObject point in path)r.points.Add(new MotionRect(null,point["x"].Value<double>()*32,point["y"].Value<double>()*32,0,0));
            for(int i=1;i<r.points.Count;i++){double n=Hypot(r.points[i].x-r.points[i-1].x,r.points[i].y-r.points[i-1].y);r.lengths.Add(n);r.total+=n;}
            var p=Player;p.rail=r;p.vx=p.vy=0;p.grounded=p.launched=false;
            if(IsEditorBuild15){p.freeDash=true;p.dashCount=0;p.paidDashUsed=false;}
        }
        void MoveRail(double dt)
        {
            var p=Player;var r=p.rail;r.speed=Math.Min(r.maxSpeed,r.speed+r.acceleration*dt);r.distance=Math.Min(r.total,r.distance+r.speed*dt);
            double remaining=r.distance;int i=0;while(i<r.lengths.Count-1&&remaining>r.lengths[i]){remaining-=r.lengths[i];i++;}
            double segment=r.lengths[i],t=segment>0?remaining/segment:1;var a=r.points[i];var b=r.points[i+1];p.x=a.x+(b.x-a.x)*t-p.w/2;p.y=a.y+(b.y-a.y)*t-p.h;
            p.vx=segment>0?(b.x-a.x)/segment*r.speed:0;p.vy=segment>0?(b.y-a.y)/segment*r.speed:0;p.grounded=false;
            if(r.distance>=r.total){double angle=r.angle*Math.PI/180;Launch(Math.Cos(angle)*r.speed,Math.Sin(angle)*r.speed);Emit("rail-end",new JObject{{"id",r.id},{"speed",r.speed}});}
        }
        bool RailTouches(MotionRect from,MotionRect target)
        {
            double start=0,end=1;
            return Clip(from.x,Player.x-from.x,target.x-from.w-.2,target.x+target.w+.2)&&
                   Clip(from.y,Player.y-from.y,target.y-from.h-.2,target.y+target.h+.2);
            bool Clip(double origin,double delta,double min,double max){
                if(Math.Abs(delta)<1e-9)return origin>=min&&origin<=max;
                double a=(min-origin)/delta,b=(max-origin)/delta;
                start=Math.Max(start,Math.Min(a,b));end=Math.Min(end,Math.Max(a,b));
                return start<=end;
            }
        }

        void CollectAndSaveOnRail(MotionRect from,MotionInput input)
        {
            foreach(var o in Room.Objects){
                if(!LayerActive(o.Raw))continue;
                TryCollect(o,o.Type=="common.coin"&&RailTouches(from,ObjectRect(o)));
            }
            foreach(var o in Room.Objects){
                if(o.Type!="common.checkpoint"||!LayerActive(o.Raw)||
                    (string)o.Trigger["mode"]=="none")continue;
                var state=ObjectStates[o.Id];
                bool touched=RailTouches(from,ObjectRect(o));
                if(IsContactAutosave){
                    HandleContactCheckpoint(o,state,touched,input,input.interactPressed?NearbyInteraction:null);
                    if(AwaitingSaveChoice)return;
                }else{
                    if(touched&&!state.firedDuringContact)Fire(o);
                    state.firedDuringContact=touched;
                }
            }
        }

        void Fire(NativeObject o)
        {
            // Flag contact already has an occupancy latch; a mechanism cooldown must not swallow a quick return.
            var s=ObjectStates[o.Id];bool guidedCheckpoint=UsesManualSaveSlots&&o.Type=="common.checkpoint";if((s.cooldown>0&&!guidedCheckpoint)||((o.Trigger["once"].Value<bool>()||o.Flag("once"))&&s.used))return;
            s.used=true;double cooldown=o.Number("cooldown");s.cooldown=cooldown!=0?cooldown:o.Trigger["cooldown"].Value<double>();if(s.cooldown==0)s.cooldown=1;
            if(o.Type=="physics.jet"){Launch(o.Number("launchX"),o.Number("launchY"));if(o.Flag("affectAI",true))LaunchAI(o,o.Number("range",3),o.Number("launchX"),o.Number("launchY"));Emit("jet",new JObject{{"id",o.Id}});}
            else if(o.Type=="physics.rail"){StartRail(o);Emit("rail-start",new JObject{{"id",o.Id}});}
            else MechanismFire(o,s);
            Emit("trigger",new JObject{{"id",o.Id},{"type",o.Type}});
        }
        public NativeObject NearbyInteraction
        {
            get{if(Rules==NativeGameplayRules.Editor255Compat)return null;bool thermal=Rules==NativeGameplayRules.LatestPhysics;NativeObject best=null;double distance=40;var pc=PlayerCenter;foreach(var o in Room.Objects)if(LayerActive(o.Raw)&&(IsContactAutosave&&o.Type=="common.checkpoint"||IsAwarenessResource&&(o.Type=="common.checkpoint"&&!IsGuided||o.Raw["rework"]?["clarityDelta"]!=null)&&!IsSpent(o)||o.Type=="common.aiStart"||o.Type=="common.aiStartHollow"||o.Type=="common.assignmentSubmit"||thermal&&o.Type=="physics.thermal")){var r=ObjectRect(o);double n=Hypot(pc.x-Clamp(pc.x,r.x,r.x+r.w),pc.y-Clamp(pc.y,r.y,r.y+r.h));if(n<distance||Math.Abs(n-distance)<1e-7&&PreferContactInteraction(o,best)){distance=n;best=o;}}return best;}
        }
        void TriggerObjects(double oldBottom,MotionInput input)
        {
            var p=Player;var interaction=input.interactPressed?NearbyInteraction:null;foreach(var o in Room.Objects){if(!LayerActive(o.Raw))continue;string mode=o.Trigger["mode"].Value<string>();if(mode=="none")continue;var s=ObjectStates[o.Id];var rect=ObjectRect(o);
                bool top=p.grounded&&p.vy>=0&&oldBottom<=rect.y+2&&Math.Abs(p.y+p.h-rect.y)<1&&p.x+p.w>rect.x+2&&p.x<rect.x+rect.w-2;
                bool occupied=MotionRect.Overlap(p.Rect,rect)||top;
                if((Rules==NativeGameplayRules.Editor255Compat||IsEditorBuild15)&&o.Type=="physics.rail"&&o.Flag("sideTrigger")){bool vertical=p.y+p.h>rect.y&&p.y<rect.y+rect.h;bool left=p.x<=rect.x+2&&p.x+p.w>=rect.x-8;bool right=p.x>=rect.x+rect.w-2&&p.x<=rect.x+rect.w+8;bool inside=p.x+p.w>rect.x&&p.x<rect.x+rect.w;occupied=top||vertical&&(left||right||inside);}
                if(IsContactAutosave&&o.Type=="common.checkpoint"){HandleContactCheckpoint(o,s,occupied,input,interaction);if(AwaitingSaveChoice)return;continue;}
                bool manual=Rules.IsManualInteraction(o.Type)||IsAwarenessResource&&(o.Type=="common.checkpoint"&&!IsGuided||o.Raw["rework"]?["clarityDelta"]!=null)&&!IsSpent(o);
                if(manual){s.firedDuringContact=false;occupied=input.interactPressed&&interaction==o;if(occupied&&IsNetwork)networkExitPressed=false;}
                else if(Rules==NativeGameplayRules.LatestPhysics&&(o.Type=="physics.jet"||o.Type=="physics.rail"))occupied=top;
                // Demo profile: a jet only fires on contact that is not a jump from underneath, so
                // rising through the pad (or a collision-less side pad) no longer launches the player.
                else if(Rules==NativeGameplayRules.DemoPhysics&&o.Type=="physics.jet")occupied=occupied&&p.vy>=-1;
                if(IsEditorBuild15){
                    if(o.Type=="slacker.awake")occupied=MotionRect.Overlap(p.Rect,rect);
                    if(!Build15TriggerAllowed(o)){s.firedDuringContact=false;continue;}
                }
                if(!occupied){s.firedDuringContact=false;continue;}bool ready=!o.Trigger["requiresAI"].Value<bool>()||(AI.active&&AI.id==(o.AiId??Room.AiId??Course.AiId)&&Hypot(AI.x-(o.X+.5)*32,AI.y-o.Y*32)<=((double?)o.Trigger["distance"]??5)*32);s.waitingAI=!ready;s.hasWaitingAI=true;
                if(ready&&!s.firedDuringContact){Fire(o);s.firedDuringContact=true;if(AwaitingSaveChoice)return;}
            }
        }
        int terrainMinXCache = int.MinValue, terrainMaxXCache = int.MinValue;
        string terrainCacheRoom;
        void CacheTerrain()
        {
            if (terrainCacheRoom == Room.Id) return;
            terrainCacheRoom = Room.Id;
            terrainMinXCache = int.MaxValue; terrainMaxXCache = int.MinValue;
            foreach (var t in Room.Tiles)
            {
                terrainMinXCache = Math.Min(terrainMinXCache, t.X);
                terrainMaxXCache = Math.Max(terrainMaxXCache, t.X);
            }
            if (terrainMinXCache == int.MaxValue) { terrainMinXCache = 0; terrainMaxXCache = Math.Max(1, Room.Cols) - 1; }
        }
        int TerrainMinX(){CacheTerrain();return terrainMinXCache;}
        int TerrainMaxX(){CacheTerrain();return terrainMaxXCache;}
        void TryCollect(NativeObject o,bool railContact=false)
        {
            if(!LayerActive(o.Raw))return;
            // Collectibles are the AI's reward for being led somewhere hard to reach, not the player's.
            // 藏品统一归 AI 拾取：玩家踩上去不会拿走（含主线 EditorBuild15）。
                    bool collectible=o.Type=="common.collectible"&&Rules!=NativeGameplayRules.DemoPhysics&&Rules!=NativeGameplayRules.EditorBuild15;
            bool item=IsEditorBuild15&&Build15Item(o.Type);
            if(o.Type!="common.coin"&&o.Type!="common.small"&&!collectible&&!item)return;
            if(o.Text("unlockPadId")!=""&&(!ObjectStates.TryGetValue(o.Text("unlockPadId"),out var pad)||!pad.hitAI))return;
            var p=Player;var r=ObjectRect(o);bool solidContact=o.Collision&&MotionRect.Overlap(new MotionRect(null,p.x-.2,p.y-.2,p.w+.4,p.h+.4),r);
            if(!railContact&&!solidContact&&!MotionRect.Overlap(p.Rect,new MotionRect(null,r.x+5,r.y+5,22,22)))return;
            // 主线大 token：第一次给 token 与分数；之后每 5 秒复活，但只回充付费冲刺数量。
            if(Rules==NativeGameplayRules.EditorBuild15&&o.Type=="common.coin")
            {
                var big=ObjectStates[o.Id];
                if(big.used)return;   // 已经拿走、还没复活：站在上面不会重复触发
                if(Credited.Add(creditKeys[o.Id])){Tokens+=1;Score+=1000;}
                Charges=PaidStockCap;Recharge=0;
                big.used=true;big.respawnRemaining=5;
                Emit("collect",new JObject{{"id",o.Id}});
                return;
            }
            string key=creditKeys[o.Id];if(!Credited.Add(key))return;
            if(item){Emit("collect",new JObject{{"id",o.Id},{"objectType",o.Type}});return;}
            if(o.Type=="common.collectible")Score+=10000;else{int n=1;Tokens+=n;Score+=n==1?100:1000;if(IsEditorBuild15){ }else if(Rules.BankedRecharge()){if(Charges>=PaidStockCap)Recharge=0;else if(n==10){Charges=PaidStockCap;Recharge=0;}else{Recharge++;if(Recharge>=3){Charges=PaidStockCap;Recharge=0;}}}else{Recharge+=n;while(Recharge>=10){Recharge-=10;Charges=Math.Min(3,Charges+1);}}}
            Emit("collect",Rules==NativeGameplayRules.DemoPhysics?new JObject{{"id",o.Id},{"by","player"}}:new JObject{{"id",o.Id}});
        }
        public static bool SpikeTouches(MotionRect p,MotionRect r,string direction)
        {
            double radius=Math.Max(0,Math.Min(r.w,r.h)/2-5),x=r.x+r.w/2,y=r.y+r.h;
            if(direction=="down")y=r.y;else if(direction=="right"){x=r.x;y=r.y+r.h/2;}else if(direction=="left"){x=r.x+r.w;y=r.y+r.h/2;}
            double minX=p.x,maxX=p.x+p.w,minY=p.y,maxY=p.y+p.h;
            if(direction=="down")minY=Math.Max(minY,y);else if(direction=="right")minX=Math.Max(minX,x);else if(direction=="left")maxX=Math.Min(maxX,x);else maxY=Math.Min(maxY,y);
            if(radius<=0||minX>=maxX||minY>=maxY)return false;double nx=Math.Max(minX,Math.Min(x,maxX)),ny=Math.Max(minY,Math.Min(y,maxY));return (nx-x)*(nx-x)+(ny-y)*(ny-y)<radius*radius;
        }
        public void Tick(double dt,MotionInput input=default(MotionInput))
        {
            // Keep the pending file transaction frozen even if a caller directly changes Mode.
            if(UsesManualSaveSlots&&AwaitingSaveChoice){Mode="paused";return;}
            networkExitPressed=input.interactPressed;
            if(Mode!="playing")return;if(StoryPaused)return;dt=Clamp(dt,0,1.0/30);if(RespawnRemaining>0){RespawnRemaining=Math.Max(0,RespawnRemaining-dt);if(RespawnRemaining<1e-9){RespawnRemaining=0;if(pendingRespawn){pendingRespawn=false;Player.x=respawnX;Player.y=respawnY;Player.vx=Player.vy=0;}}return;}
            Elapsed+=dt;RoomTime+=dt;Player.build15LaunchHold=Math.Max(0,Player.build15LaunchHold-dt);ExitCooldown=Math.Max(0,ExitCooldown-dt);var p=Player;bool wasGrounded=p.grounded;CaptureMovables();TickMechanisms(dt);CarryPlayerWithMovables();BuildColliders();if(DeveloperFlight){TickFlight(dt,input);return;}
            p.invulnerable=Math.Max(0,p.invulnerable-dt);bool crouch=input.down&&p.grounded&&!p.launched&&p.rail==null&&p.dash<=0;
            if(crouch&&!p.crouching){p.y+=10;p.h=18;p.crouching=true;}
            else if(!crouch&&p.crouching){var full=new MotionRect(null,p.x,p.y-10,p.w,28);bool blocked=false;foreach(var b in colliders)if(!IgnoreRideCollision(b)&&MotionRect.Overlap(full,b)){blocked=true;break;}if(!blocked){p.y-=10;p.h=28;p.crouching=false;}}
            p.buffer=input.jumpPressed?config["buffer"]:Math.Max(0,p.buffer-dt);p.coyote=p.grounded?config["coyote"]:Math.Max(0,p.coyote-dt);
            int horizontal=(input.right?1:0)-(input.left?1:0);if(horizontal!=0)p.face=horizontal;
            if(input.dashPressed&&(IsEditorBuild15?p.dashCount<3&&(p.freeDash||HasBuild15Item("item.icedTea")&&Charges>0):(p.freeDash||(!p.paidDashUsed&&Charges>0)))&&(p.rail==null||p.rail.allowExit)){
                bool free=p.freeDash;if(free)p.freeDash=false;else{Charges--;p.paidDashUsed=true;}p.dashCount++;p.vx=p.vy=0;p.rail=null;p.launched=false;p.dash=config["dashTime"];// 与关卡编辑器一致：冲刺只走左右——有左右输入按输入方向，没有就沿当前面向，不含垂直分量。
                p.dashX=horizontal!=0?horizontal:p.face;p.dashY=0;p.coyote=p.buffer=0;Emit("dash",new JObject{{"free",free},{"count",p.dashCount}});
            }
            if(input.jumpPressed&&p.rail!=null&&p.rail.allowExit){p.rail=null;p.launched=true;p.launchX=p.vx;p.vy=-config["jump"];p.buffer=0;}
            if(p.rail!=null){var beforeRail=Player.Rect;MoveRail(dt);CollectAndSaveOnRail(beforeRail,input);if(!AwaitingSaveChoice)UpdateInactiveAI(dt);return;}
            if(p.buffer>0&&p.coyote>0&&p.dash<=0&&!p.launched){p.vy=-config["jump"];p.grounded=false;p.coyote=p.buffer=0;Emit("jump");}
            bool dashing=p.dash>0;
            if(dashing){double speed=Math.Max(0,config["dashSpeed"]-config["dashDeceleration"]*(config["dashTime"]-p.dash));p.vx=p.dashX*speed;p.vy=p.dashY*speed;p.dash=Math.Max(0,p.dash-dt);}
            else{p.vx=p.launched?(Math.Abs(p.launchX)<1?Accelerate(p.vx,horizontal,config["speed"],dt,config["moveAccelerationTime"]):p.launchX+horizontal*45):SurfaceVelocity(p,horizontal,dt);p.vy=Math.Min(config["maxFall"],p.vy+config["gravity"]*dt);}
            // A supported actor can be a few floating-point units inside the
            // platform top. Its top is a floor, never a horizontal wall.
            p.x+=p.vx*dt;foreach(var b in colliders)if(!IgnoreRideCollision(b)
                &&!(IsEditorBuild15&&b.id==movingRideSupport&&p.y+p.h<=b.y+.01)
                &&MotionRect.Overlap(p.Rect,b)){if(p.vx>0)p.x=b.x-p.w;else if(p.vx<0)p.x=b.x+b.w;p.vx=0;if(dashing)p.dashX=0;}
            p.x=Clamp(p.x,0,Room.Cols*32-p.w);double oldTop=p.y,oldBottom=p.y+p.h;string priorSupport=p.grounded?p.support:null;p.y+=p.vy*dt;p.grounded=false;p.support=null;
            bool landed=false;MotionRect best=default(MotionRect);foreach(var b in colliders)if(!IgnoreRideCollision(b)&&p.vy>=0&&oldBottom<=b.y+6&&(MotionRect.Overlap(p.Rect,b)||
                IsEditorBuild15&&priorSupport!=null&&b.id==priorSupport&&Movables.ContainsKey(b.id)&&
                Math.Abs(oldBottom-b.y)<=.01&&p.x<b.x+b.w&&p.x+p.w>b.x))if(!landed||b.y<best.y||b.y==best.y&&(b.priority>best.priority||b.priority==best.priority&&b.index<best.index)){best=b;landed=true;}
            if(landed){p.y=best.y-p.h;p.vy=0;p.grounded=true;p.support=best.id;if(p.build15LaunchHold<=0)p.launched=false;if(dashing)p.dashY=0;}
            else if(p.vy<0)foreach(var b in colliders)if(!IgnoreRideCollision(b)&&oldTop>=b.y+b.h-.1&&MotionRect.Overlap(p.Rect,b)){p.y=b.y+b.h;p.vy=0;if(dashing)p.dashY=0;break;}
            UpdateRideOverlap();
            if(p.grounded&&!wasGrounded){p.freeDash=true;p.dashCount=0;p.paidDashUsed=false;Emit("land");}
            if(p.y<0){p.y=0;p.vy=0;if(dashing)p.dashY=0;}
            if(p.y>Room.Rows*32+80){if(LockHealth){p.x=Checkpoint?.x??Entry.X*32+4;p.y=Checkpoint?.y??Entry.Y*32+4;ClearFlightMotion();if(DeveloperEnabled)ResetAITrackingAtPlayer();}else Retry("掉出房间");return;}
            foreach(var o in Room.Objects){if(!LayerActive(o.Raw))continue;if(!LockHealth&&o.Type=="common.spike"&&SpikeTouches(p.Rect,ObjectRect(o),SpikeFacing(o))){Retry("碰到尖刺");return;}TryCollect(o);}
            if(TickBuild15TeacherContacts())return;TriggerObjects(oldBottom,input);if(AwaitingSaveChoice)return;UpdateInactiveAI(dt);if(Player!=p)return;StickToRidingBrick();CheckExits();
        }
        void UpdateInactiveAI(double dt){UpdateAI(dt);TickPatrols(dt);}
        public static double Accelerate(double velocity,int horizontal,double speed,double dt,double ramp){if(horizontal==0)return 0;double current=Math.Sign(velocity)==horizontal?Math.Min(Math.Abs(velocity),speed):0;return horizontal*Math.Min(speed,current+speed/ramp*dt);}
        public static double Clamp(double n,double a,double b){return Math.Max(a,Math.Min(b,n));}
        public static double Hypot(double a,double b){return Math.Sqrt(a*a+b*b);}
    }
}
