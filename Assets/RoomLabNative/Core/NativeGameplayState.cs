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
    public sealed class NativeMovableState {public double progress,angle,pathTime;public NativeTransformAnimation anim;public NativeMovableState Copy(){return new NativeMovableState{progress=progress,angle=angle,pathTime=pathTime,anim=anim?.Copy()};}}
    public sealed class NativeRoomState
    {
        public Dictionary<string,MotionObjectState> objects=new Dictionary<string,MotionObjectState>();
        public Dictionary<string,string> zones=new Dictionary<string,string>();public string environment;
        public Dictionary<string,NativeMovableState> movables=new Dictionary<string,NativeMovableState>();
        public double awareness=50;public double? pendingAwareness;public double awarenessWait;public int awarenessPulses; public Dictionary<string,bool> switches=new Dictionary<string,bool>(); public Dictionary<string,double> platforms=new Dictionary<string,double>();
        public NativeRoomState Copy(){var c=new NativeRoomState{environment=environment,awareness=awareness,pendingAwareness=pendingAwareness,awarenessWait=awarenessWait,awarenessPulses=awarenessPulses,switches=new Dictionary<string,bool>(switches),platforms=new Dictionary<string,double>(platforms)};foreach(var p in objects)c.objects.Add(p.Key,p.Value.Copy());foreach(var p in zones)c.zones.Add(p.Key,p.Value);foreach(var p in movables)c.movables.Add(p.Key,p.Value.Copy());return c;}
    }
    public sealed class NativeCheckpoint
    {
        public string id,phase,aiId;public double? x,y,aiX,aiY;public System.Collections.Generic.List<NativePoint> aiTrail;public int face,tokens,charges,recharge,score,tier,life,dashCount;public bool active,freeDash,paidDashUsed;
        public HashSet<string> credited;public NativeRoomState state;public Dictionary<string,bool> signals=new Dictionary<string,bool>();
    }
    // 推导出的双向回程：从某个出口进入房间后，同一个到达入口反向回到来源房间的那个出口。
    public sealed class NativeEntryReturn
    {
        public string RoomId,ExitId,EntryId;
        public NativeEntryReturn Copy(){return new NativeEntryReturn{RoomId=RoomId,ExitId=ExitId,EntryId=EntryId};}
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
        public NativeRoomState CaptureRoom(){var s=new NativeRoomState{environment=RoomEnvironment};foreach(var p in ObjectStates)s.objects.Add(p.Key,p.Value.Copy());foreach(var p in Zones)s.zones.Add(p.Key,p.Value);foreach(var p in Movables)s.movables.Add(p.Key,p.Value.Copy());CopyReworkTo(s);return s;}
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
        void RestoreRoom(NativeRoomState s){RestoreRework(s);ObjectStates.Clear();foreach(var p in s.objects)ObjectStates.Add(p.Key,p.Value.Copy());Zones.Clear();foreach(var p in s.zones)Zones.Add(p.Key,p.Value);RoomEnvironment=s.environment;Movables.Clear();foreach(var p in s.movables)Movables.Add(p.Key,p.Value.Copy());}
        // link/spawnExitId：显式连线带过来的双向回程，以及回程落点所在的来源出口（需要先离开才重新武装）。
        void LoadGameplayRoom(string roomId,string entryId,MotionPlayer carry,NativeCheckpoint respawn,NativeEntryReturn link=null,string spawnExitId=null)
        {
            ResetCheckpointChoice();
            bool carryResource=IsAwarenessResource&&Room!=null&&respawn==null;double carriedAwareness=Awareness,carriedWait=awarenessWait;double? carriedPending=PendingAwareness;
            if(Room!=null)roomCaches[Room.Id]=CaptureRoom();
            Room=Course.Rooms.Find(v=>v.Id==roomId)??throw new NativeDataException("目标房间不存在");Entry=Room.Entries.Find(v=>v.Id==entryId)??Room.Entries[0];
            if(!SupportsRoom(Room,out var unsupported))throw new NotSupportedException(unsupported);
            movingRideSupport=null;rideOverlapGrace.Clear();submitGateContact=null;
            entryReturn=link!=null&&link.EntryId==Entry.Id?link.Copy():null;
            if(entryReturn==null&&IsEditorBuild15){
                var incoming=Course.Connections.FindAll(wire=>wire.ToRoomId==Room.Id&&wire.EntryId==Entry.Id);
                if(incoming.Count==1)entryReturn=BuildEntryReturn(incoming[0].FromRoomId,incoming[0].ExitId,incoming[0]);
            }
            entryReturnArmed=false;
            suppressedExitId=null;exitTriggerArmed=true;returnHoldDoor=null;
            var old=Player;Player=new MotionPlayer{x=respawn?.x??Entry.X*32+4,y=respawn?.y??Entry.Y*32+4,face=respawn?.face??((int?)Entry.Raw["face"]??1),freeDash=old?.freeDash??true,dashCount=old?.dashCount??0,paidDashUsed=old?.paidDashUsed??false};
            if(carry!=null){Player.vx=carry.vx;Player.vy=carry.vy;if(Math.Abs(carry.vx)>1||Math.Abs(carry.vy)>1){Player.launched=true;Player.launchX=carry.vx;}}
            if(Room.Phase!="inherit")Phase=Room.Phase;if(Room.AiPolicy=="start")CourseAIActive=true;CourseAIId=IdOr(CourseAIId,Course.AiId);
            var pc=PlayerCenter;AI=new NativeAIState{id=IdOr(Room.AiId,CourseAIId),active=Room.AiPolicy!="off"&&CourseAIActive,tier=CourseAITier,x=pc.x-165,y=pc.y,speed=AiSpeed(CourseAITier),steal=1+2*CourseAITier};AI.trail.Add(pc);AiHits=0;assistantStartupUntil=0;
            spikeMounts.Clear();objects.Clear();creditKeys.Clear();terrain.Clear();terrainLayers.Clear();ObjectStates.Clear();Zones.Clear();Movables.Clear();int ti=0;
            foreach(var t in Room.Tiles)if(t.Collision){var b=new MotionRect("tile-"+t.X+"-"+t.Y,t.X*32,t.Y*32,32,32,0);b.index=ti++;terrain.Add(b);if(t.Raw["rework"]!=null)terrainLayers[b.id]=t.Raw;}
            RoomEnvironment=InitialTemperature();foreach(var z in Room.Zones)Zones.Add(z.Id,InitialTemperature(z.Id));
            foreach(var o in Room.Objects){objects.Add(o.Id,o);creditKeys.Add(o.Id,Room.Id+"/"+o.Id);ObjectStates.Add(o.Id,CreateState(o));}foreach(var b in Room.Movables)Movables.Add(b.Id,new NativeMovableState());
            if(IsRework){PendingAwareness=null;awarenessWait=0;awarenessPulses=0;Awareness=(double?)Room.Raw["nativeCampaign"]?["awareness"]??50;ReworkSwitches.Clear();ReworkPositions.Clear();}if(roomCaches.TryGetValue(roomId,out var cache))RestoreRoom(cache);LoadReworkRoom();if(carryResource){Awareness=carriedAwareness;PendingAwareness=carriedPending;awarenessWait=carriedWait;}if(!lifeBaselines.ContainsKey(roomId))lifeBaselines.Add(roomId,CaptureRoom());
            // 入口绑了机关砖时，出生点跟着实时砖位走（编辑器同一套偏移），否则出生在作者坐标会离开门。
            if(respawn==null){var spawnEntry=EntryRect(Entry);double shiftX=spawnEntry.x-Entry.X*32,shiftY=spawnEntry.y-Entry.Y*32;
                if(shiftX!=0||shiftY!=0){Player.x+=shiftX;Player.y+=shiftY;AI.x+=shiftX;AI.y+=shiftY;AI.trail.Clear();AI.trail.Add(PlayerCenter);}}
            // 出生时就压在返回门上的情况（旧档 returnAfterLeave / 回程落点）先压制，离开后才放行。
            arrivalReturnExit=Room.Exits.Find(exit=>exit.Raw["returnAfterLeave"]?.Value<bool>()==true&&MotionRect.Overlap(Player.Rect,ExitRect(exit)))?.Id;
            suppressedExitId=spawnExitId;exitTriggerArmed=string.IsNullOrEmpty(spawnExitId);
            completionAwarded=false;RoomTime=0;RespawnRemaining=0;ExitCooldown=.4;AiProcessing=.8;AiCooldown=0;ApplyAiEntrance();
            if(AI.active&&respawn?.aiX is double savedX&&respawn.aiY is double savedY&&
                savedX>=0&&savedX<=Room.Cols*32&&savedY>=0&&savedY<=Room.Rows*32){
                AI.x=savedX;AI.y=savedY;
                AI.trail.Clear();
                AI.warning=null;
            
                if(respawn.aiTrail!=null&&respawn.aiTrail.Count>0)
                {
                    AI.trail.Clear();
                    foreach(var pt in respawn.aiTrail)AI.trail.Add(pt);
                }
            }
            Mode="playing";Message=Room.Name;Checkpoint=CaptureCheckpoint(respawn?.id,respawn?.x,respawn?.y);RememberNetworkRoom();
            Emit("room-enter",new JObject{{"entryId",Entry.Id}});flightReturn=null;if(DeveloperFlight)BeginFlight();RoomChanged?.Invoke(roomId);
        }
        public void SetTemperature(string zone,string value)
        {
            // Track only affected ice; no JSON state is allocated in the simulation loop.
            var previous=new Dictionary<string,string>();foreach(var o in Room.Objects)if(o.Type=="physics.ice")previous.Add(o.Id,TemperatureAt(o));
            if(string.IsNullOrEmpty(zone))RoomEnvironment=value;else Zones[zone]=value;
            foreach(var o in Room.Objects)if(o.Type=="physics.ice"&&previous[o.Id]!=TemperatureAt(o)&&TemperatureAt(o)=="cold"){var s=ObjectStates[o.Id];bool create=!s.solid;s.solid=true;s.standing=s.respawnRemaining=0;if(create){s.generation++;Emit("ice-create",new JObject{{"id",o.Id},{"reason","cold"}});}}
        }
        NativeCheckpoint CaptureCheckpoint(string id=null,double? x=null,double? y=null){return new NativeCheckpoint{id=id,x=x,y=y,face=Player.face,tokens=Tokens,charges=Charges,recharge=Recharge,score=Score,freeDash=Player.freeDash,dashCount=Player.dashCount,paidDashUsed=Player.paidDashUsed,credited=new HashSet<string>(Credited),signals=new Dictionary<string,bool>(ReworkSignals),state=CaptureRoom(),active=CourseAIActive,aiX=AI?.active==true?(double?)AI.x:null,aiY=AI?.active==true?(double?)AI.y:null,aiTrail=AI!=null&&AI.active&&AI.trail!=null?new System.Collections.Generic.List<NativePoint>(AI.trail):null,tier=CourseAITier,aiId=CourseAIId,phase=Phase,life=Life};}
        // 主线把助手调慢一档（编辑器里它跟着玩家走，别贴得太紧）。
        // 难度：0 简单（AI 速度 -25%）、1 普通、2 困难（+25%）；开局可在主菜单选择，之后随时在设置里改
        // 助手门禁：未唤醒助手时不能进入下一个房间（碰门时给提示）
        string submitGateContact, arrivalReturnExit;
        // 双向回程：到达入口在冷却 + 离开过之后才反向放行；来源出口在离开前保持压制，避免原地回弹。
        NativeEntryReturn entryReturn;
        string suppressedExitId;
        bool entryReturnArmed=true, exitTriggerArmed=true;
        public NativeRegion ReturnEntry=>entryReturn==null?null:Room.Entries.Find(entry=>entry.Id==entryReturn.EntryId);
        public bool EntryReturnAvailable{get{return entryReturn!=null;}}
        public double AiGateNoticeUntil;
        public string AiGateNoticeText;
        public int Difficulty=(int)System.Math.Max(0,System.Math.Min(2,UnityEngine.PlayerPrefs.GetInt("roomlab-difficulty",1)));
        public double DifficultyScale=>Difficulty<=0?.75:Difficulty>=2?1.25:1.0;
        public string DifficultyName{get{return Difficulty<=0?"简单":(Difficulty>=2?"困难":"普通");}}
        public void SetDifficulty(int d)
        {
            Difficulty=(int)System.Math.Max(0,System.Math.Min(2,d));
            UnityEngine.PlayerPrefs.SetInt("roomlab-difficulty",Difficulty);
            UnityEngine.PlayerPrefs.Save();
            if(AI!=null)AI.speed=AiSpeed(AI.tier);
        }
        public void CycleDifficulty()
        {
            Difficulty=(Difficulty+1)%3;
            UnityEngine.PlayerPrefs.SetInt("roomlab-difficulty",Difficulty);
            UnityEngine.PlayerPrefs.Save();
            if(AI!=null)AI.speed=AiSpeed(AI.tier);
        }
        void LoadDifficulty(){Difficulty=(int)System.Math.Max(0,System.Math.Min(2,UnityEngine.PlayerPrefs.GetInt("roomlab-difficulty",1)));}
        double AiSpeed(int tier){return (Rules==NativeGameplayRules.EditorBuild15?205+(tier==0?0:tier==1?9:14):265+30*tier)*DifficultyScale;}
        // room.aiExitBindings + project.map.aiConnections decide where the AI comes back.
        string CarryEntrance(string fromRoomId,string exitId,string destRoomId)
        {
            if (Project == null || string.IsNullOrEmpty(exitId) || string.IsNullOrEmpty(destRoomId)) return null;
            var room = Project.FindRoom(fromRoomId);
            if (room == null || !room.AiExitBindings.TryGetValue(exitId,out var aiExit) || string.IsNullOrEmpty(aiExit)) return null;
            foreach (var wire in Project.AiWires)
                if (wire.FromRoomId == fromRoomId && wire.AiExitId == aiExit && wire.ToRoomId == destRoomId && !string.IsNullOrEmpty(wire.AiEntranceId))
                    return wire.AiEntranceId;
            return null;
        }
        // A room entry (or respawn) refreshes the AI two seconds later, one tile above its
        // entrance, so the player gets a moment and the AI stops covering the marker art.
        void ApplyAiEntrance()
        {
            AiSpawnDelay = AI != null && AI.active ? 2.0 : 0;
            var entranceId = pendingAiEntrance; pendingAiEntrance = null;
            if(IsEditorBuild15&&AI?.active==true&&string.IsNullOrEmpty(entranceId))
                entranceId=(string)Room.Raw["aiEntryFallback"];
            if (string.IsNullOrEmpty(entranceId) || AI == null) return;
            foreach (var o in Room.Objects)
                if (o.Id == entranceId && o.Type == "common.portalIn")
                {
                    double cx = (o.X + o.W / 2.0) * 32, cy = (o.Y + o.H / 2.0) * 32 - 32;
                    // 入口上方/周边找一个真正站得住的位置，避免助手出现在墙里或半砖中。
                    double[] offsets = { 0, -32, -64, 32, 64, -96, 96 };
                    foreach (var dy in offsets)
                        foreach (var dx in new double[] { 0, -32, 32, -64, 64 })
                            if (SafePosition(cx + dx - 12, cy + dy - 14))
                            { AI.x = cx + dx; AI.y = cy + dy; AI.trail.Clear(); AI.warning = null; AiProcessing = .5; return; }
                    AI.x = cx; AI.y = cy; AI.trail.Clear(); AI.warning = null; AiProcessing = .5;
                    return;
                }
        }
        public bool SafePosition(double x,double y)
        {
            var r=new MotionRect(null,x,y,24,28);if(x<0||y<0||x+24>Room.Cols*32||y+28>Room.Rows*32)return false;BuildColliders();foreach(var b in colliders)if(MotionRect.Overlap(r,b))return false;foreach(var o in Room.Objects)if(LayerActive(o.Raw)&&o.Type=="common.spike"&&SpikeTouches(r,ObjectRect(o),SpikeFacing(o)))return false;return true;
        }
        bool AtDoor(double x,double y)
        {
            var body=new MotionRect(null,x,y,24,28);
            return Room.Exits.Exists(e=>MotionRect.Overlap(body,ExitRect(e)))||
                Room.Entries.Exists(e=>MotionRect.Overlap(body,EntryRect(e)));
        }

        bool TrySafeCheckpointSpawn(double centerX,double centerY,out double x,out double y)
        {
            x=centerX;y=centerY;
            for(int distance=0;distance<=64;distance+=8)
            for(int dy=-distance;dy<=distance;dy+=8){
                int dx=distance-Math.Abs(dy);
                for(int direction=-1;direction<=1;direction+=2){
                    double testX=centerX+dx*direction,testY=centerY+dy;
                    if(!AtDoor(testX,testY)&&SafePosition(testX,testY)){x=testX;y=testY;return true;}
                }
            }
            return false;
        }

        bool TryFlagSpawn(NativeObject flag,out double x,out double y)
        {
            var rect=ObjectRect(flag);
            return TrySafeCheckpointSpawn(rect.x+(rect.w-24)/2,
                flag.Collision?rect.y-28:rect.y+Math.Max(0,rect.h-28),out x,out y);
        }

        void SaveCheckpoint(NativeObject o)
        {
            if(Mode!="playing"||DeveloperFlight||!UsesManualSaveSlots&&!IsAwarenessResource&&Checkpoint.id==o.Id)return;double x=o.X*32+4,y=o.Collision?o.Y*32-28:o.Y*32+4;
            if(IsEditorBuild15){
                if(!TryFlagSpawn(o,out x,out y)){Message="存档点周围没有安全复活位置。";return;}
            }else{
                if(!SafePosition(x,y)){x=Player.x;y=Player.y-(Player.crouching?10:0);}
                if(!SafePosition(x,y)){Message="存档点周围没有安全复活位置。";return;}
            }
            if(IsContactAutosave){Checkpoint=CaptureCheckpoint(o.Id,x,y);SaveResourceAnchor();QueueContactAutoSave("checkpoint");Emit("checkpoint",new JObject{{"id",o.Id},{"x",x},{"y",y}});return;}
            if(RequestCheckpointChoice(o,x,y))return;
            Checkpoint=CaptureCheckpoint(o.Id,x,y);SaveResourceAnchor();Emit("checkpoint",new JObject{{"id",o.Id},{"x",x},{"y",y}});Message="存档点已保存，死亡或重试后从这里继续。";
        }
        static void RestoreThermal(NativeRoom room,NativeRoomState state){foreach(var o in room.Objects)if(o.Type=="physics.thermal"&&state.objects.TryGetValue(o.Id,out var s)&&s.lastTemperature!=null){if(o.Text("zoneId")=="")state.environment=s.lastTemperature;else state.zones[o.Text("zoneId")]=s.lastTemperature;}}
        void ApplyLifeReset(NativeRoom room,NativeRoomState state){if(!lifeBaselines.TryGetValue(room.Id,out var baseline))return;foreach(var o in room.Objects)if(o.ResetPolicy=="life")state.objects[o.Id]=baseline.objects[o.Id].Copy();RestoreThermal(room,state);}
        void RetryGameplay(string reason)
        {
            if(RespawnRemaining>0&&Mode=="playing")return;if(RetryResourceAnchor(reason))return;double deathX=Player.x,deathY=Player.y;var preserve=new Dictionary<string,MotionObjectState>();foreach(var o in Room.Objects)if(o.ResetPolicy=="preserve")preserve.Add(o.Id,ObjectStates[o.Id].Copy());
            roomCaches[Room.Id]=CaptureRoom();foreach(var r in Course.Rooms)if(roomCaches.TryGetValue(r.Id,out var cached))ApplyLifeReset(r,cached);
            Deaths++;AiHits=0;Emit("retry",new JObject{{"reason",reason}});var cp=Checkpoint;var room=Room;var entry=Entry.Id;Score=cp.score;Tokens=cp.tokens;Charges=cp.charges;Recharge=cp.recharge;var ownedItems=IsEditorBuild15?OwnedBuild15Keys():null;Credited.Clear();foreach(var c in cp.credited)Credited.Add(c);if(ownedItems!=null)foreach(var k in ownedItems)Credited.Add(k);CourseAIActive=cp.active;CourseAITier=cp.tier;CourseAIId=cp.aiId;Phase=cp.phase;Life=cp.life+1;
            if(IsRework){ReworkSignals.Clear();foreach(var v in cp.signals)ReworkSignals.Add(v.Key,v.Value);}var state=cp.state.Copy();ApplyLifeReset(room,state);roomCaches[room.Id]=state;lifeBaselines.Clear();var keepReturn=entryReturn;Room=null;LoadGameplayRoom(room.Id,entry,null,cp,keepReturn);respawnX=Player.x;respawnY=Player.y;
            // 还原助手的位置与路径轨迹（老存档没有 aiTrail 时自动跳过）
            if(cp.active&&AI!=null&&cp.aiTrail!=null&&cp.aiTrail.Count>0)
            {
                AI.active=true;
                if(cp.aiX.HasValue)AI.x=cp.aiX.Value;
                if(cp.aiY.HasValue)AI.y=cp.aiY.Value;
                AI.trail.Clear();
                foreach(var pt in cp.aiTrail)AI.trail.Add(pt);
                Player.invulnerable=System.Math.Max(Player.invulnerable,1.0);   // 复活保护：避免一复活就被抓
            }
            foreach(var o in Room.Objects){if(preserve.TryGetValue(o.Id,out var saved))ObjectStates[o.Id]=saved;else if(o.ResetPolicy=="initial")ObjectStates[o.Id]=CreateState(o);if(o.Type=="physics.thermal"&&ObjectStates[o.Id].lastTemperature!=null)SetTemperature(o.Text("zoneId"),ObjectStates[o.Id].lastTemperature);if(o.Type=="common.aiStart"&&!AI.active){var s=ObjectStates[o.Id];s.used=s.firedDuringContact=s.waitingAI=false;s.hasWaitingAI=true;s.cooldown=0;}}
            if(IsEditorBuild15)foreach(var o in Room.Objects)if(o.Type=="common.coin"){
                var coin=ObjectStates[o.Id];coin.used=false;coin.respawnRemaining=0;
            }
            if(IsRework)foreach(var o in Room.Objects)if(o.ResetPolicy=="preserve"&&ObjectStates[o.Id].used&&(o.Raw["rework"]?["switch"]!=null||o.Raw["rework"]?["signal"]!=null))ReworkFire(o,ObjectStates[o.Id]);
            // used 已随检查点回退、而机关砖还停在展开位时，把砖收回起点。
            if(IsEditorBuild15)ReconcileBuild15Bricks();
            Player.freeDash=true;Player.dashCount=0;Player.paidDashUsed=false;RespawnRemaining=.5;Message=reason;
            // 先留在死亡地点播完死亡动画，计时结束再回到复活点
            Player.x=deathX;Player.y=deathY;Player.vx=Player.vy=0;Player.grounded=false;pendingRespawn=true;
        }
        void MechanismFire(NativeObject o,MotionObjectState s)
        {
            if(TryBuild15Fire(o,s)||ReworkFire(o,s))return;switch(o.Type){case "calculus.integral":case "calculus.derivative":string transform=o.Type=="calculus.integral"?"integral":"derivative";TransformGroup(o,transform);s.fired=true;Message=transform=="integral"?"积分：机关砖向目标聚合":"求导：机关砖向目标展开";Emit("calculus-"+transform,new JObject{{"id",o.Id}});break;
                case "slacker.checkin":s.signIns++;Message="签到成功：第 "+s.signIns+" 次记录";Emit("checkin",new JObject{{"id",o.Id},{"count",s.signIns}});break;
                case "slacker.awake":int face=Player.face==0?1:Player.face;Launch(face*o.Number("speed",520),-o.Number("lift",140));s.boosts++;Message="清醒：短暂加速";Emit("awake",new JObject{{"id",o.Id},{"speed",o.Number("speed",520)},{"direction",face},{"count",s.boosts}});break;
                case "physics.thermal":string next=o.Text("mode","toggle");if(next=="toggle")next=TemperatureAt(o)=="cold"?"hot":"cold";SetTemperature(o.Text("zoneId"),next);s.lastTemperature=next;Emit("temperature",new JObject{{"id",o.Id},{"zoneId",o.Text("zoneId")},{"value",next}});break;
                case "common.aiStart":case "common.aiStartHollow":ActivateAI(o);break;case "common.checkpoint":SaveCheckpoint(o);break;case "legacy.rotor":TransformGroup(o,"rotor");break;case "legacy.integral":TransformGroup(o,"integral");break;case "legacy.derivative":TransformGroup(o,"derivative");break;}
        }
        bool developerItemsGranted;
        // ---- 骑移动机关砖（动态扫掠判定，快砖不穿模）----
        void CaptureMovables()
        {
            movableBefore.Clear();
            foreach (var b in Room.Movables) movableBefore[b.Id] = MovableRect(b);
        }
        public void CarryPlayerWithMovables()
        {
            if (RideId == null) return;
            if (!movableBefore.TryGetValue(RideId, out var was)) return;
            foreach (var b in Room.Movables)
            {
                if (b.Id != RideId) continue;
                var now = MovableRect(b);
                Player.x += now.x - was.x;
                Player.y += now.y - was.y;
                return;
            }
        }
        // 是否站在移动砖上：水平重叠 + 脚底落在"砖本帧扫过的区间"内（容差随单帧位移放大）
        bool StandingOnMovable(out NativeRegion brick)
        {
            brick = null;
            // 上升中不再一律排除：见循环内的逐砖判定（砖上升时会把人顶上去）                 // 上升/跳跃中不算
            double feet = Player.y + Player.h;
            foreach (var b in Room.Movables)
            {
                if (!LayerActive(b.Raw)) continue;
                var r = MovableRect(b);
                double x0 = r.x, x1 = r.x + r.w;
                if (movableBefore.TryGetValue(b.Id, out var wasX)) { x0 = Math.Min(wasX.x, r.x); x1 = Math.Max(wasX.x + wasX.w, r.x + r.w); }
                bool over = Player.x + Player.w > x0 + 3 && Player.x < x1 - 3;   // 水平扫掠
                if (!over) continue;
                double rise0 = 0;
                if (movableBefore.TryGetValue(b.Id, out var wasR)) rise0 = Math.Max(0, wasR.y - r.y);
                if (Player.vy < 0 && rise0 <= 0) continue;   // 上升中：仅当砖也在上升（顶人）才吸附
                double rise = 0, fall = 0;
                if (movableBefore.TryGetValue(b.Id, out var was))
                {
                    rise = Math.Max(0, was.y - r.y);          // 本帧上升量（y 向下增长）
                    fall = Math.Max(0, r.y - was.y);          // 本帧下降量
                }
                double top = r.y - rise - 1;                  // 扫掠上界：砖本帧到过的最高位置
                double bottom = r.y + 9 + fall;               // 扫掠下界
                if (feet >= top && feet <= bottom) { brick = b; return true; }
            }
            return false;
        }
        public void StickToRidingBrick()
        {
            NativeRegion on;
            if (StandingOnMovable(out on))
            {
                RideId = on.Id;
                var r = MovableRect(on);
                if (Player.y + Player.h > r.y)                // 仅在穿透时抬升
                {
                    Player.y = r.y - Player.h;
                    if (Player.vy > 0) Player.vy = 0;
                    Player.grounded = true;
                }
                return;
            }
            RideId = null;
        }
        public void GrantAllItems()
        {
            developerItemsGranted=true;
            Tokens = Math.Max(Tokens, 999);
            Charges = Math.Max(Charges, PaidStockCap);
            Recharge = 0;
            Emit("developer-grant-all", new JObject { { "tokens", Tokens } });
        }
        static void AdvanceMovable(NativeMovableState state,double dt)
        {
            var motion=state.anim;
            if(motion==null)return;
            if(motion.kind=="path"){
                state.pathTime=state.pathTime<motion.to?Math.Min(motion.to,state.pathTime+dt):Math.Max(motion.to,state.pathTime-dt);
                if(state.pathTime==motion.to)state.anim=null;
                return;
            }
            motion.t=Math.Min(.45,motion.t+dt);
            double value=motion.from+(motion.to-motion.from)*motion.t/.45;
            if(motion.kind=="angle")state.angle=value;
            else state.progress=value;
            if(motion.t==.45)state.anim=null;
        }

        string movingRideSupport;
        readonly HashSet<string> rideOverlapGrace = new HashSet<string>();
        bool IgnoreRideCollision(MotionRect collider)
        {
            if(!IsEditorBuild15||collider.id==null||collider.id==movingRideSupport||
                !Movables.ContainsKey(collider.id))return false;
            return movingRideSupport!=null||rideOverlapGrace.Contains(collider.id);
        }

        void UpdateRideOverlap()
        {
            if(!IsEditorBuild15)return;
            if(movingRideSupport!=null)
                foreach(var collider in colliders)
                    if(IgnoreRideCollision(collider)&&MotionRect.Overlap(Player.Rect,collider))
                        rideOverlapGrace.Add(collider.id);
            rideOverlapGrace.RemoveWhere(id=>!colliders.Exists(c=>c.id==id&&MotionRect.Overlap(Player.Rect,c)));
        }

        void MoveBuild15Bricks(double dt)
        {
            string support=Player.grounded?Player.support:null;
            if(support==null&&Player.vy>=0&&Player.rail==null)
                foreach(var brick in Room.Movables){
                    if(rideOverlapGrace.Contains(brick.Id)||Movables[brick.Id].anim==null||
                        !LayerActive(brick.Raw)||brick.Raw["collision"]?.Value<bool>()==false)continue;
                    var surface=MovableRect(brick);
                    if(Math.Abs(Player.y+Player.h-surface.y)<=.2&&Player.x<surface.x+surface.w&&Player.x+Player.w>surface.x){
                        support=brick.Id;Player.grounded=true;Player.support=support;
                        break;
                    }
                }
            movingRideSupport=support!=null&&Movables.TryGetValue(support,out var platform)&&platform.anim!=null?support:null;
            if(movingRideSupport!=null)BuildColliders();
            // The support proposes its movement first. Other bricks then yield
            // to the player's new position rather than pushing the player.
            for(int pass=0;pass<2;pass++)
            foreach(var brick in Room.Movables){
                bool riding=brick.Id==support;
                if(riding!=(pass==0))continue;
                var state=Movables[brick.Id];
                if(state.anim==null)continue;
                var before=MovableRect(brick);
                AdvanceMovable(state,dt);
                var after=MovableRect(brick);
                if(!LayerActive(brick.Raw)||brick.Raw["collision"]?.Value<bool>()==false)continue;
                if(riding){
                    double x=Player.x+(after.x-before.x),y=after.y-Player.h;
                    x=Clamp(x,0,Room.Cols*32-Player.w);
                    // A wall can stop the rider without stopping the mechanism.
                    if(after.x!=before.x)foreach(var collider in colliders)
                    {
                        if(collider.id==support||IgnoreRideCollision(collider)||
                            y>=collider.y+collider.h||y+Player.h<=collider.y)continue;
                        if(Player.x+Player.w<=collider.x+.001&&x+Player.w>collider.x)
                            x=collider.x-Player.w;
                        else if(Player.x>=collider.x+collider.w-.001&&x<collider.x+collider.w)
                            x=collider.x+collider.w;
                    }
                    var carried=new MotionRect(null,x,y,Player.w,Player.h);
                    bool blocked=y<0||x+Player.w<=after.x||x>=after.x+after.w;
                    foreach(var collider in colliders)
                        if(collider.id!=support&&!IgnoreRideCollision(collider)&&MotionRect.Overlap(carried,collider)){blocked=true;break;}
                    if(blocked){
                        Player.grounded=false;Player.support=null;
                        rideOverlapGrace.Add(brick.Id);
                        movingRideSupport=null;
                    }else{Player.x=x;Player.y=y;}
                }else if(MotionRect.Overlap(Player.Rect,after))rideOverlapGrace.Add(brick.Id);
            }
        }
        void TickMechanisms(double dt)
        {
            // 大 token 的复活计时（主线）：到点重新出现，但不会再加 token。
            if(Rules==NativeGameplayRules.EditorBuild15)
                foreach(var coin in Room.Objects)
                    if(coin.Type=="common.coin")
                    {
                        var s=ObjectStates[coin.Id];
                        if(s.used){s.respawnRemaining=Math.Max(0,s.respawnRemaining-dt);if(s.respawnRemaining==0)s.used=false;}
                    }
            MotionRect prior=default(MotionRect);bool found=false;if(Player.grounded&&Player.support!=null&&
                (objects.ContainsKey(Player.support)||IsRework||!IsEditorBuild15&&Movables.ContainsKey(Player.support))){
                BuildColliders();foreach(var b in colliders)if(b.id==Player.support){prior=b;found=true;break;}
            }
            TickReworkGeometry(dt);TickBuild15Teachers(dt);foreach(var o in Room.Objects){var s=ObjectStates[o.Id];s.cooldown=Math.Max(0,s.cooldown-dt);if(o.Type!="physics.ice")continue;
                if(TemperatureAt(o)!="cold"){if(s.solid){s.solid=false;s.respawnRemaining=o.Number("respawnDelay",1);Emit("ice-melt",new JObject{{"id",o.Id},{"reason","heat"}});}continue;}
                if(s.solid){if(Player.grounded&&Player.support==o.Id)s.standing+=dt;if(s.standing>=o.Number("meltAfter",5)){s.solid=false;s.respawnRemaining=o.Number("respawnDelay",1);Emit("ice-melt",new JObject{{"id",o.Id},{"reason","standing"}});}}
                else{s.respawnRemaining=Math.Max(0,s.respawnRemaining-dt);if(s.respawnRemaining==0&&!MotionRect.Overlap(Player.Rect,ObjectRect(o))&&(!AI.active||!MotionRect.Overlap(new MotionRect(null,AI.x-12,AI.y-14,24,28),ObjectRect(o)))){s.solid=true;s.standing=0;s.generation++;Emit("ice-create",new JObject{{"id",o.Id}});}}
            }
            if(IsEditorBuild15)MoveBuild15Bricks(dt);
            else foreach(var state in Movables.Values)AdvanceMovable(state,dt);
            if(found&&(!IsEditorBuild15||!Movables.ContainsKey(Player.support))){
                BuildColliders();
                foreach(var collider in colliders)if(collider.id==Player.support){
                    Player.x+=collider.x-prior.x;Player.y+=collider.y-prior.y;break;
                }
            }
        }
        double SurfaceVelocity(MotionPlayer p,int horizontal,double dt){if(p.grounded&&p.support!=null&&objects.TryGetValue(p.support,out var o)&&o.Type=="physics.ice"){double v=p.vx;if(horizontal!=0)v=Clamp(v+horizontal*430*dt,-config["speed"],config["speed"]);else v*=Math.Exp(-o.Number("friction",1.4)*dt);return v;}return Accelerate(p.vx,horizontal,config["speed"]*(p.crouching?.45:1),dt,config["moveAccelerationTime"]);}
        public MotionRect MovableRect(NativeRegion b){if(!Movables.ContainsKey(b.Id))return new MotionRect(b.Id,b.X*32,b.Y*32,32,32);var s=Movables[b.Id];if(objects.TryGetValue((string)b.Raw["padId"]??"",out var o)&&o.Type=="legacy.rotor"){double a=s.angle*Math.PI/180,px=(o.X+.5)*32,py=o.Y*32,dx=(b.X+.5)*32-px,dy=(b.Y+.5)*32-py;return new MotionRect(b.Id,px+dx*Math.Cos(a)-dy*Math.Sin(a)-16,py+dx*Math.Sin(a)+dy*Math.Cos(a)-16,32,32);}if(b.Raw["motionPath"] is JArray path){var pos=NativeBrickPath.Position(b.X,b.Y,path,s.pathTime);return new MotionRect(b.Id,pos.x*32,pos.y*32,32,32);}return new MotionRect(b.Id,(b.X+(((double?)b.Raw["targetX"]??b.X)-b.X)*s.progress)*32,(b.Y+(((double?)b.Raw["targetY"]??b.Y)-b.Y)*s.progress)*32,32,32);}
        void TransformGroup(NativeObject o,string kind){foreach(var b in Room.Movables)if((string)b.Raw["padId"]==o.Id){if(!Movables.ContainsKey(b.Id))continue;var r=MovableRect(b);bool explicitBinding=o.Type=="calculus.integral"||o.Type=="calculus.derivative";if(!explicitBinding&&Hypot(r.x+16-(o.X+.5)*32,r.y+16-o.Y*32)>o.Number("range",12)*32)continue;var s=Movables[b.Id];if(explicitBinding&&b.Raw["motionPath"] is JArray path){double end=NativeBrickPath.Duration(path),to=o.Flag("once")||!(s.anim!=null?s.anim.to>0:s.pathTime>0)?end:0;s.anim=s.pathTime==to?null:new NativeTransformAnimation{kind="path",to=to};continue;}s.anim=new NativeTransformAnimation{kind=kind=="rotor"?"angle":"progress",from=kind=="rotor"?s.angle:s.progress,to=kind=="rotor"?s.angle+o.Number("angle",90):o.Flag("once")?1:s.progress>.5?0:1};}if(kind=="rotor"){Launch(o.Number("launchX"),o.Number("launchY"));LaunchAI(o,o.Number("range",3),o.Number("launchX"),o.Number("launchY"));}Emit("transform",new JObject{{"id",o.Id},{"kind",kind}});}
        public string VisualState(NativeObject o){var s=ObjectStates[o.Id];switch(o.Type){case "calculus.integral":case "calculus.derivative":return s.fired?"active":"idle";case "slacker.checkin":return s.signIns>0?"active":"idle";case "physics.ice":return !s.solid?"melted":s.standing>=o.Number("meltAfter",5)*.6?"cracked":"solid";case "physics.thermal":return TemperatureAt(o);case "common.checkpoint":return Checkpoint.id==o.Id?"active":"idle";case "common.aiStart":return AI.active?"active":"idle";default:return s.waitingAI?"waiting":s.cooldown>0?"active":"idle";}}
        // 有助手方块的房间：未按 E 唤醒助手前，出口不放行（空气墙）
        bool AiGateClosed()
        {
            if (AI != null && AI.active) return false;
            foreach (var o in Room.Objects)
                if (o.Type == "common.aiStart" || o.Type == "common.aiStartHollow") return true;
            return false;
        }
        // 有交付方块且尚未提交时，同样不能进入下一个房间
        bool SubmitGateClosed()
        {
            foreach (var o in Room.Objects)
                if (o.Type == "common.assignmentSubmit")
                {
                    if (!ObjectStates.TryGetValue(o.Id, out var s) || !s.fired) return true;
                }
            return false;
        }
        const double ReturnDoorHoldSeconds=1.5;
        string returnHoldDoor;
        double returnHoldStarted;
        bool ReturnDoorReady(string door)
        {
            if(returnHoldDoor!=door){
                returnHoldDoor=door;
                returnHoldStarted=Elapsed;
            }
            return Elapsed-returnHoldStarted+1e-9>=ReturnDoorHoldSeconds;
        }

        void CheckExits()
        {
            // 门显示、出生点与通行判定共用 ExitRect/EntryRect 的实时矩形；
            // 旧档没有 attachmentTo 时它们等于作者坐标，行为不变。
            if(arrivalReturnExit!=null&&!Room.Exits.Exists(exit=>exit.Id==arrivalReturnExit&&MotionRect.Overlap(Player.Rect,ExitRect(exit))))
                arrivalReturnExit=null;
            if(submitGateContact!=null&&!Room.Exits.Exists(exit=>exit.Id==submitGateContact&&MotionRect.Overlap(Player.Rect,ExitRect(exit))))
                submitGateContact=null;
            if(suppressedExitId!=null)
            {
                var suppressed=Room.Exits.Find(exit=>exit.Id==suppressedExitId);
                if(suppressed==null||!MotionRect.Overlap(Player.Rect,ExitRect(suppressed)))
                {
                    suppressedExitId=null;
                    exitTriggerArmed=true;
                }
            }
            if(returnHoldDoor!=null&&
                !Room.Entries.Exists(entry=>"entry/"+entry.Id==returnHoldDoor&&MotionRect.Overlap(Player.Rect,EntryRect(entry))))
                returnHoldDoor=null;
            if(completionAwarded){Mode="won";return;}
            // 显式连线优先：先走画好的出口，只有都没有触发时才考虑推导出来的回程门。
            foreach(var exit in Room.Exits)if(exit.Id!=arrivalReturnExit&&exit.Id!=suppressedExitId&&exitTriggerArmed&&ExitCooldown==0&&MotionRect.Overlap(Player.Rect,ExitRect(exit)))
            {
                var edge=Course.Connections.Find(c=>c.FromRoomId==Room.Id&&c.ExitId==exit.Id);
                if(SubmitGateClosed()){
                    if((edge!=null||!MainlinePack)&&submitGateContact!=exit.Id){
                        submitGateContact=exit.Id;
                        Emit("submit-gate",new JObject{{"roomId",Room.Id},{"exitId",exit.Id}});
                    }
                    return;
                }
                if(AiGateClosed()){
                    if(Elapsed>=AiGateNoticeUntil){
                        AiGateNoticeUntil=Elapsed+2.5;
                        AiGateNoticeText="先启动论文助手";
                        Emit("ai-gate",new JObject{{"roomId",Room.Id}});
                    }
                    return;
                }
                if((IsNetwork||IsContactAutosave)&&!networkExitPressed)return;
                if(!CampaignCanExit()||!ReworkExitReady(exit))return;
                if(edge==null){if(MainlinePack){Message="这扇门还没接好。";return;}CommitContactExitAnchor("completion");completionAwarded=true;Score+=50000;Mode="won";Emit("finish");Finished?.Invoke();}
                else{string from=Room.Id;if(IsNetwork)TraversedConnections.Add(edge.Id);pendingAiEntrance=AI!=null&&AI.active?CarryEntrance(Room.Id,exit.Id,edge.ToRoomId):null;var link=BuildEntryReturn(Room.Id,exit.Id,edge);LoadGameplayRoom(edge.ToRoomId,edge.EntryId,edge.Velocity=="keep"?Player:null,null,link);CommitContactExitAnchor("room-entry");Emit("room-change",new JObject{{"from",from},{"to",edge.ToRoomId}});}
                return;
            }
            if((!IsNetwork&&!IsContactAutosave||networkExitPressed)&&TryEntryReturn())return;
        }
        // 显式连线优先：目标房间已经画了回来源房间的出口时不再推导，避免同一个门出现两条回程。
        NativeEntryReturn BuildEntryReturn(string fromRoomId,string exitId,NativeConnection edge)
        {
            var destination=Course.Rooms.Find(room=>room.Id==edge.ToRoomId);
            if(destination==null)return null;
            var entry=destination.Entries.Find(item=>item.Id==edge.EntryId);
            if(entry==null||entry.Raw?["allowReturn"]?.Value<bool>()==false)return null;
            if(Course.Connections.Exists(wire=>wire.FromRoomId==destination.Id&&wire.ToRoomId==fromRoomId))return null;
            return new NativeEntryReturn{RoomId=fromRoomId,ExitId=exitId,EntryId=entry.Id};
        }
        // 回程入口必须先离开，再连续站在门内。
        bool TryEntryReturn()
        {
            if(entryReturn==null)return false;
            var entry=Room.Entries.Find(item=>item.Id==entryReturn.EntryId);
            if(entry==null||entry.Raw?["allowReturn"]?.Value<bool>()==false){entryReturn=null;return false;}
            if(!MotionRect.Overlap(Player.Rect,EntryRect(entry))){entryReturnArmed=true;return false;}
            if(!entryReturnArmed)return false;
            if(IsEditorBuild15&&!Player.grounded){returnHoldDoor=null;return false;}
            if(IsEditorBuild15&&!ReturnDoorReady("entry/"+entry.Id))return false;
            var source=Course.Rooms.Find(room=>room.Id==entryReturn.RoomId);
            var sourceExit=source?.Exits.Find(item=>item.Id==entryReturn.ExitId);
            if(source==null||sourceExit==null){entryReturn=null;return false;}
            var sourceRect=CachedRegionRect(source,sourceExit);
            double spawnX=sourceRect.x+Math.Max(2,(sourceRect.w-Player.w)/2), spawnY=sourceRect.y+sourceRect.h-30;
            int face=sourceExit.X<=1?1:sourceExit.X+sourceExit.W>=source.Cols-1?-1:1;
            string from=Room.Id, fromEntry=entry.Id, exitId=sourceExit.Id;
            entryReturn=null;
            LoadGameplayRoom(source.Id,source.Entries.Count>0?source.Entries[0].Id:null,null,new NativeCheckpoint{x=spawnX,y=spawnY,face=face},null,exitId);
            EnsureSafeSpawn(sourceRect);
            CommitContactExitAnchor("room-backtrack");
            Emit("room-backtrack",new JObject{{"from",from},{"to",source.Id},{"entryId",fromEntry},{"exitId",exitId}});
            Emit("room-change",new JObject{{"from",from},{"to",source.Id},{"via","entry"}});
            return true;
        }
        // 回程落点若卡在几何里，就近上移/侧移，仍不安全才退回来源房间入口；不把玩家塞进墙里。
        void EnsureSafeSpawn(MotionRect sourceExit)
        {
            if(SafePosition(Player.x,Player.y))return;
            foreach(var offset in new[]{new NativePoint(0,-30),new NativePoint(0,-32),new NativePoint(24,0),new NativePoint(-24,0),new NativePoint(0,32),new NativePoint(0,64)})
                if(SafePosition(Player.x+offset.x,Player.y+offset.y)){Player.x+=offset.x;Player.y+=offset.y;return;}
            if(sourceExit.w>0){double x=sourceExit.x+Math.Max(2,(sourceExit.w-Player.w)/2),y=sourceExit.y+sourceExit.h-Player.h-2;if(SafePosition(x,y)){Player.x=x;Player.y=y;return;}}
            double entryX=Entry.X*32+4,entryY=Entry.Y*32+4;
            if(!SafePosition(entryX,entryY)){var rect=EntryRect(Entry);entryX+=rect.x-Entry.X*32;entryY+=rect.y-Entry.Y*32;}
            if(SafePosition(entryX,entryY)){Player.x=entryX;Player.y=entryY;}
        }
    }
}
