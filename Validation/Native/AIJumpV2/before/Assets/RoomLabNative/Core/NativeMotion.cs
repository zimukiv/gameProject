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
        public bool used,firedDuringContact,waitingAI,hasWaitingAI,hitAI,hasHitAI,solid;public double cooldown,standing,respawnRemaining;public int generation;public string lastTemperature;
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
        public readonly List<JObject> Events=new List<JObject>(200);
        public readonly HashSet<string> Credited=new HashSet<string>(StringComparer.Ordinal);
        public readonly Dictionary<string,MotionObjectState> ObjectStates=new Dictionary<string,MotionObjectState>(StringComparer.Ordinal);
        readonly List<MotionRect> colliders=new List<MotionRect>(1024);
        readonly List<MotionRect> terrain=new List<MotionRect>(1024);
        readonly Dictionary<string,string> creditKeys=new Dictionary<string,string>(StringComparer.Ordinal);
        readonly Dictionary<string,NativeObject> objects=new Dictionary<string,NativeObject>(StringComparer.Ordinal);
        readonly Dictionary<string,double> config;int initialTokens,initialCharges=3,initialRecharge,initialScore;
        public readonly NativeGameplayRules Rules;public int PaidStockCap{get{return Rules==NativeGameplayRules.Editor255Compat?3:1;}}
        public NativeMotion(NativeProject project,string courseId=null,string roomId=null,NativeGameplayRules rules=NativeGameplayRules.Editor255Compat)
        {
            Rules=rules;Charges=Rules==NativeGameplayRules.DemoPhysics?0:PaidStockCap;Project=project;config=project.Performance;Course=project.Courses.Find(c=>c.Id==courseId)??project.Courses[0];
            LoadRoom(roomId??Course.Rooms[0].Id);
        }
        public static bool SupportsRoom(NativeRoom r,out string reason)
        {
            foreach(var o in r.Objects)switch(o.Type){case "common.coin":case "common.small":case "common.collectible":case "common.spike":case "common.aiStart":case "common.aiStartHollow":case "common.checkpoint":case "common.portalIn":case "common.portalOut":case "physics.ice":case "physics.thermal":case "physics.jet":case "physics.rail":case "legacy.rotor":case "legacy.integral":case "legacy.derivative":break;default:reason="原生运行时缺少模块："+o.Type;return false;}reason=null;return true;
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
        public void TogglePause(){if(Mode=="playing")Mode="paused";else if(Mode=="paused")Mode="playing";}
        public void Emit(string type,JObject extra=null){var e=new JObject{{"type",type},{"room",Room.Id}};if(extra!=null)foreach(var p in extra.Properties())e[p.Name]=p.Value;Events.Add(e);if(Events.Count>200)Events.RemoveAt(0);}
        public void ClearEvents(){Events.Clear();}
        public MotionRect ObjectRect(NativeObject o){return new MotionRect(o.Id,o.X*32,o.Y*32,o.W*32,o.H*32);}
        public IReadOnlyList<MotionRect> CollisionRects{get{BuildColliders();return colliders;}}
        void BuildColliders()
        {
            colliders.Clear();colliders.AddRange(terrain);int index=terrain.Count;
            foreach(var o in Room.Objects){if(o.Type=="common.spike"||!o.Collision||Credited.Contains(creditKeys[o.Id])||(o.Type=="physics.ice"&&!ObjectStates[o.Id].solid))continue;var r=ObjectRect(o);if(o.ColliderShape=="pad"){r.h=8;r.priority=1;}r.index=index++;colliders.Add(r);}
            foreach(var b in Room.Movables)if(b.Raw["collision"]?.Value<bool>()!=false){var r=MovableRect(b);if(objects.TryGetValue((string)b.Raw["padId"]??"",out var pad)&&pad.Type=="legacy.rotor"&&Movables[b.Id].anim!=null)continue;r.index=index++;colliders.Add(r);}
        }
        public void Launch(double x,double y){var p=Player;p.vx=x;p.vy=y;p.launched=true;p.launchX=x;p.rail=null;p.dash=0;p.grounded=false;p.coyote=p.buffer=0;p.invulnerable=Math.Max(p.invulnerable,.3);}
        public void StartRail(NativeObject o)
        {
            var path=o.Parameters["path"] as JArray;if(path==null||path.Count<2){Message="轨道至少需要两个节点。";return;}
            var r=new MotionRail{id=o.Id,acceleration=o.Number("acceleration"),maxSpeed=o.Number("maxSpeed"),angle=o.Number("launchAngle"),allowExit=o.Flag("allowExit",true)};
            foreach(JObject point in path)r.points.Add(new MotionRect(null,point["x"].Value<double>()*32,point["y"].Value<double>()*32,0,0));
            for(int i=1;i<r.points.Count;i++){double n=Hypot(r.points[i].x-r.points[i-1].x,r.points[i].y-r.points[i-1].y);r.lengths.Add(n);r.total+=n;}
            var p=Player;p.rail=r;p.vx=p.vy=0;p.grounded=p.launched=false;
        }
        void MoveRail(double dt)
        {
            var p=Player;var r=p.rail;r.speed=Math.Min(r.maxSpeed,r.speed+r.acceleration*dt);r.distance=Math.Min(r.total,r.distance+r.speed*dt);
            double remaining=r.distance;int i=0;while(i<r.lengths.Count-1&&remaining>r.lengths[i]){remaining-=r.lengths[i];i++;}
            double segment=r.lengths[i],t=segment>0?remaining/segment:1;var a=r.points[i];var b=r.points[i+1];p.x=a.x+(b.x-a.x)*t-p.w/2;p.y=a.y+(b.y-a.y)*t-p.h;
            p.vx=segment>0?(b.x-a.x)/segment*r.speed:0;p.vy=segment>0?(b.y-a.y)/segment*r.speed:0;p.grounded=false;
            if(r.distance>=r.total){double angle=r.angle*Math.PI/180;Launch(Math.Cos(angle)*r.speed,Math.Sin(angle)*r.speed);Emit("rail-end",new JObject{{"id",r.id},{"speed",r.speed}});}
        }
        void Fire(NativeObject o)
        {
            var s=ObjectStates[o.Id];if(s.cooldown>0||((o.Trigger["once"].Value<bool>()||o.Flag("once"))&&s.used))return;
            s.used=true;double cooldown=o.Number("cooldown");s.cooldown=cooldown!=0?cooldown:o.Trigger["cooldown"].Value<double>();if(s.cooldown==0)s.cooldown=1;
            if(o.Type=="physics.jet"){Launch(o.Number("launchX"),o.Number("launchY"));if(o.Flag("affectAI",true))LaunchAI(o,o.Number("range",3),o.Number("launchX"),o.Number("launchY"));Emit("jet",new JObject{{"id",o.Id}});}
            else if(o.Type=="physics.rail"){StartRail(o);Emit("rail-start",new JObject{{"id",o.Id}});}
            else MechanismFire(o,s);
            Emit("trigger",new JObject{{"id",o.Id},{"type",o.Type}});
        }
        public NativeObject NearbyInteraction
        {
            get{if(Rules==NativeGameplayRules.Editor255Compat)return null;bool thermal=Rules==NativeGameplayRules.LatestPhysics;NativeObject best=null;double distance=40;foreach(var o in Room.Objects)if(o.Type=="common.aiStart"||o.Type=="common.aiStartHollow"||thermal&&o.Type=="physics.thermal"){var r=ObjectRect(o);var pc=PlayerCenter;double n=Hypot(pc.x-Clamp(pc.x,r.x,r.x+r.w),pc.y-Clamp(pc.y,r.y,r.y+r.h));if(n<distance){distance=n;best=o;}}return best;}
        }
        void TriggerObjects(double oldBottom,MotionInput input)
        {
            var p=Player;var interaction=NearbyInteraction;foreach(var o in Room.Objects){string mode=o.Trigger["mode"].Value<string>();if(mode=="none")continue;var s=ObjectStates[o.Id];var rect=ObjectRect(o);
                bool top=p.grounded&&p.vy>=0&&oldBottom<=rect.y+2&&Math.Abs(p.y+p.h-rect.y)<1&&p.x+p.w>rect.x+2&&p.x<rect.x+rect.w-2;
                bool occupied=MotionRect.Overlap(p.Rect,rect)||top;
                if(Rules==NativeGameplayRules.Editor255Compat&&o.Type=="physics.rail"&&o.Flag("sideTrigger")){bool vertical=p.y+p.h>rect.y&&p.y<rect.y+rect.h;bool left=p.x<=rect.x+2&&p.x+p.w>=rect.x-8;bool right=p.x>=rect.x+rect.w-2&&p.x<=rect.x+rect.w+8;bool inside=p.x+p.w>rect.x&&p.x<rect.x+rect.w;occupied=top||vertical&&(left||right||inside);}
                bool manual=Rules.IsManualInteraction(o.Type);
                if(manual){s.firedDuringContact=false;occupied=input.interactPressed&&interaction==o;}
                else if(Rules==NativeGameplayRules.LatestPhysics&&(o.Type=="physics.jet"||o.Type=="physics.rail"))occupied=top;
                // Demo profile: a jet only fires on contact that is not a jump from underneath, so
                // rising through the pad (or a collision-less side pad) no longer launches the player.
                else if(Rules==NativeGameplayRules.DemoPhysics&&o.Type=="physics.jet")occupied=occupied&&p.vy>=-1;
                if(!occupied){s.firedDuringContact=false;continue;}bool ready=!o.Trigger["requiresAI"].Value<bool>()||(AI.active&&AI.id==(o.AiId??Room.AiId??Course.AiId)&&Hypot(AI.x-(o.X+.5)*32,AI.y-o.Y*32)<=((double?)o.Trigger["distance"]??5)*32);s.waitingAI=!ready;s.hasWaitingAI=true;
                if(ready&&!s.firedDuringContact){Fire(o);s.firedDuringContact=true;}
            }
        }
        void TryCollect(NativeObject o)
        {
            // Collectibles are the AI's reward for being led somewhere hard to reach, not the player's.
            bool collectible=o.Type=="common.collectible"&&Rules!=NativeGameplayRules.DemoPhysics;
            if(o.Type!="common.coin"&&o.Type!="common.small"&&!collectible)return;
            if(o.Text("unlockPadId")!=""&&(!ObjectStates.TryGetValue(o.Text("unlockPadId"),out var pad)||!pad.hitAI))return;
            var p=Player;var r=ObjectRect(o);bool solidContact=o.Collision&&MotionRect.Overlap(new MotionRect(null,p.x-.2,p.y-.2,p.w+.4,p.h+.4),r);
            if(!solidContact&&!MotionRect.Overlap(p.Rect,new MotionRect(null,r.x+5,r.y+5,22,22)))return;
            string key=creditKeys[o.Id];if(!Credited.Add(key))return;
            if(o.Type=="common.collectible")Score+=10000;else{int n=o.Type=="common.small"?1:10;Tokens+=n;Score+=n==1?100:1000;if(Rules.BankedRecharge()){if(Charges>=PaidStockCap)Recharge=0;else if(n==10){Charges=PaidStockCap;Recharge=0;}else{Recharge++;if(Recharge>=3){Charges=PaidStockCap;Recharge=0;}}}else{Recharge+=n;while(Recharge>=10){Recharge-=10;Charges=Math.Min(3,Charges+1);}}}
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
            if(Mode!="playing")return;dt=Clamp(dt,0,1.0/30);if(RespawnRemaining>0){RespawnRemaining=Math.Max(0,RespawnRemaining-dt);if(RespawnRemaining<1e-9)RespawnRemaining=0;return;}
            Elapsed+=dt;RoomTime+=dt;ExitCooldown=Math.Max(0,ExitCooldown-dt);var p=Player;bool wasGrounded=p.grounded;TickMechanisms(dt);BuildColliders();if(DeveloperFlight){TickFlight(dt,input);return;}
            p.invulnerable=Math.Max(0,p.invulnerable-dt);bool crouch=input.down&&p.grounded&&!p.launched&&p.rail==null&&p.dash<=0;
            if(crouch&&!p.crouching){p.y+=10;p.h=18;p.crouching=true;}
            else if(!crouch&&p.crouching){var full=new MotionRect(null,p.x,p.y-10,p.w,28);bool blocked=false;foreach(var b in colliders)if(MotionRect.Overlap(full,b)){blocked=true;break;}if(!blocked){p.y-=10;p.h=28;p.crouching=false;}}
            p.buffer=input.jumpPressed?config["buffer"]:Math.Max(0,p.buffer-dt);p.coyote=p.grounded?config["coyote"]:Math.Max(0,p.coyote-dt);
            int horizontal=(input.right?1:0)-(input.left?1:0);if(horizontal!=0)p.face=horizontal;
            if(input.dashPressed&&(p.freeDash||(!p.paidDashUsed&&Charges>0))&&(p.rail==null||p.rail.allowExit)){
                bool free=p.freeDash;if(free)p.freeDash=false;else{Charges--;p.paidDashUsed=true;}p.dashCount++;p.vx=p.vy=0;p.rail=null;p.launched=false;p.dash=config["dashTime"];p.dashX=horizontal!=0?horizontal:p.face;p.dashY=0;p.coyote=p.buffer=0;Emit("dash",new JObject{{"free",free},{"count",p.dashCount}});
            }
            if(input.jumpPressed&&p.rail!=null&&p.rail.allowExit){p.rail=null;p.launched=true;p.launchX=p.vx;p.vy=-config["jump"];p.buffer=0;}
            if(p.rail!=null){MoveRail(dt);foreach(var o in Room.Objects)TryCollect(o);UpdateInactiveAI(dt);return;}
            if(p.buffer>0&&p.coyote>0&&p.dash<=0&&!p.launched){p.vy=-config["jump"];p.grounded=false;p.coyote=p.buffer=0;Emit("jump");}
            bool dashing=p.dash>0;
            if(dashing){double speed=Math.Max(0,config["dashSpeed"]-config["dashDeceleration"]*(config["dashTime"]-p.dash));p.vx=p.dashX*speed;p.vy=p.dashY*speed;p.dash=Math.Max(0,p.dash-dt);}
            else{p.vx=p.launched?(Math.Abs(p.launchX)<1?Accelerate(p.vx,horizontal,config["speed"],dt,config["moveAccelerationTime"]):p.launchX+horizontal*45):SurfaceVelocity(p,horizontal,dt);p.vy=Math.Min(config["maxFall"],p.vy+config["gravity"]*dt);}
            p.x+=p.vx*dt;foreach(var b in colliders)if(MotionRect.Overlap(p.Rect,b)){if(p.vx>0)p.x=b.x-p.w;else if(p.vx<0)p.x=b.x+b.w;p.vx=0;if(dashing)p.dashX=0;}
            p.x=Clamp(p.x,0,Room.Cols*32-p.w);double oldTop=p.y,oldBottom=p.y+p.h;p.y+=p.vy*dt;p.grounded=false;p.support=null;
            bool landed=false;MotionRect best=default(MotionRect);foreach(var b in colliders)if(p.vy>=0&&oldBottom<=b.y+.1&&MotionRect.Overlap(p.Rect,b))if(!landed||b.y<best.y||b.y==best.y&&(b.priority>best.priority||b.priority==best.priority&&b.index<best.index)){best=b;landed=true;}
            if(landed){p.y=best.y-p.h;p.vy=0;p.grounded=true;p.support=best.id;p.launched=false;if(dashing)p.dashY=0;}
            else if(p.vy<0)foreach(var b in colliders)if(oldTop>=b.y+b.h-.1&&MotionRect.Overlap(p.Rect,b)){p.y=b.y+b.h;p.vy=0;if(dashing)p.dashY=0;break;}
            if(p.grounded&&!wasGrounded){p.freeDash=true;p.dashCount=0;p.paidDashUsed=false;Emit("land");}
            if(p.y<0){p.y=0;p.vy=0;if(dashing)p.dashY=0;}
            if(p.y>Room.Rows*32+80){if(LockHealth){p.x=Checkpoint?.x??Entry.X*32+4;p.y=Checkpoint?.y??Entry.Y*32+4;ClearFlightMotion();}else Retry("掉出房间");return;}
            foreach(var o in Room.Objects){if(!LockHealth&&o.Type=="common.spike"&&SpikeTouches(p.Rect,ObjectRect(o),o.Text("direction","up"))){Retry("碰到尖刺");return;}TryCollect(o);}
            TriggerObjects(oldBottom,input);UpdateInactiveAI(dt);if(Player!=p)return;CheckExits();
        }
        void UpdateInactiveAI(double dt){UpdateAI(dt);}
        public static double Accelerate(double velocity,int horizontal,double speed,double dt,double ramp){if(horizontal==0)return 0;double current=Math.Sign(velocity)==horizontal?Math.Min(Math.Abs(velocity),speed):0;return horizontal*Math.Min(speed,current+speed/ramp*dt);}
        public static double Clamp(double n,double a,double b){return Math.Max(a,Math.Min(b,n));}
        public static double Hypot(double a,double b){return Math.Sqrt(a*a+b*b);}
    }
}
