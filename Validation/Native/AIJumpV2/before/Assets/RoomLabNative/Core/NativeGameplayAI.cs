using System;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed partial class NativeMotion
    {
        void ActivateAI(NativeObject o)
        {
            if(CourseAIActive&&AI.active)return;bool resumed=CourseAIActive;int investment=resumed?0:Tokens,tier=resumed?CourseAITier:investment>=20?2:investment>=10?1:0;
            if(!resumed){Tokens=0;CourseAIActive=true;CourseAITier=tier;CourseAIId=IdOr(o.AiId,IdOr(Room.AiId,Course.AiId));Phase="fast";}
            var pc=PlayerCenter;AI.id=CourseAIId;AI.active=true;AI.tier=tier;AI.speed=265+tier*30;AI.steal=1+tier*2;AI.x=pc.x-165;AI.y=pc.y;AiProcessing=.8;AI.trail.Clear();AI.trail.Add(pc);Emit("ai-start",new JObject{{"investment",investment},{"tier",tier},{"resumed",resumed}});
        }
        void LaunchAI(NativeObject o,double range,double x,double y){if(AI.active&&Hypot(AI.x-(o.X+.5)*32,AI.y-o.Y*32)<=range*32){AI.flight=true;AI.vx=x;AI.vy=y;AI.warning=null;AI.trail.Clear();AiProcessing=.3;ObjectStates[o.Id].hitAI=true;ObjectStates[o.Id].hasHitAI=true;}}
        public void CatchPlayer(){if(LockHealth||DeveloperFlight||AiProcessing>0||AiCooldown>0||Player.invulnerable>0)return;
            if(Rules==NativeGameplayRules.DemoPhysics){AiHits++;int taken=Tokens/2;Tokens-=taken;Steals++;Emit("steal",new JObject{{"amount",taken},{"hits",AiHits}});if(AiHits>=2){AiHits=0;Retry("第二次被 AI 抓到");return;}AiProcessing=.8;AiCooldown=1.4;Player.invulnerable=1.3;return;}
            if(Tokens==0){Retry("没有 token，被 AI 抓到");return;}int amount=Math.Min(Tokens,AI.steal);Tokens-=amount;Steals++;AiProcessing=.8;AiCooldown=1.4;Player.invulnerable=1.3;Emit("steal",new JObject{{"amount",amount}});}
        // Design intent: collectibles belong to the AI, so leading it to a reachable spot is what pays.
        void CollectForAI(){if(Rules!=NativeGameplayRules.DemoPhysics)return;var r=new MotionRect(null,AI.x-12,AI.y-14,24,28);foreach(var o in Room.Objects){if(o.Type!="common.collectible")continue;if(!MotionRect.Overlap(r,ObjectRect(o)))continue;if(!Credited.Add(creditKeys[o.Id]))continue;Score+=10000;Emit("collect",new JObject{{"id",o.Id},{"by","ai"}});}}
        void UpdateAI(double dt)
        {
            AiProcessing=Math.Max(0,AiProcessing-dt);AiCooldown=Math.Max(0,AiCooldown-dt);var a=AI;if(!a.active)return;var pc=PlayerCenter;
            if(a.flight){double old=a.y+14;a.vy=Math.Min(config["maxFall"],a.vy+config["gravity"]*dt);a.x+=a.vx*dt;a.y+=a.vy*dt;foreach(var b in colliders)if(a.vy>=0&&old<=b.y+.1&&MotionRect.Overlap(new MotionRect(null,a.x-12,a.y-14,24,28),b)){a.y=b.y-14;a.flight=false;a.trail.Clear();a.trail.Add(pc);break;}if(a.y>Room.Rows*32+80){a.flight=false;a.x=pc.x-140;a.y=pc.y;a.trail.Clear();a.trail.Add(pc);AiProcessing=.5;}}
            else{if(a.trail.Count==0||Hypot(a.trail[a.trail.Count-1].x-pc.x,a.trail[a.trail.Count-1].y-pc.y)>4)a.trail.Add(pc);
                foreach(var entry in Room.Objects)if(entry.Type=="common.portalIn"){NativeObject exit=null;foreach(var o in Room.Objects)if(o.Type=="common.portalOut"&&o.Text("routeId")==entry.Text("routeId")){exit=o;break;}if(exit!=null&&!a.teleported.Contains(entry.Text("routeId"))&&a.warning==null&&AiProcessing<=0&&Hypot(a.x-(entry.X+.5)*32,a.y-(entry.Y+.5)*32)<48){a.warning=new NativeAIWarning{remaining=.65,to=new NativePoint((exit.X+.5)*32,(exit.Y+.5)*32),id=entry.Text("routeId")};a.teleported.Add(entry.Text("routeId"));}}
                if(a.warning!=null){a.warning.remaining=Math.Max(0,a.warning.remaining-dt);if(a.warning.remaining==0){a.x=a.warning.to.x;a.y=a.warning.to.y;a.warning=null;AiProcessing=.25;a.trail.Clear();a.trail.Add(pc);Emit("ai-teleport");}}
                else if(AiProcessing<=0){double distance=a.speed*dt;while(distance>0&&a.trail.Count>0){var t=a.trail[0];double dx=t.x-a.x,dy=t.y-a.y,n=Hypot(dx,dy);if(n<=distance){a.x=t.x;a.y=t.y;distance-=n;a.trail.RemoveAt(0);}else{a.x+=dx/n*distance;a.y+=dy/n*distance;distance=0;}}}
            }
            CollectForAI();if(Hypot(a.x-pc.x,a.y-pc.y)<30)CatchPlayer();if(a.trail.Count>1400)a.trail.RemoveRange(0,a.trail.Count-1400);
        }
        public void SetDeveloperOptions(bool enabled,bool lockHealth,bool flight){bool previous=DeveloperFlight;DeveloperEnabled=enabled;LockHealth=enabled&&lockHealth;DeveloperFlight=enabled&&flight;if(DeveloperFlight&&!previous)BeginFlight();else if(previous&&!DeveloperFlight)EndFlight();}
        void ClearFlightMotion(){var p=Player;p.vx=p.vy=p.dash=p.dashX=p.dashY=p.launchX=p.coyote=p.buffer=0;p.rail=null;p.launched=p.grounded=false;p.support=null;}
        void BeginFlight(){flightReturn=new NativePoint(Player.x,Player.y);if(Player.crouching){Player.y-=10;Player.h=28;Player.crouching=false;}ClearFlightMotion();}
        void EndFlight(){var p=Player;if(!SafePosition(p.x,p.y)){var anchor=flightReturn??new NativePoint(Checkpoint?.x??Entry.X*32+4,Checkpoint?.y??Entry.Y*32+4);double x=anchor.x,y=anchor.y;if(!SafePosition(x,y)){x=Checkpoint?.x??Entry.X*32+4;y=Checkpoint?.y??Entry.Y*32+4;}if(!SafePosition(x,y)){double best=double.MaxValue;for(int cy=0;cy<Room.Rows;cy++)for(int cx=0;cx<Room.Cols;cx++){double tx=cx*32+4,ty=cy*32+4,d=Hypot(tx-anchor.x,ty-anchor.y);if(d<best&&SafePosition(tx,ty)){best=d;x=tx;y=ty;}}}p.x=x;p.y=y;}p.h=28;p.crouching=false;ClearFlightMotion();flightReturn=null;}
        void TickFlight(double dt,MotionInput input){int x=(input.right?1:0)-(input.left?1:0),y=(input.down?1:0)-(input.up?1:0);double n=Hypot(x,y);if(n==0)n=1;var p=Player;p.vx=x/n*config["speed"]*2;p.vy=y/n*config["speed"]*2;p.x=Clamp(p.x+p.vx*dt,0,Room.Cols*32-p.w);p.y=Clamp(p.y+p.vy*dt,0,Room.Rows*32-p.h);p.invulnerable=Math.Max(0,p.invulnerable-dt);if(x!=0)p.face=x;UpdateAI(dt);}
        public JObject Snapshot()
        {
            var player=JObject.FromObject(Player);player.Remove("Rect");if(Player.rail!=null){var points=new JArray();foreach(var p in Player.rail.points)points.Add(new JObject{{"x",p.x},{"y",p.y}});player["rail"]["points"]=points;}
            var ai=JObject.FromObject(AI);ai.Remove("trail");ai["processing"]=AiProcessing;ai["cooldown"]=AiCooldown;ai["trailLength"]=AI.trail.Count;var os=new JObject();foreach(var o in Room.Objects){var s=ObjectStates[o.Id];var state=new JObject{{"used",s.used},{"cooldown",s.cooldown},{"firedDuringContact",s.firedDuringContact}};if(s.hasWaitingAI)state["waitingAI"]=s.waitingAI;if(s.hasHitAI)state["hitAI"]=s.hitAI;if(o.Type=="physics.ice"){state["solid"]=s.solid;state["standing"]=s.standing;state["respawnRemaining"]=s.respawnRemaining;state["generation"]=s.generation;}if(o.Type=="physics.thermal")state["lastTemperature"]=s.lastTemperature;os[o.Id]=state;}
            var snapshot=new JObject{{"mode",Mode},{"courseId",Course.Id},{"roomId",Room.Id},{"entryId",Entry.Id},{"cols",Room.Cols},{"rows",Room.Rows},{"tokens",Tokens},{"charges",Charges},{"recharge",Recharge},{"score",Score},{"deaths",Deaths},{"steals",Steals},{"elapsed",Elapsed},{"roomTime",RoomTime},{"respawnRemaining",RespawnRemaining},{"checkpointId",Checkpoint.id},{"developer",new JObject{{"enabled",DeveloperEnabled},{"lockHealth",LockHealth},{"flight",DeveloperFlight}}},{"player",player},{"ai",ai},{"courseState",new JObject{{"aiActive",CourseAIActive},{"aiTier",CourseAITier},{"aiId",CourseAIId},{"phase",Phase},{"life",Life}}},{"objects",os},{"zones",JObject.FromObject(Zones)},{"events",JArray.FromObject(Events)}};return JObject.Parse(snapshot.ToString());
        }
    }
}
