using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public struct NativePoint {public double x,y;public NativePoint(double x,double y){this.x=x;this.y=y;}}
    public sealed class NativeAIWarning {public double remaining;public NativePoint to;public string id;}
    public sealed class NativeAIState
    {
        public string id;public bool active,flight;public int tier,steal=1;public double x,y,speed=265,vx,vy;
        public NativeAIWarning warning;public readonly List<string> teleported=new List<string>();public readonly List<NativePoint> trail=new List<NativePoint>();
    }
    public sealed class NativeTransformAnimation {public string kind;public double from,to,t;public NativeTransformAnimation Copy(){return (NativeTransformAnimation)MemberwiseClone();}}
    public sealed class NativeMovableState {public double progress,angle;public NativeTransformAnimation anim;public NativeMovableState Copy(){return new NativeMovableState{progress=progress,angle=angle,anim=anim?.Copy()};}}
    public sealed class NativeRoomState
    {
        public Dictionary<string,MotionObjectState> objects=new Dictionary<string,MotionObjectState>();
        public Dictionary<string,string> zones=new Dictionary<string,string>();public string environment;
        public Dictionary<string,NativeMovableState> movables=new Dictionary<string,NativeMovableState>();
        public NativeRoomState Copy(){var c=new NativeRoomState{environment=environment};foreach(var p in objects)c.objects.Add(p.Key,p.Value.Copy());foreach(var p in zones)c.zones.Add(p.Key,p.Value);foreach(var p in movables)c.movables.Add(p.Key,p.Value.Copy());return c;}
    }
    public sealed class NativeCheckpoint
    {
        public string id,phase,aiId;public double? x,y;public int face,tokens,charges,recharge,score,tier,life,dashCount;public bool active,freeDash,paidDashUsed;
        public HashSet<string> credited;public NativeRoomState state;
    }
    public sealed partial class NativeMotion
    {
        public NativeAIState AI {get;private set;}
        public NativeCheckpoint Checkpoint {get;private set;}
        public string Phase="slow",CourseAIId,RoomEnvironment;
        public bool CourseAIActive,DeveloperEnabled,LockHealth,DeveloperFlight;
        public int CourseAITier;
        public readonly Dictionary<string,string> Zones=new Dictionary<string,string>();
        public readonly Dictionary<string,NativeMovableState> Movables=new Dictionary<string,NativeMovableState>();
        readonly Dictionary<string,NativeRoomState> roomCaches=new Dictionary<string,NativeRoomState>();
        readonly Dictionary<string,NativeRoomState> lifeBaselines=new Dictionary<string,NativeRoomState>();
        NativePoint? flightReturn;bool completionAwarded;public bool Completed{get{return completionAwarded;}}
        public event Action<string> RoomChanged;
        public event Action Finished;
        NativePoint PlayerCenter {get{return new NativePoint(Player.x+Player.w/2,Player.y+Player.h/2);}}
        static string IdOr(string a,string b){return string.IsNullOrEmpty(a)?b:a;}
        public NativeRoomState CaptureRoom(){var s=new NativeRoomState{environment=RoomEnvironment};foreach(var p in ObjectStates)s.objects.Add(p.Key,p.Value.Copy());foreach(var p in Zones)s.zones.Add(p.Key,p.Value);foreach(var p in Movables)s.movables.Add(p.Key,p.Value.Copy());return s;}
        string InitialTemperature(string zone=null)
        {
            var z=Room.Zones.Find(v=>v.Id==zone);string value=(string)z?.Raw["initial"]??IdOr(Room.Environment,"cold");
            foreach(var o in Room.Objects)if(o.Type=="physics.thermal"&&o.Text("zoneId")==IdOr(zone,"")){string initial=o.Text("initialState","inherit");if(initial=="hot"||initial=="cold")value=initial;}
            return value;
        }
        public string TemperatureAt(NativeObject o)
        {
            if(o.Type!="physics.ice")return Zones.TryGetValue(o.Text("zoneId"),out var value)?value:RoomEnvironment;
            bool cold=false;var r=ObjectRect(o);foreach(var z in Room.Zones)if(MotionRect.Overlap(r,new MotionRect(null,z.X*32,z.Y*32,z.W*32,z.H*32))){if(Zones[z.Id]=="hot")return "hot";cold=true;}return cold?"cold":RoomEnvironment;
        }
        MotionObjectState CreateState(NativeObject o){var s=new MotionObjectState();if(o.Type=="physics.ice"){s.solid=TemperatureAt(o)=="cold";s.respawnRemaining=o.Number("respawnDelay",1);}else if(o.Type=="physics.thermal")s.lastTemperature=TemperatureAt(o);return s;}
        void RestoreRoom(NativeRoomState s){ObjectStates.Clear();foreach(var p in s.objects)ObjectStates.Add(p.Key,p.Value.Copy());Zones.Clear();foreach(var p in s.zones)Zones.Add(p.Key,p.Value);RoomEnvironment=s.environment;Movables.Clear();foreach(var p in s.movables)Movables.Add(p.Key,p.Value.Copy());}
        void LoadGameplayRoom(string roomId,string entryId,MotionPlayer carry,NativeCheckpoint respawn)
        {
            if(Room!=null)roomCaches[Room.Id]=CaptureRoom();
            Room=Course.Rooms.Find(v=>v.Id==roomId)??throw new NativeDataException("目标房间不存在");Entry=Room.Entries.Find(v=>v.Id==entryId)??Room.Entries[0];
            if(!SupportsRoom(Room,out var unsupported))throw new NotSupportedException(unsupported);
            var old=Player;Player=new MotionPlayer{x=respawn?.x??Entry.X*32+4,y=respawn?.y??Entry.Y*32+4,face=respawn?.face??((int?)Entry.Raw["face"]??1),freeDash=old?.freeDash??true,dashCount=old?.dashCount??0,paidDashUsed=old?.paidDashUsed??false};
            if(carry!=null){Player.vx=carry.vx;Player.vy=carry.vy;if(Math.Abs(carry.vx)>1||Math.Abs(carry.vy)>1){Player.launched=true;Player.launchX=carry.vx;}}
            if(Room.Phase!="inherit")Phase=Room.Phase;if(Room.AiPolicy=="start")CourseAIActive=true;CourseAIId=IdOr(CourseAIId,Course.AiId);
            var pc=PlayerCenter;AI=new NativeAIState{id=IdOr(Room.AiId,CourseAIId),active=Room.AiPolicy!="off"&&CourseAIActive,tier=CourseAITier,x=pc.x-165,y=pc.y,speed=265+30*CourseAITier,steal=1+2*CourseAITier};AI.trail.Add(pc);AiHits=0;
            objects.Clear();creditKeys.Clear();terrain.Clear();ObjectStates.Clear();Zones.Clear();Movables.Clear();int ti=0;
            foreach(var t in Room.Tiles)if(t.Collision){var b=new MotionRect("tile-"+t.X+"-"+t.Y,t.X*32,t.Y*32,32,32,0);b.index=ti++;terrain.Add(b);}
            RoomEnvironment=InitialTemperature();foreach(var z in Room.Zones)Zones.Add(z.Id,InitialTemperature(z.Id));
            foreach(var o in Room.Objects){objects.Add(o.Id,o);creditKeys.Add(o.Id,Room.Id+"/"+o.Id);ObjectStates.Add(o.Id,CreateState(o));}foreach(var b in Room.Movables)Movables.Add(b.Id,new NativeMovableState());
            if(roomCaches.TryGetValue(roomId,out var cache))RestoreRoom(cache);if(!lifeBaselines.ContainsKey(roomId))lifeBaselines.Add(roomId,CaptureRoom());
            completionAwarded=false;RoomTime=0;RespawnRemaining=0;ExitCooldown=.4;AiProcessing=.8;AiCooldown=0;Mode="playing";Message=Room.Name;Checkpoint=CaptureCheckpoint(respawn?.id,respawn?.x,respawn?.y);
            Emit("room-enter",new JObject{{"entryId",Entry.Id}});flightReturn=null;if(DeveloperFlight)BeginFlight();RoomChanged?.Invoke(roomId);
        }
        public void SetTemperature(string zone,string value)
        {
            // Track only affected ice; no JSON state is allocated in the simulation loop.
            var previous=new Dictionary<string,string>();foreach(var o in Room.Objects)if(o.Type=="physics.ice")previous.Add(o.Id,TemperatureAt(o));
            if(string.IsNullOrEmpty(zone))RoomEnvironment=value;else Zones[zone]=value;
            foreach(var o in Room.Objects)if(o.Type=="physics.ice"&&previous[o.Id]!=TemperatureAt(o)&&TemperatureAt(o)=="cold"){var s=ObjectStates[o.Id];bool create=!s.solid;s.solid=true;s.standing=s.respawnRemaining=0;if(create){s.generation++;Emit("ice-create",new JObject{{"id",o.Id},{"reason","cold"}});}}
        }
        NativeCheckpoint CaptureCheckpoint(string id=null,double? x=null,double? y=null){return new NativeCheckpoint{id=id,x=x,y=y,face=Player.face,tokens=Tokens,charges=Charges,recharge=Recharge,score=Score,freeDash=Player.freeDash,dashCount=Player.dashCount,paidDashUsed=Player.paidDashUsed,credited=new HashSet<string>(Credited),state=CaptureRoom(),active=CourseAIActive,tier=CourseAITier,aiId=CourseAIId,phase=Phase,life=Life};}
        public bool SafePosition(double x,double y)
        {
            var r=new MotionRect(null,x,y,24,28);if(x<0||y<0||x+24>Room.Cols*32||y+28>Room.Rows*32)return false;BuildColliders();foreach(var b in colliders)if(MotionRect.Overlap(r,b))return false;foreach(var o in Room.Objects)if(o.Type=="common.spike"&&SpikeTouches(r,ObjectRect(o),o.Text("direction","up")))return false;return true;
        }
        void SaveCheckpoint(NativeObject o)
        {
            if(Mode!="playing"||DeveloperFlight||Checkpoint.id==o.Id)return;double x=o.X*32+4,y=o.Collision?o.Y*32-28:o.Y*32+4;
            if(!SafePosition(x,y)){x=Player.x;y=Player.y-(Player.crouching?10:0);}if(!SafePosition(x,y)){Message="存档点周围没有安全复活位置。";return;}
            Checkpoint=CaptureCheckpoint(o.Id,x,y);Emit("checkpoint",new JObject{{"id",o.Id},{"x",x},{"y",y}});Message="存档点已保存，死亡或重试后从这里继续。";
        }
        static void RestoreThermal(NativeRoom room,NativeRoomState state){foreach(var o in room.Objects)if(o.Type=="physics.thermal"&&state.objects.TryGetValue(o.Id,out var s)&&s.lastTemperature!=null){if(o.Text("zoneId")=="")state.environment=s.lastTemperature;else state.zones[o.Text("zoneId")]=s.lastTemperature;}}
        void ApplyLifeReset(NativeRoom room,NativeRoomState state){if(!lifeBaselines.TryGetValue(room.Id,out var baseline))return;foreach(var o in room.Objects)if(o.ResetPolicy=="life")state.objects[o.Id]=baseline.objects[o.Id].Copy();RestoreThermal(room,state);}
        void RetryGameplay(string reason)
        {
            if(RespawnRemaining>0&&Mode=="playing")return;var preserve=new Dictionary<string,MotionObjectState>();foreach(var o in Room.Objects)if(o.ResetPolicy=="preserve")preserve.Add(o.Id,ObjectStates[o.Id].Copy());
            roomCaches[Room.Id]=CaptureRoom();foreach(var r in Course.Rooms)if(roomCaches.TryGetValue(r.Id,out var cached))ApplyLifeReset(r,cached);
            Deaths++;AiHits=0;Emit("retry",new JObject{{"reason",reason}});var cp=Checkpoint;var room=Room;var entry=Entry.Id;Score=cp.score;Tokens=cp.tokens;Charges=cp.charges;Recharge=cp.recharge;Credited.Clear();foreach(var c in cp.credited)Credited.Add(c);CourseAIActive=cp.active;CourseAITier=cp.tier;CourseAIId=cp.aiId;Phase=cp.phase;Life=cp.life+1;
            var state=cp.state.Copy();ApplyLifeReset(room,state);roomCaches[room.Id]=state;lifeBaselines.Clear();Room=null;LoadGameplayRoom(room.Id,entry,null,cp);
            foreach(var o in Room.Objects){if(preserve.TryGetValue(o.Id,out var saved))ObjectStates[o.Id]=saved;else if(o.ResetPolicy=="initial")ObjectStates[o.Id]=CreateState(o);if(o.Type=="physics.thermal"&&ObjectStates[o.Id].lastTemperature!=null)SetTemperature(o.Text("zoneId"),ObjectStates[o.Id].lastTemperature);if(o.Type=="common.aiStart"&&!AI.active){var s=ObjectStates[o.Id];s.used=s.firedDuringContact=s.waitingAI=false;s.hasWaitingAI=true;s.cooldown=0;}}
            Player.freeDash=true;Player.dashCount=0;Player.paidDashUsed=false;RespawnRemaining=.5;Message=reason;
        }
        void MechanismFire(NativeObject o,MotionObjectState s)
        {
            switch(o.Type){case "physics.thermal":string next=o.Text("mode","toggle");if(next=="toggle")next=TemperatureAt(o)=="cold"?"hot":"cold";SetTemperature(o.Text("zoneId"),next);s.lastTemperature=next;Emit("temperature",new JObject{{"id",o.Id},{"zoneId",o.Text("zoneId")},{"value",next}});break;
                case "common.aiStart":case "common.aiStartHollow":ActivateAI(o);break;case "common.checkpoint":SaveCheckpoint(o);break;case "legacy.rotor":TransformGroup(o,"rotor");break;case "legacy.integral":TransformGroup(o,"integral");break;case "legacy.derivative":TransformGroup(o,"derivative");break;}
        }
        void TickMechanisms(double dt)
        {
            MotionRect prior=default(MotionRect);bool found=false;if(Player.grounded&&Player.support!=null){BuildColliders();foreach(var b in colliders)if(b.id==Player.support){prior=b;found=true;break;}}
            foreach(var o in Room.Objects){var s=ObjectStates[o.Id];s.cooldown=Math.Max(0,s.cooldown-dt);if(o.Type!="physics.ice")continue;
                if(TemperatureAt(o)!="cold"){if(s.solid){s.solid=false;s.respawnRemaining=o.Number("respawnDelay",1);Emit("ice-melt",new JObject{{"id",o.Id},{"reason","heat"}});}continue;}
                if(s.solid){if(Player.grounded&&Player.support==o.Id)s.standing+=dt;if(s.standing>=o.Number("meltAfter",5)){s.solid=false;s.respawnRemaining=o.Number("respawnDelay",1);Emit("ice-melt",new JObject{{"id",o.Id},{"reason","standing"}});}}
                else{s.respawnRemaining=Math.Max(0,s.respawnRemaining-dt);if(s.respawnRemaining==0&&!MotionRect.Overlap(Player.Rect,ObjectRect(o))&&(!AI.active||!MotionRect.Overlap(new MotionRect(null,AI.x-12,AI.y-14,24,28),ObjectRect(o)))){s.solid=true;s.standing=0;s.generation++;Emit("ice-create",new JObject{{"id",o.Id}});}}
            }
            foreach(var s in Movables.Values)if(s.anim!=null){var a=s.anim;a.t=Math.Min(.45,a.t+dt);double v=a.from+(a.to-a.from)*a.t/.45;if(a.kind=="angle")s.angle=v;else s.progress=v;if(a.t==.45)s.anim=null;}
            if(found){BuildColliders();foreach(var b in colliders)if(b.id==Player.support){Player.x+=b.x-prior.x;Player.y+=b.y-prior.y;break;}}
        }
        double SurfaceVelocity(MotionPlayer p,int horizontal,double dt){if(p.grounded&&p.support!=null&&objects.TryGetValue(p.support,out var o)&&o.Type=="physics.ice"){double v=p.vx;if(horizontal!=0)v=Clamp(v+horizontal*430*dt,-config["speed"],config["speed"]);else v*=Math.Exp(-o.Number("friction",1.4)*dt);return v;}return Accelerate(p.vx,horizontal,config["speed"]*(p.crouching?.45:1),dt,config["moveAccelerationTime"]);}
        public MotionRect MovableRect(NativeRegion b){var s=Movables[b.Id];if(objects.TryGetValue((string)b.Raw["padId"]??"",out var o)&&o.Type=="legacy.rotor"){double a=s.angle*Math.PI/180,px=(o.X+.5)*32,py=o.Y*32,dx=(b.X+.5)*32-px,dy=(b.Y+.5)*32-py;return new MotionRect(b.Id,px+dx*Math.Cos(a)-dy*Math.Sin(a)-16,py+dx*Math.Sin(a)+dy*Math.Cos(a)-16,32,32);}return new MotionRect(b.Id,(b.X+(((double?)b.Raw["targetX"]??b.X)-b.X)*s.progress)*32,(b.Y+(((double?)b.Raw["targetY"]??b.Y)-b.Y)*s.progress)*32,32,32);}
        void TransformGroup(NativeObject o,string kind){foreach(var b in Room.Movables)if((string)b.Raw["padId"]==o.Id){var r=MovableRect(b);if(Hypot(r.x+16-(o.X+.5)*32,r.y+16-o.Y*32)>o.Number("range",12)*32)continue;var s=Movables[b.Id];s.anim=new NativeTransformAnimation{kind=kind=="rotor"?"angle":"progress",from=kind=="rotor"?s.angle:s.progress,to=kind=="rotor"?s.angle+o.Number("angle",90):o.Flag("once")?1:s.progress>.5?0:1};}if(kind=="rotor"){Launch(o.Number("launchX"),o.Number("launchY"));LaunchAI(o,o.Number("range",3),o.Number("launchX"),o.Number("launchY"));}Emit("transform",new JObject{{"id",o.Id},{"kind",kind}});}
        public string VisualState(NativeObject o){var s=ObjectStates[o.Id];switch(o.Type){case "physics.ice":return !s.solid?"melted":s.standing>=o.Number("meltAfter",5)*.6?"cracked":"solid";case "physics.thermal":return TemperatureAt(o);case "common.checkpoint":return Checkpoint.id==o.Id?"active":"idle";case "common.aiStart":return AI.active?"active":"idle";default:return s.waitingAI?"waiting":s.cooldown>0?"active":"idle";}}
        void CheckExits(){if(completionAwarded){Mode="won";return;}foreach(var exit in Room.Exits)if(ExitCooldown==0&&MotionRect.Overlap(Player.Rect,new MotionRect(null,exit.X*32,exit.Y*32,exit.W*32,exit.H*32))){var edge=Course.Connections.Find(c=>c.FromRoomId==Room.Id&&c.ExitId==exit.Id);if(edge==null){completionAwarded=true;Score+=50000;Mode="won";Emit("finish");Finished?.Invoke();}else{string from=Room.Id;LoadGameplayRoom(edge.ToRoomId,edge.EntryId,edge.Velocity=="keep"?Player:null,null);Emit("room-change",new JObject{{"from",from},{"to",edge.ToRoomId}});}return;}}
    }
}
