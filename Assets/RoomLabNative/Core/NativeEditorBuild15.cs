using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public sealed partial class NativeMotion
    {
        static bool Build15Item(string type) => type=="item.calculator"||type=="item.icedTea"||type=="item.coffee"||type=="item.phone";

        bool HasBuild15Item(string type) =>
            (developerItemsGranted&&Build15Item(type)) ||
            ((Project.OriginalJson["itemState"]?["initial"] as JObject)?[type] is JValue item && item.Type==JTokenType.Integer && (long)item>0) ||
            Course.Rooms.Any(room=>room.Objects.Any(o=>o.Type==type&&Credited.Contains(room.Id+"/"+o.Id)));

        // 求导/积分板在数据里是 collision:true 的实心机关砖，引擎会把玩家挤到 rect 之外，
        // 因此只靠 Overlap/top 判定时"贴着侧面撞上去"永远不成立。这两类额外接受贴边接触。
        static bool IsBuild15CalculusBlock(string type) => type=="calculus.integral"||type=="calculus.derivative";

        // 门控失败时必须给反馈，否则玩家分不清"缺道具"还是"没踩对"。
        static readonly string HintCalculator="需要道具：计算器",HintPhone="需要道具：手机",HintCoffee="需要道具：咖啡",HintGeneric="需要道具。";
        static string Build15GateHint(string type) =>
            IsBuild15CalculusBlock(type)?HintCalculator:type=="slacker.checkin"?HintPhone:type=="slacker.awake"?HintCoffee:HintGeneric;

        // 已拾取的主线道具键。这些是一次性钥匙（全 campaign 只有一个计算器要开 28 个机关），
        // 死亡/读档回退检查点时必须钉住，否则走过去之后所有求导/积分板会永久失效。
        List<string> OwnedBuild15Keys()
        {
            var keys=new List<string>();
            foreach(var room in Course.Rooms)foreach(var o in room.Objects)
                if(Build15Item(o.Type)&&Credited.Contains(room.Id+"/"+o.Id))keys.Add(room.Id+"/"+o.Id);
            return keys;
        }

        // 死亡回退一致性：机关砖的 pathTime/progress 必须和触发板的 used 属于同一世代。
        // 若 used 已回退成"未触发"而砖还留在展开位，就地把砖收回起点——
        // 这正是"死了以后求导/积分不回退"的现象。
        void ReconcileBuild15Bricks()
        {
            foreach(var o in Room.Objects){
                if(!IsBuild15CalculusBlock(o.Type))continue;
                if(ObjectStates[o.Id].used)continue;
                foreach(var b in Room.Movables){
                    if((string)b.Raw["padId"]!=o.Id)continue;
                    if(!Movables.TryGetValue(b.Id,out var st)||st==null)continue;
                    if(b.Raw["motionPath"] is JArray path&&path.Count>0){
                        double end=NativeBrickPath.Duration(path);
                        if(end>0&&st.pathTime>0&&st.pathTime<=end)
                            st.anim=new NativeTransformAnimation{kind="path",to=0};
                    }else if(st.progress>0){
                        st.anim=new NativeTransformAnimation{kind="progress",from=st.progress,to=0};
                    }
                }
            }
        }

        // 机关砖的实时位置：入口、出口、物件共用同一份状态，显示与判定不会各算一套。
        static MotionRect MovableRectIn(NativeRoom room,IDictionary<string,NativeMovableState> states,NativeRegion brick)
        {
            if(room==null||brick==null||states==null||!states.TryGetValue(brick.Id,out var state)||state==null)
                return new MotionRect(brick?.Id,brick==null?0:brick.X*32,brick==null?0:brick.Y*32,32,32);
            var pad=brick.Raw==null?null:room.Objects.Find(o=>o.Id==((string)brick.Raw["padId"]??""));
            if(pad!=null&&pad.Type=="legacy.rotor")
            {
                double a=state.angle*Math.PI/180,px=(pad.X+.5)*32,py=pad.Y*32,dx=(brick.X+.5)*32-px,dy=(brick.Y+.5)*32-py;
                return new MotionRect(brick.Id,px+dx*Math.Cos(a)-dy*Math.Sin(a)-16,py+dx*Math.Sin(a)+dy*Math.Cos(a)-16,32,32);
            }
            if(brick.Raw?["motionPath"] is JArray path)
            {
                var pos=NativeBrickPath.Position(brick.X,brick.Y,path,state.pathTime);
                return new MotionRect(brick.Id,pos.x*32,pos.y*32,32,32);
            }
            double targetX=(double?)brick.Raw?["targetX"]??brick.X,targetY=(double?)brick.Raw?["targetY"]??brick.Y;
            return new MotionRect(brick.Id,(brick.X+(targetX-brick.X)*state.progress)*32,(brick.Y+(targetY-brick.Y)*state.progress)*32,32,32);
        }
        // 附加偏移：显式 attachmentTo 优先；机关砖或状态缺失一律返回 0，旧档保持作者坐标。
        static NativePoint AttachmentOffset(NativeRoom room,IDictionary<string,NativeMovableState> states,JObject raw)
        {
            if(room==null||states==null||raw?["attachmentTo"]?.Type!=JTokenType.String)return new NativePoint(0,0);
            var owner=room.Movables.Find(b=>b.Id==(string)raw["attachmentTo"]);
            if(owner==null)return new NativePoint(0,0);
            var current=MovableRectIn(room,states,owner);
            return new NativePoint(current.x-owner.X*32,current.y-owner.Y*32);
        }
        static NativePoint AttachmentOffset(NativeRoom room,IDictionary<string,NativeMovableState> states,NativeRegion item)
        {
            return item==null?new NativePoint(0,0):AttachmentOffset(room,states,item.Raw);
        }
        MotionRect AttachedRegionRect(NativeRoom room,IDictionary<string,NativeMovableState> states,NativeRegion item)
        {
            var offset=AttachmentOffset(room,states,item);
            return new MotionRect(item.Id,item.X*32+offset.x,item.Y*32+offset.y,Math.Max(1,item.W)*32,Math.Max(1,item.H)*32);
        }
        // 当前房间的实时矩形：出生点、出入口显示与通行判定都读这里。
        public MotionRect EntryRect(NativeRegion entry){return AttachedRegionRect(Room,Movables,entry);}
        public MotionRect ExitRect(NativeRegion exit){return AttachedRegionRect(Room,Movables,exit);}
        // 回程落点读来源房间的缓存状态（该房间此刻不在内存中，不能直接读 Movables）。
        MotionRect CachedRegionRect(NativeRoom room,NativeRegion item)
        {
            roomCaches.TryGetValue(room?.Id??"",out var state);
            return AttachedRegionRect(room,state?.movables,item);
        }
        MotionRect Build15AttachedRect(string id,JObject raw,double x,double y,double w,double h)
        {
            var rect=new MotionRect(id,x*32,y*32,w*32,h*32);
            if(!IsEditorBuild15)return rect;
            var offset=AttachmentOffset(Room,Movables,raw);
            rect.x+=offset.x;rect.y+=offset.y;
            return rect;
        }

        bool Build15Solid(NativeObject o) =>
            IsEditorBuild15&&o.Type=="slacker.awake" ? !HasBuild15Item("item.coffee") : o.Collision;

        bool IsMainlineFinalSubmission()
        {
            return MainlinePack&&Room.Id!=Course.Rooms[0].Id&&
                Course.Connections.Exists(edge=>edge.FromRoomId==Room.Id&&edge.ToRoomId==Course.Rooms[0].Id);
        }

        public bool FreeExploration { get; private set; }
        public bool CanExploreAfterCompletion => IsEditorBuild15 && MainlinePack && (Completed || FreeExploration);

        public bool ExploreFromStart()
        {
            if (!CanExploreAfterCompletion) return false;
            FreeExploration = true;
            LoadRoom(Course.Rooms[0].Id);
            return true;
        }

        bool TryReviewExplorationScore(NativeObject interaction)
        {
            if (!FreeExploration || interaction?.Type != "common.assignmentSubmit" ||
                !IsMainlineFinalSubmission()) return false;
            Mode = "won";
            return true;
        }

        bool Build15TriggerAllowed(NativeObject o)
        {
            switch(o.Type)
            {
                case "calculus.integral":case "calculus.derivative":return HasBuild15Item("item.calculator");
                case "slacker.checkin":return HasBuild15Item("item.phone");
                case "slacker.awake":return HasBuild15Item("item.coffee");
                case "common.assignmentSubmit":return (AI.active||IsMainlineFinalSubmission())&&!ObjectStates[o.Id].fired;
                default:return true;
            }
        }

        bool TryBuild15Fire(NativeObject o,MotionObjectState state)
        {
            if(!IsEditorBuild15)return false;
            switch(o.Type)
            {
                case "common.assignmentSubmit":
                    AI.active=false;CourseAIActive=false;AI.trail.Clear();SubmitDone=true;
                    Score+=50000;ObjectStates[o.Id].fired=true;
                    Emit("assignment-submit",new JObject{{"id",o.Id},{"score",50000}});
                    // 关卡里最后一个作业提交装置被触发时结算。
                    int total=0,done=0;
                    foreach(var room in Course.Rooms)foreach(var device in room.Objects)
                        if(device.Type=="common.assignmentSubmit"){
                            total++;
                            var states=room.Id==Room.Id?ObjectStates:
                                roomCaches.TryGetValue(room.Id,out var visited)?visited.objects:null;
                            if(states!=null&&states.TryGetValue(device.Id,out var submission)&&submission.fired)done++;
                        }
                    if(!FreeExploration&&(IsMainlineFinalSubmission()||total>0&&done>=total)&&!completionAwarded)
                    {completionAwarded=true;Score+=50000;Mode="won";Emit("finish");Finished?.Invoke();}
                    return true;
                case "slacker.awake":
                    double x=Player.vx,y=Player.vy;
                    if(Math.Abs(x)<1&&Math.Abs(y)<1)x=Player.face;
                    double speed=o.Number("speed",520);
                    bool horizontal=Math.Abs(x)>=Math.Abs(y);
                    Launch(horizontal?Math.Sign(x)*speed:0,horizontal?0:Math.Sign(y)*speed);
                    if(horizontal)Player.build15LaunchHold=.3;
                    state.boosts++;
                    Emit("awake",new JObject{{"id",o.Id},{"count",state.boosts}});
                    return true;
                default:return false;
            }
        }

        MotionRect Build15TeacherRect(NativeObject o,double lookAhead=0)
        {
            double time=ObjectStates.TryGetValue(o.Id,out var state)?state.teacherTime+lookAhead:0;
            double x=o.X,y=o.Y;
            if(o.Parameters["path"] is JArray path&&path.Count>0){
                double total=NativeBrickPath.Duration(path);
                if(total>0){
                    switch(o.Text("pathLoop","roundtrip")){
                        case "roundtrip":time%=total*2;if(time>total)time=total*2-time;break;
                        case "loop":time%=total;break;
                        default:time=Math.Min(time,total);break;
                    }
                    var point=NativeBrickPath.Position(x,y,path,time);
                    x=point.x;y=point.y;
                }
            }else{
                double left=Clamp(o.Number("patrolMinX",0),0,Room.Cols-1);
                double right=Clamp(o.Number("patrolMaxX",4),0,Room.Cols-1);
                double min=Math.Min(left,right),max=Math.Max(left,right),width=max-min;
                x=min;
                if(width>0){
                    double phase=(Clamp(o.X,min,max)-min+time*Math.Max(0,o.Number("speed",1.5)))%(2*width);
                    x+=phase<=width?phase:2*width-phase;
                }
            }
            return new MotionRect(o.Id,x*32,y*32,o.W*32,o.H*32);
        }

        public bool IsBuild15TeacherAlert(NativeObject teacher)
        {
            if(!IsEditorBuild15||ObjectStates[teacher.Id].teacherRemoved)return false;
            var actor=Build15TeacherRect(teacher);
            var pc=PlayerCenter;
            double offsetX=actor.w*.5,offsetY=actor.h*.5;
            double fromX=actor.x+offsetX,fromY=actor.y+offsetY;
            var first=Build15TeacherRect(teacher,.025);
            double facingX=first.x-actor.x,facingY=first.y-actor.y;
            if((pc.x-fromX)*facingX+(pc.y-fromY)*facingY<=0)return false;
            for(int sample=1;sample<=12;sample++)
            {
                var next=Build15TeacherRect(teacher,sample*.075);
                double toX=next.x+offsetX,toY=next.y+offsetY;
                double dx=toX-fromX,dy=toY-fromY;
                double length=dx*dx+dy*dy;
                if(length<1e-6||dx*facingX+dy*facingY<=0)break;
                double t=Clamp(((pc.x-fromX)*dx+(pc.y-fromY)*dy)/length,0,1);
                if(Hypot(pc.x-fromX-dx*t,pc.y-fromY-dy*t)<=14)return true;
                fromX=toX;fromY=toY;
            }
            return false;
        }

        public bool IsBuild15TeacherRemoved(NativeObject o) =>
            IsEditorBuild15&&o.Type=="slacker.teacher"&&ObjectStates[o.Id].teacherRemoved;

        void TickBuild15Teachers(double dt)
        {
            if(!IsEditorBuild15)return;
            foreach(var o in Room.Objects){
                if(o.Type!="slacker.teacher")continue;
                var state=ObjectStates[o.Id];
                if(state.teacherRemoved)continue;
                state.teacherTime+=dt;
                if(o.Parameters["checkinIds"] is JArray ids&&ids.Count>0&&ids.All(id=>ObjectStates.TryGetValue((string)id,out var checkin)&&checkin.signIns>0)){
                    state.teacherRemoved=true;state.teacherTouch=false;
                    Emit("teacher-removed",new JObject{{"id",o.Id}});
                }
            }
        }

        bool TickBuild15TeacherContacts()
        {
            if(!IsEditorBuild15)return false;
            foreach(var o in Room.Objects){
                if(o.Type!="slacker.teacher")continue;
                var state=ObjectStates[o.Id];
                var body=Build15TeacherRect(o);
                var hitbox=new MotionRect(null,body.x+body.w*.18,body.y+body.h*.1,body.w*.64,body.h*.86);
                bool touching=!state.teacherRemoved&&MotionRect.Overlap(Player.Rect,hitbox);
                if(touching&&!state.teacherTouch&&Player.invulnerable<=0){
                    state.teacherHits++;
                    // 受击反馈：与 AI 抓到人同理 —— 无敌帧闪烁 + 被弹开（若还在无敌中则不重复触发）
                    if(Player.invulnerable<=0)
                    {
                        Player.invulnerable=.9;
                        var tr=Build15TeacherRect(o);
                        double pcx=Player.x+Player.w*.5, tcx=tr.x+tr.w*.5;
                        double dir=pcx>=tcx?1:-1;
                        Player.vx=dir*135; Player.vy=-165; Player.grounded=false;
                        Player.x=Clamp(Player.x+dir*20,0,Room.Cols*32-Player.w);
                        Player.y=Math.Max(0,Player.y-14);
                        Emit("teacher-knockback",new JObject{{"id",o.Id},{"dir",dir}});
                    }
                    if(state.teacherHits>=2&&!LockHealth){Retry("再次碰到巡查老师");return true;}
                    int lost=(int)Math.Ceiling(Tokens*.5);
                    Tokens-=lost;
                    Emit("teacher-hit",new JObject{{"id",o.Id},{"hits",state.teacherHits},{"lost",lost}});
                }
                state.teacherTouch=touching;
            }
            return false;
        }
    }
}

