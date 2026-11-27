using System;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed partial class NativeMotion
    {
        const double AssistantStartupSeconds=2.5;
        double assistantStartupUntil;
        public bool AssistantStarting=>AI?.active==true&&Elapsed+1e-9<assistantStartupUntil;

        void ActivateAI(NativeObject o)
        {
            if(CourseAIActive&&AI.active)return;bool resumed=CourseAIActive;int investment=resumed?0:Tokens,tier=resumed?CourseAITier:investment>=20?2:investment>=10?1:0;
            if(!resumed){Tokens=0;CourseAIActive=true;CourseAITier=tier;CourseAIId=IdOr(o.AiId,IdOr(Room.AiId,Course.AiId));Phase="fast";}
            var pc=PlayerCenter;AI.id=CourseAIId;AI.active=true;AI.tier=tier;AI.speed=IsEditorBuild15?AiSpeed(tier):265+tier*30;AI.steal=1+tier*2;AI.x=pc.x-165;AI.y=pc.y;AiProcessing=.8;AI.trail.Clear();AI.trail.Add(pc);
            if(IsEditorBuild15){
                var terminal=ObjectRect(o);
                AI.x=terminal.x+terminal.w*.5;AI.y=terminal.y+terminal.h*.5;
                AiSpawnDelay=0;AiCooldown=0;AI.flight=false;AI.warning=null;
                AI.vx=AI.vy=0;
                assistantStartupUntil=Elapsed+AssistantStartupSeconds;
            }
            Emit("ai-start",new JObject{{"investment",investment},{"tier",tier},{"resumed",resumed}});
        }
        void LaunchAI(NativeObject o,double range,double x,double y)
        {
            if(!AI.active||AssistantStarting)return;
            // Demo 规则：AI 不做独立弹道，改为沿"玩家被弹起的轨迹"追（既有设计，保持不变）。
            if(Rules==NativeGameplayRules.DemoPhysics)
            {
                if(Hypot(AI.x-(o.X+.5)*32,AI.y-o.Y*32)>range*32)return;
                ObjectStates[o.Id].hitAI=true;ObjectStates[o.Id].hasHitAI=true;
                RememberAIPlayerTrail(PlayerCenter);
                return;
            }
            // 其它档位（Editor255Compat / LatestPhysics）保持既定行为：range 半径内弹道发射。
            if(Rules!=NativeGameplayRules.EditorBuild15)
            {
                if(Hypot(AI.x-(o.X+.5)*32,AI.y-o.Y*32)>range*32)return;
                ObjectStates[o.Id].hitAI=true;ObjectStates[o.Id].hasHitAI=true;
                AI.flight=true;AI.vx=x;AI.vy=y;AI.warning=null;AI.trail.Clear();AiProcessing=.3;
                return;
            }
            // 主线（EditorBuild15）：只有真的站在喷气口上方才会被弹（收紧到"踩到才弹"，
            // 不再用 range 半径——否则紧跟在你身后的 AI 会跟着你一起被弹飞）。
            double centerX=(o.X+o.W/2.0)*32,top=o.Y*32;
            if(Math.Abs(AI.x-centerX)>((o.W/2.0)+0.6)*32||Math.Abs((AI.y+14)-top)>0.9*32)return;
            ObjectStates[o.Id].hitAI=true;ObjectStates[o.Id].hasHitAI=true;
            AI.flight=true;AI.vx=x;AI.vy=y;AI.warning=null;AI.trail.Clear();AiProcessing=.3;
        }
        void RememberAIPlayerTrail(NativePoint point)
        {
            var trail=AI.trail;if(trail.Count==0||Hypot(trail[trail.Count-1].x-point.x,trail[trail.Count-1].y-point.y)>4)trail.Add(point);
            if(trail.Count>1400)trail.RemoveRange(0,trail.Count-1400);
        }
        void ResumeAIPlayerTrail(NativePoint point)
        {
            RememberAIPlayerTrail(point);var trail=AI.trail;int nearest=0;double best=double.MaxValue;
            for(int i=0;i<trail.Count;i++){double distance=Hypot(trail[i].x-AI.x,trail[i].y-AI.y);if(distance<=best){best=distance;nearest=i;}}
            // Keep the chronological suffix, including its corners, rather than taking a
            // straight shortcut to the player's latest position after ballistic flight.
            if(nearest>0)trail.RemoveRange(0,nearest);
        }
        void ResetAITrackingAtPlayer()
        {
            var pc=PlayerCenter;double x=pc.x-165;
            // Processing delays catches, not collection. Avoid placing the AI directly
            // on an unclaimed collectible while resetting a developer safety return.
            for(int pass=0;pass<=Room.Objects.Count;pass++){bool overlap=false;foreach(var o in Room.Objects){if(o.Type!="common.collectible"||Credited.Contains(creditKeys[o.Id]))continue;var r=ObjectRect(o);if(MotionRect.Overlap(new MotionRect(null,x-12,pc.y-14,24,28),r)){x=Math.Min(x,r.x-13);overlap=true;}}if(!overlap)break;}
            // Portal warning eagerly reserves its route before arrival. Cancelling that
            // unfinished warning must release only its reservation, not completed routes.
            if(AI.warning!=null)AI.teleported.Remove(AI.warning.id);
            AI.x=x;AI.y=pc.y;AI.flight=false;AI.vx=AI.vy=0;AI.warning=null;AI.trail.Clear();AI.trail.Add(pc);AiProcessing=.8;AiCooldown=0;
            // Identity, tier, active/course state and genuinely completed routes stay intact.
        }
        public void CatchPlayer(){if(LockHealth||DeveloperFlight||AssistantStarting||AiProcessing>0||AiCooldown>0||Player.invulnerable>0)return;
            if(Rules==NativeGameplayRules.DemoPhysics){AiHits++;int taken=Tokens/2;Tokens-=taken;Steals++;Emit("steal",new JObject{{"amount",taken},{"hits",AiHits}});if(AiHits>=2){AiHits=0;Retry("第二次被 AI 抓到");return;}AiProcessing=.8;AiCooldown=1.4;Player.invulnerable=1.3;return;}
            if(IsEditorBuild15)Emit("assistant-impact");
            if(Tokens==0){Retry("没有 token，被 AI 抓到");return;}int amount=Math.Min(Tokens,AI.steal);Tokens-=amount;Steals++;AiProcessing=.8;AiCooldown=1.4;Player.invulnerable=1.3;Emit("steal",new JObject{{"amount",amount}});}
        // Design intent: collectibles belong to the AI, so leading it to a reachable spot is what pays.
        // Standing near the player exit that is bound to an AI exit sends the active AI to that
        // exit instead of straight at the player; leaving the range simply drops the override.
        bool AiRedirectPoint(out double x,out double y)
        {
            x = y = 0;
            var pc = PlayerCenter;
            foreach (var exit in Room.Exits)
            {
                if (!Room.AiExitBindings.TryGetValue(exit.Id,out var aiExit) || string.IsNullOrEmpty(aiExit)) continue;
                double ex = (exit.X + exit.W / 2.0) * 32, ey = (exit.Y + exit.H / 2.0) * 32;
                if (Math.Abs(pc.x - ex) > 96 || Math.Abs(pc.y - ey) > 96) continue;
                foreach (var o in Room.Objects)
                    if (o.Id == aiExit) { x = (o.X + o.W / 2.0) * 32; y = (o.Y + o.H / 2.0) * 32; return true; }
            }
            return false;
        }
        void CollectForAI(){if(Rules!=NativeGameplayRules.DemoPhysics&&Rules!=NativeGameplayRules.EditorBuild15)return;var r=new MotionRect(null,AI.x-12,AI.y-14,24,28);foreach(var o in Room.Objects){if(o.Type!="common.collectible"||!LayerActive(o.Raw))continue;if(!MotionRect.Overlap(r,ObjectRect(o)))continue;if(!Credited.Add(creditKeys[o.Id]))continue;Score+=10000;Emit("collect",new JObject{{"id",o.Id},{"by","ai"}});}}
        double AssistantCatchUpMultiplier(NativePoint player)
        {
            const double sprintThreshold=32*32;
            const double limit=48*32;
            double length=0,x=AI.x,y=AI.y;
            foreach(var point in AI.trail){
                length+=Hypot(point.x-x,point.y-y);
                if(length>=limit)break;
                x=point.x;y=point.y;
            }
            if(length<limit)length+=Hypot(player.x-x,player.y-y);
            double normal=Math.Min(.35,Math.Max(0,length-96)*.001)/(1+Tokens/24.0);
            double sprint=Clamp((length-sprintThreshold)/(limit-sprintThreshold),0,1);
            return 1+normal+1.5*sprint;
        }

        void UpdateAI(double dt)
        {
            TickCampaignSkill(dt);PrepareReworkTracking(dt);AiProcessing=Math.Max(0,AiProcessing-dt);AiCooldown=Math.Max(0,AiCooldown-dt);var a=AI;if(!a.active)return;if(AssistantStarting){RememberAIPlayerTrail(PlayerCenter);return;}if(AiSpawnDelay>0){AiSpawnDelay=Math.Max(0,AiSpawnDelay-dt);if(AiSpawnDelay==0){a.warning=null;a.trail.Clear();}return;}var pc=PlayerCenter;
            if(a.flight){if(Rules==NativeGameplayRules.DemoPhysics||IsEditorBuild15)RememberAIPlayerTrail(pc);double old=a.y+14;a.vy=Math.Min(config["maxFall"],a.vy+config["gravity"]*dt);a.x+=a.vx*dt;a.y+=a.vy*dt;foreach(var b in colliders)if(a.vy>=0&&old<=b.y+.1&&MotionRect.Overlap(new MotionRect(null,a.x-12,a.y-14,24,28),b)){a.y=b.y-14;a.flight=false;if(Rules==NativeGameplayRules.DemoPhysics)ResumeAIPlayerTrail(pc);else if(!IsEditorBuild15){a.trail.Clear();a.trail.Add(pc);}break;}if(a.y>Room.Rows*32+80){a.flight=false;a.x=pc.x-140;a.y=pc.y;a.trail.Clear();a.trail.Add(pc);AiProcessing=.5;}}
            else{if(a.trail.Count==0||Hypot(a.trail[a.trail.Count-1].x-pc.x,a.trail[a.trail.Count-1].y-pc.y)>4)a.trail.Add(pc);
                if(!IsEditorBuild15&&AiProcessing<=0&&AiRedirectPoint(out var rx,out var ry)){a.trail.Clear();a.trail.Add(new NativePoint(rx,ry));}
                if(Rules!=NativeGameplayRules.EditorBuild15)foreach(var entry in Room.Objects)if(entry.Type=="common.portalIn"&&LayerActive(entry.Raw)){NativeObject exit=null;foreach(var o in Room.Objects)if(o.Type=="common.portalOut"&&LayerActive(o.Raw)&&o.Text("routeId")==entry.Text("routeId")){exit=o;break;}if(exit!=null&&!a.teleported.Contains(entry.Text("routeId"))&&a.warning==null&&AiProcessing<=0&&Hypot(a.x-(entry.X+.5)*32,a.y-(entry.Y+.5)*32)<48){a.warning=new NativeAIWarning{remaining=.65,to=new NativePoint((exit.X+.5)*32,(exit.Y+.5)*32),id=entry.Text("routeId")};a.teleported.Add(entry.Text("routeId"));}}
                if(a.warning!=null){a.warning.remaining=Math.Max(0,a.warning.remaining-dt);if(a.warning.remaining==0){a.x=a.warning.to.x;a.y=a.warning.to.y;a.warning=null;AiProcessing=.25;a.trail.Clear();a.trail.Add(pc);Emit("ai-teleport");}}
                else if(AiProcessing<=0){double distance=a.speed*(IsEditorBuild15?AssistantCatchUpMultiplier(pc):1)*dt;while(distance>0&&a.trail.Count>0){var t=a.trail[0];double dx=t.x-a.x,dy=t.y-a.y,n=Hypot(dx,dy);var next=new NativePoint(a.x+dx/Math.Max(n,.001)*Math.Min(n,distance),a.y+dy/Math.Max(n,.001)*Math.Min(n,distance));if(ReworkMoveBlocked(next)){distance=0;break;}if(n<=distance){a.x=t.x;a.y=t.y;distance-=n;a.trail.RemoveAt(0);}else{a.x=next.x;a.y=next.y;distance=0;}}}
            }
            CollectForAI();if(IsEditorBuild15?MotionRect.Overlap(Player.Rect,new MotionRect(null,a.x-10,a.y-11,20,22)):Hypot(a.x-pc.x,a.y-pc.y)<30)CatchPlayer();if(a.trail.Count>1400)a.trail.RemoveRange(0,a.trail.Count-1400);
        }
        public void SetDeveloperOptions(bool enabled,bool lockHealth,bool flight){bool previous=DeveloperFlight;DeveloperEnabled=enabled;LockHealth=enabled&&lockHealth;DeveloperFlight=enabled&&flight;if(DeveloperFlight&&!previous)BeginFlight();else if(previous&&!DeveloperFlight)EndFlight();}
        void ClearFlightMotion(){var p=Player;p.vx=p.vy=p.dash=p.dashX=p.dashY=p.launchX=p.coyote=p.buffer=0;p.rail=null;p.launched=p.grounded=false;p.support=null;}
        void BeginFlight(){flightReturn=new NativePoint(Player.x,Player.y);if(Player.crouching){Player.y-=10;Player.h=28;Player.crouching=false;}ClearFlightMotion();}
        void EndFlight(){var p=Player;if(!SafePosition(p.x,p.y)){var anchor=flightReturn??new NativePoint(Checkpoint?.x??Entry.X*32+4,Checkpoint?.y??Entry.Y*32+4);double x=anchor.x,y=anchor.y;if(!SafePosition(x,y)){x=Checkpoint?.x??Entry.X*32+4;y=Checkpoint?.y??Entry.Y*32+4;}if(!SafePosition(x,y)){double best=double.MaxValue;for(int cy=0;cy<Room.Rows;cy++)for(int cx=0;cx<Room.Cols;cx++){double tx=cx*32+4,ty=cy*32+4,d=Hypot(tx-anchor.x,ty-anchor.y);if(d<best&&SafePosition(tx,ty)){best=d;x=tx;y=ty;}}}p.x=x;p.y=y;}p.h=28;p.crouching=false;ClearFlightMotion();flightReturn=null;}
        void TickFlight(double dt,MotionInput input)
        {
            int x=(input.right?1:0)-(input.left?1:0),y=(input.down?1:0)-(input.up?1:0);
            double speed=config["speed"]*2/Math.Max(1,Hypot(x,y));
            var p=Player;
            double oldBottom=p.y+p.h;
            double nextX=Clamp(p.x+x*speed*dt,0,Room.Cols*32-p.w);
            foreach(var solid in colliders)
            {
                if(p.y>=solid.y+solid.h||p.y+p.h<=solid.y)continue;
                if(x>0&&p.x+p.w<=solid.x&&nextX+p.w>solid.x)nextX=solid.x-p.w;
                if(x<0&&p.x>=solid.x+solid.w&&nextX<solid.x+solid.w)nextX=solid.x+solid.w;
            }
            p.x=nextX;
            double nextY=Clamp(p.y+y*speed*dt,0,Room.Rows*32-p.h);
            p.grounded=false;p.support=null;
            foreach(var solid in colliders)
            {
                if(p.x>=solid.x+solid.w||p.x+p.w<=solid.x)continue;
                if(y>=0&&oldBottom<=solid.y+.001&&nextY+p.h>=solid.y){
                    nextY=solid.y-p.h;p.grounded=true;p.support=solid.id;
                }
                if(y<0&&p.y>=solid.y+solid.h&&nextY<solid.y+solid.h)nextY=solid.y+solid.h;
            }
            p.y=nextY;p.vx=p.vy=0;
            p.invulnerable=Math.Max(0,p.invulnerable-dt);
            if(x!=0)p.face=x;
            TriggerObjects(oldBottom,input);
            UpdateAI(dt);
        }
        public JObject Snapshot()
        {
            var player=JObject.FromObject(Player);player.Remove("Rect");if(Player.rail!=null){var points=new JArray();foreach(var p in Player.rail.points)points.Add(new JObject{{"x",p.x},{"y",p.y}});player["rail"]["points"]=points;}
            var ai=JObject.FromObject(AI);ai.Remove("trail");ai["processing"]=AiProcessing;ai["cooldown"]=AiCooldown;ai["trailLength"]=AI.trail.Count;var os=new JObject();foreach(var o in Room.Objects){var s=ObjectStates[o.Id];var state=new JObject{{"used",s.used},{"cooldown",s.cooldown},{"firedDuringContact",s.firedDuringContact}};if(s.hasWaitingAI)state["waitingAI"]=s.waitingAI;if(s.hasHitAI)state["hitAI"]=s.hitAI;if(o.Type=="physics.ice"){state["solid"]=s.solid;state["standing"]=s.standing;state["respawnRemaining"]=s.respawnRemaining;state["generation"]=s.generation;}if(o.Type=="physics.thermal")state["lastTemperature"]=s.lastTemperature;os[o.Id]=state;}
            var snapshot=new JObject{{"mode",Mode},{"courseId",Course.Id},{"roomId",Room.Id},{"entryId",Entry.Id},{"cols",Room.Cols},{"rows",Room.Rows},{"tokens",Tokens},{"charges",Charges},{"recharge",Recharge},{"score",Score},{"deaths",Deaths},{"steals",Steals},{"elapsed",Elapsed},{"roomTime",RoomTime},{"respawnRemaining",RespawnRemaining},{"checkpointId",Checkpoint.id},{"developer",new JObject{{"enabled",DeveloperEnabled},{"lockHealth",LockHealth},{"flight",DeveloperFlight}}},{"player",player},{"ai",ai},{"courseState",new JObject{{"aiActive",CourseAIActive},{"aiTier",CourseAITier},{"aiId",CourseAIId},{"phase",Phase},{"life",Life}}},{"objects",os},{"zones",JObject.FromObject(Zones)},{"events",JArray.FromObject(Events)}};return JObject.Parse(snapshot.ToString());
        }
    }
}
