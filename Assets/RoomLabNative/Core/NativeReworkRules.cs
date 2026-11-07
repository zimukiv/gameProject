using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public sealed class NativePatrolState
    {
        public JObject spec; public double x,y,pause=.8,clock; public int node=1,direction=1;
    }
    public sealed partial class NativeMotion
    {
        public bool IsRework => !IsAuthoredPhysics&&Rules==NativeGameplayRules.DemoPhysics&&(string)Project.OriginalJson["nativeCampaign"]?["id"]=="deadline-rework-v2";
        public double Awareness=50;
        public double? PendingAwareness {get;private set;}
        public string AwarenessBand => Awareness<35?"dream":Awareness<65?"haze":"awake";
        public string AwarenessLabel => AwarenessBand=="dream"?"梦境":AwarenessBand=="haze"?"朦胧":"清醒";
        public readonly Dictionary<string,bool> ReworkSignals=new Dictionary<string,bool>();
        public readonly Dictionary<string,bool> ReworkSwitches=new Dictionary<string,bool>();
        public readonly Dictionary<string,double> ReworkPositions=new Dictionary<string,double>();
        public readonly List<NativePatrolState> Patrols=new List<NativePatrolState>();
        public string ReworkNotice=""; public double ReworkNoticeUntil;
        int awarenessPulses;
        double awarenessWait,shortcutClock,skillClock,skillWait,replanAt; string revisionRoom;
        NativePoint skillTarget;
        public JArray ReworkPlatforms => Room.Raw["nativeCampaign"]?["platforms"] as JArray;
        public bool PatrolActive => IsRework&&AI.active&&Phase=="fast"&&Room.AiPolicy!="off";
        public bool Signal(string name)=>ReworkSignals.TryGetValue(name,out var value)&&value;
        bool Switch(string name)=>ReworkSwitches.TryGetValue(name,out var value)&&value;
        public bool LayerActive(JToken raw)
        {
            if(!IsRework||raw==null)return true;
            var rule=raw["rework"]??raw;
            string band=(string)rule["band"];
            if(!string.IsNullOrEmpty(band)&&band!="all"&&band!=AwarenessBand)return false;
            string signal=(string)rule["visibleSignal"];
            return string.IsNullOrEmpty(signal)||Signal(signal)==((bool?)rule["visibleValue"]??true);
        }
        bool PlatformTarget(JToken p)
        {
            string signal=(string)p["signal"],local=(string)p["switch"];
            return !string.IsNullOrEmpty(signal)?Signal(signal):!string.IsNullOrEmpty(local)&&Switch(local);
        }
        public bool ReworkFolding(JToken p)=>!PlatformTarget(p)&&!string.IsNullOrEmpty((string)p["foldOnReturnAfterSwitch"])&&Switch((string)p["foldOnReturnAfterSwitch"]);
        public double ReworkPlatformVisibility(JToken p)=>ReworkFolding(p)?(ReworkPositions.TryGetValue((string)p["id"],out var v)?v:0):1;
        public MotionRect ReworkPlatformRect(JToken p)
        {
            double t=ReworkPositions.TryGetValue((string)p["id"],out var progress)?progress:0;
            if(ReworkFolding(p))t=1;
            t=t*t*(3-2*t);
            double x=(double)p["x"],y=(double)p["y"];
            return new MotionRect((string)p["id"],(x+(((double?)p["toX"]??x)-x)*t)*32,(y+(((double?)p["toY"]??y)-y)*t)*32,((double?)p["w"]??1)*32,((double?)p["h"]??1)*32);
        }
        void LoadReworkRoom()
        {
            if(!IsRework)return;
            if(ReworkPlatforms!=null)foreach(var p in ReworkPlatforms)if(!ReworkPositions.ContainsKey((string)p["id"]))ReworkPositions[(string)p["id"]]=PlatformTarget(p)?1:0;
            Patrols.Clear();if(Room.Raw["nativeCampaign"]?["patrols"] is JArray patrols)foreach(JObject p in patrols){var n=p["nodes"][0];Patrols.Add(new NativePatrolState{spec=p,x=(double)n["x"]*32,y=(double)n["y"]*32});}
            shortcutClock=skillClock=replanAt=0;skillWait=4;revisionRoom=Room.Id;CampaignSkill="";
        }
        void CopyReworkTo(NativeRoomState state)
        {
            if(!IsRework)return;state.awareness=Awareness;state.pendingAwareness=PendingAwareness;state.awarenessWait=awarenessWait;state.awarenessPulses=awarenessPulses;state.switches=new Dictionary<string,bool>(ReworkSwitches);state.platforms=new Dictionary<string,double>(ReworkPositions);
        }
        void RestoreRework(NativeRoomState state)
        {
            if(!IsRework)return;Awareness=state.awareness;ReworkSwitches.Clear();foreach(var v in state.switches)ReworkSwitches.Add(v.Key,v.Value);ReworkPositions.Clear();foreach(var v in state.platforms)ReworkPositions.Add(v.Key,v.Value);PendingAwareness=state.pendingAwareness;awarenessWait=state.awarenessWait;awarenessPulses=state.awarenessPulses;
        }
        void NoticeRework(string text){ReworkNotice=text;ReworkNoticeUntil=Elapsed+6;Message=text;}
        public void RequestAwareness(double value)
        {
            if(!IsRework)return;value=Clamp(value,0,100);PendingAwareness=value;awarenessWait=.7;
            NoticeRework("眼前的轮廓变了");Emit("awake");
        }
        bool ReworkFire(NativeObject o,MotionObjectState s)
        {
            if(!IsRework||!(o.Raw["rework"] is JObject meta))return false;
            if(meta["clarityDelta"]!=null){s.boosts++;RequestAwareness((PendingAwareness??Awareness)+(double)meta["clarityDelta"]);Emit("resource-used",new JObject{{"id",o.Id},{"delta",(double)meta["clarityDelta"]}});return true;}
            if(meta["clarityTarget"]!=null){s.boosts++;RequestAwareness((double)meta["clarityTarget"]);return true;}
            string local=(string)meta["switch"],signal=(string)meta["signal"];
            if(local!=null)ReworkSwitches[local]=(bool?)meta["value"]??true;
            if(signal!=null)ReworkSignals[signal]=(bool?)meta["value"]??true;
            if(local!=null||signal!=null){s.fired=true;NoticeRework((string)meta["message"]??"场景结构已改变");Emit("calculus-"+(o.Type=="calculus.derivative"?"derivative":"integral"));return o.Type=="calculus.integral"||o.Type=="calculus.derivative";}
            return false;
        }
        void TickReworkGeometry(double dt)
        {
            if(!IsRework)return;
            if(PendingAwareness.HasValue){awarenessWait=Math.Max(0,awarenessWait-dt);if(awarenessWait<=0){double old=Awareness;Awareness=PendingAwareness.Value;bool blocked=false;
                BuildColliders();foreach(var solid in colliders)if(MotionRect.Overlap(Player.Rect,solid)||(AI.active&&MotionRect.Overlap(new MotionRect(null,AI.x-10,AI.y-10,20,20),solid))){blocked=true;break;}
                if(blocked){Awareness=old;NoticeRework("轮廓还在等候");}else{PendingAwareness=null;NoticeRework("");}
            }}
            if(ReworkPlatforms!=null)foreach(var p in ReworkPlatforms)
            {
                string id=(string)p["id"];double value=ReworkPositions.TryGetValue(id,out var n)?n:0,target=PlatformTarget(p)?1:0;
                double step=dt/((double?)p["seconds"]??.9);var before=ReworkPlatformRect(p);
                ReworkPositions[id]=value<target?Math.Min(target,value+step):Math.Max(target,value-step);var after=ReworkPlatformRect(p);
                if(LayerActive(p))
                {
                    bool blocked=false;
                    if(Player.grounded&&Player.support==id)
                    {
                        // A folding stair must not turn a fresh landing into a ride to its
                        // storage position. Keep its support until the rider steps/jumps off.
                        // Deployed lifts and their downward return still carry normally.
                        blocked=ReworkFolding(p)||target==0&&after.y<before.y;
                        if(!blocked)
                        {
                            var carried=new MotionRect(null,Player.x+after.x-before.x,Player.y+after.y-before.y,Player.w,Player.h);
                            foreach(var c in colliders)if(c.id!=id&&MotionRect.Overlap(carried,c)){blocked=true;break;}
                        }
                    }
                    else if(MotionRect.Overlap(Player.Rect,after)&&!MotionRect.Overlap(Player.Rect,before))blocked=true;
                    if(blocked)ReworkPositions[id]=value;
                }
            }
        }
        void AddReworkColliders()
        {
            if(!IsRework||ReworkPlatforms==null)return;
            foreach(var p in ReworkPlatforms)if(LayerActive(p)&&ReworkPlatformVisibility(p)>0){var r=ReworkPlatformRect(p);r.index=colliders.Count;colliders.Add(r);}
        }
        public string BlockedExit {get;private set;} public double BlockedExitUntil {get;private set;}
        public bool ReworkExitOpen(NativeRegion exit)
        {
            if(!IsRework)return true;
            var m=exit.Raw["rework"];string signal=(string)m?["signal"],local=(string)m?["switch"],band=(string)m?["band"];
            bool expected=(bool?)m?["value"]??true;
            bool ready=(signal==null||Signal(signal)==expected)&&(local==null||Switch(local)==expected)&&(band==null||band=="all"||band==AwarenessBand);if(m?["allSwitches"] is JArray required)foreach(var key in required)ready&=Switch((string)key);
            if(m?["states"] is JObject states)foreach(var state in states.Properties())ready&=Switch(state.Name)==(bool)state.Value;
            if(m?["signals"] is JObject signals)foreach(var state in signals.Properties())ready&=Signal(state.Name)==(bool)state.Value;
            return ready;
        }
        public bool ReworkExitReady(NativeRegion exit){bool ready=ReworkExitOpen(exit);if(!ready){BlockedExit=exit.Id;BlockedExitUntil=Elapsed+2;NoticeRework((string)exit.Raw["rework"]?["lockedText"]??"门上的记号还没有接通");}return ready;}
        bool SegmentClear(NativePoint from,NativePoint to,double radius=8)
        {
            int count=Math.Max(1,(int)(Hypot(to.x-from.x,to.y-from.y)/8));
            for(int i=1;i<=count;i++){double t=(double)i/count;var r=new MotionRect(null,from.x+(to.x-from.x)*t-radius,from.y+(to.y-from.y)*t-radius,radius*2,radius*2);foreach(var c in colliders)if(MotionRect.Overlap(r,c))return false;}return true;
        }
        void PrepareReworkTracking(double dt)
        {
            if(!IsRework||!AI.active||AI.flight||AI.warning!=null)return;
            shortcutClock-=dt;if(shortcutClock>0)return;shortcutClock=.25;
            var here=new NativePoint(AI.x,AI.y);var pc=PlayerCenter;
            // Shortcut only along visible same-height space. Corners and lifts retain recorded trail.
            if(Math.Abs(pc.y-AI.y)<40&&Hypot(pc.x-AI.x,pc.y-AI.y)<320&&SegmentClear(here,pc)){AI.trail.Clear();AI.trail.Add(pc);}
        }
        bool ReworkMoveBlocked(NativePoint next)
        {
            if(!IsRework||SegmentClear(new NativePoint(AI.x,AI.y),next,9))return false;
            if(RoomTime<replanAt)return true;replanAt=RoomTime+.6;
            // If geometry changed across the recorded trail, search free space; never cut through a wall.
            const int size=8;const int half=4;int w=Room.Cols*4,h=Room.Rows*4;var blocked=new bool[w*h];
            foreach(var c in colliders){int x0=Math.Max(0,(int)Math.Floor((c.x-9-half)/size)),x1=Math.Min(w-1,(int)Math.Ceiling((c.x+c.w+9-half)/size));int y0=Math.Max(0,(int)Math.Floor((c.y-9-half)/size)),y1=Math.Min(h-1,(int)Math.Ceiling((c.y+c.h+9-half)/size));for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++)if(MotionRect.Overlap(new MotionRect(null,x*size+half-9,y*size+half-9,18,18),c))blocked[y*w+x]=true;}
            int Cell(double x,double y)=>Math.Max(0,Math.Min(h-1,(int)(y/size)))*w+Math.Max(0,Math.Min(w-1,(int)(x/size)));
            int Near(int cell,NativePoint origin){bool Reach(int n)=>!blocked[n]&&SegmentClear(origin,new NativePoint((n%w)*size+half,(n/w)*size+half),9);if(Reach(cell))return cell;int cx=cell%w,cy=cell/w;for(int d=1;d<=4;d++)for(int y=Math.Max(0,cy-d);y<=Math.Min(h-1,cy+d);y++)for(int x=Math.Max(0,cx-d);x<=Math.Min(w-1,cx+d);x++)if(Reach(y*w+x))return y*w+x;return -1;}
            int start=Near(Cell(AI.x,AI.y),new NativePoint(AI.x,AI.y)),goal=Near(Cell(PlayerCenter.x,PlayerCenter.y),PlayerCenter);if(start<0||goal<0)return true;
            var from=new int[w*h];for(int i=0;i<from.Length;i++)from[i]=-2;var queue=new Queue<int>();queue.Enqueue(start);from[start]=-1;
            while(queue.Count>0&&from[goal]==-2){int at=queue.Dequeue(),x=at%w,y=at/w;foreach(int n in new[]{x>0?at-1:-1,x<w-1?at+1:-1,y>0?at-w:-1,y<h-1?at+w:-1})if(n>=0&&!blocked[n]&&from[n]==-2){from[n]=at;queue.Enqueue(n);}}
            if(from[goal]==-2)return true;var path=new List<NativePoint>();for(int at=goal;at>=0;at=from[at])path.Add(new NativePoint((at%w)*size+half,(at/w)*size+half));path.Reverse();
            if(path.Count>0&&SegmentClear(new NativePoint(AI.x,AI.y),path[0],9)){AI.trail.Clear();AI.trail.AddRange(path);AI.trail.Add(PlayerCenter);Emit("ai-search");}return true;
        }
        void TickReworkSkill(double dt)
        {
            if(!IsRework)return;
            if(revisionRoom!=Room.Id||RoomTime<skillClock){LoadReworkRoom();}skillClock=RoomTime;
            AI.speed=230+AI.tier*6;if(!AI.active)return;
            double distance=Hypot(AI.x-PlayerCenter.x,AI.y-PlayerCenter.y);skillWait-=dt;
            if(CampaignSkill=="charge"){
                AI.speed=65;if(skillWait<=0){
                    if(Course.Kind=="physics"){CampaignSkill="burst";skillWait=.7;Emit("ai-burst");}
                    else if(Course.Kind=="calculus"){
                        if(SegmentClear(new NativePoint(AI.x,AI.y),skillTarget)&&Hypot(skillTarget.x-PlayerCenter.x,skillTarget.y-PlayerCenter.y)>70){AI.x=skillTarget.x;AI.y=skillTarget.y;AI.trail.Clear();AI.trail.Add(PlayerCenter);Emit("ai-teleport");}
                        CampaignSkill="recover";skillWait=1.5;AiProcessing=Math.Max(AiProcessing,.4);
                    }else{if(!IsAwarenessResource||awarenessPulses<((int?)Room.Raw["nativeCampaign"]?["pulseBudget"]??1)){if(IsAwarenessResource)awarenessPulses++;RequestAwareness((PendingAwareness??Awareness)-20);}CampaignSkill="recover";skillWait=1.5;Emit("ai-recover");}
                }
            }else if(CampaignSkill=="burst"){AI.speed=430;if(skillWait<=0){CampaignSkill="recover";skillWait=1.6;Emit("ai-recover");}}
            else if(CampaignSkill=="recover"){AI.speed=85;if(skillWait<=0){CampaignSkill="";skillWait=6;}}
            else if(skillWait<=0&&(!IsAwarenessResource||awarenessPulses<((int?)Room.Raw["nativeCampaign"]?["pulseBudget"]??1))&&distance>70&&distance<430&&AiProcessing<=0){CampaignSkill="charge";skillWait=1;skillTarget=new NativePoint(PlayerCenter.x,PlayerCenter.y);NoticeRework(Course.Kind=="physics"?"过载倒计时 · 冲刺或借机关拉开距离":Course.Kind=="calculus"?"坐标标记 · 离开紫色落点":"困意脉冲 · 清醒度将降低20，先回常驻平台");Emit("ai-charge");}
        }
        public NativePoint ReworkSkillTarget=>skillTarget;
        void TickPatrols(double dt)
        {
            if(!PatrolActive)return;
            foreach(var p in Patrols){p.clock+=dt;if(p.pause>0){p.pause=Math.Max(0,p.pause-dt);continue;}
                var nodes=(JArray)p.spec["nodes"];var target=nodes[p.node];double dx=(double)target["x"]*32-p.x,dy=(double)target["y"]*32-p.y,n=Hypot(dx,dy),step=((double?)p.spec["speed"]??100)*dt;
                var next=new NativePoint(p.x+dx/Math.Max(n,.001)*Math.Min(step,n),p.y+dy/Math.Max(n,.001)*Math.Min(step,n));
                if(SegmentClear(new NativePoint(p.x,p.y),next,10)){p.x=next.x;p.y=next.y;}else{p.direction=-p.direction;p.node=Math.Max(0,Math.Min(nodes.Count-1,p.node+p.direction));p.pause=.5;}
                if(n<=step){if(p.node==0||p.node==nodes.Count-1)p.direction=-p.direction;p.node=Math.Max(0,Math.Min(nodes.Count-1,p.node+p.direction));p.pause=.55;}
                if(p.clock>1&&Hypot(p.x-PlayerCenter.x,p.y-PlayerCenter.y)<25){var prior=Player;CatchPlayer();if(Player!=prior)return;}
            }
        }
    }
}
