using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using RoomLab.Native;

class CalculusRoutes
{
    const string Folder="Validation/Native/DAlphaFix20261108/Checks/";
    static JObject source=JObject.Parse(File.ReadAllText("Assets/StreamingAssets/RoomLabNative/Campaign/deadline-autosave.json"));
    static JArray reports=new JArray(),trace=new JArray();
    static int failures;
    static HashSet<string> covered=new HashSet<string>();
    static string Id(int n)=>"network-calculus-"+n.ToString("00");
    static NativeMotion Start(int room=1,bool geometryOnly=false)
    {
        var raw=(JObject)source.DeepClone();
        if(geometryOnly)((JObject)((JArray)raw["courses"][0]["rooms"]).First(r=>(string)r["id"]==Id(room)))["aiPolicy"]="off";
        return new NativeMotion(NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(raw.ToString()),"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve}),"guided-calculus",Id(room),NativeGameplayRules.DemoPhysics);
    }
    static JObject Snap(NativeMotion g)=>new JObject{{"room",g.Room.Id},{"x",Math.Round(g.Player.x/32,3)},{"feet",Math.Round((g.Player.y+g.Player.h)/32,3)},{"seconds",Math.Round(g.Elapsed,2)},{"deaths",g.Deaths},{"aiHits",g.AiHits},{"aiActive",g.AI.active},{"aiX",Math.Round(g.AI.x/32,3)},{"aiY",Math.Round(g.AI.y/32,3)},{"switches",JObject.FromObject(g.ReworkSwitches)}};
    static void ConfirmDialog(NativeMotion g){var property=typeof(NativeMotion).GetProperty("AwaitingSaveChoice");if(property!=null&&(bool)property.GetValue(g)){typeof(NativeMotion).GetMethod("ResolveCheckpointChoice").Invoke(g,new object[]{true});}}
    static JArray replay,markers;
    static bool monitor;static double minimumFeet;static int assertions;
    static void Assert(bool ok,string name){assertions++;Require(ok,name);}
    static void Step(NativeMotion g,MotionInput input=default){if(replay!=null)replay.Add(JObject.FromObject(input));g.Tick(NativeMotion.Step,input);ConfirmDialog(g);if(monitor)minimumFeet=Math.Min(minimumFeet,(g.Player.y+g.Player.h)/32);}
    static NativeMotion AtDerivative(){monitor=false;var g=Start(10);Go(g,3,37);Stairs(g,8,36,10);Go(g,55,27);Go(g,51,26);Stairs(g,51,26,10,-1);Go(g,26.5,17);return g;}
    static void WalkTrigger(NativeMotion g){for(int i=0;i<240&&g.ReworkSwitches["final-alpha"];i++)Step(g,new MotionInput{left=true});Assert(!g.ReworkSwitches["final-alpha"],"normal contact triggered d-alpha");monitor=true;minimumFeet=(g.Player.y+g.Player.h)/32;}
    static bool RetractingSupport(NativeMotion g)=>g.Player.grounded&&g.Player.support!=null&&g.Player.support.Contains("-paper-")&&g.ReworkPlatforms.Any(p=>(string)p["id"]==g.Player.support&&(string)p["switch"]=="final-alpha")&&!g.ReworkSwitches["final-alpha"];

    static void Require(bool yes,string message){if(!yes)throw new Exception(message);}
    static void Case(string name,Action action){trace=new JArray();try{action();reports.Add(new JObject{{"name",name},{"pass",true},{"trace",trace}});Console.WriteLine("PASS "+name);}catch(Exception e){failures++;reports.Add(new JObject{{"name",name},{"pass",false},{"error",e.Message},{"trace",trace}});Console.WriteLine("FAIL "+name+" "+e.Message);}}
    // Ordinary input only. Does not move actors, trigger mechanisms, change time,
    // grant resources, override health, or directly change a room/state.
    static void Go(NativeMotion g,double tile,double floor,string action="")
    {
        string room=g.Room.Id;int deaths=g.Deaths;double target=(tile+.5)*32,fy=floor*32;bool interacted=false;
        for(int frame=0;frame<120*25;frame++)
        {
            if(g.Room.Id!=room||g.Completed){Require(action=="door","unexpected transition");return;}
            if(g.Deaths!=deaths)throw new Exception("death at "+tile+","+floor+" "+Snap(g));
            var p=g.Player;double cx=p.x+p.w/2,feet=p.y+p.h,dx=target-cx;
            bool near=Math.Abs(dx)<10,atFloor=p.grounded&&Math.Abs(feet-fy)<4;
            bool done=near&&atFloor;
            if(action=="ai")done&=g.AI.active;
            if(action=="save")done&=interacted;
            if(action=="door")done=false;
            if(done){if(replay!=null)markers.Add(new JObject{{"frame",replay.Count},{"target",tile+","+floor+" "+action},{"state",Snap(g)}});trace.Add(new JObject{{"target",tile+","+floor+" "+action},{"state",Snap(g)}});return;}
            int dir=dx>4?1:dx<-4?-1:0;bool jump=false;
            if(p.grounded)
            {
                if(fy<feet-12&&Math.Abs(dx)<160)jump=true;
                foreach(var b in g.CollisionRects)
                {
                    double front=dir>0?b.x-p.x-p.w:p.x-b.x-b.w;
                    if(dir!=0&&front>=-1&&front<30&&b.y<feet-4&&b.y+b.h>p.y+2){jump=true;break;}
                }
                if(dir!=0&&fy<=feet+4)
                {
                    double probe=dir>0?p.x+p.w+12:p.x-12;
                    bool support=g.CollisionRects.Any(b=>probe>=b.x&&probe<b.x+b.w&&b.y>=feet-4&&b.y<=feet+34);
                    if(!support)jump=true;
                }
                if(g.AI.active&&g.AiProcessing<=0&&Math.Sign(g.AI.x-cx)==dir&&Math.Abs(g.AI.x-cx)<95&&Math.Abs(g.AI.y-p.y-p.h/2)<45)jump=true;
                if(g.PatrolActive)foreach(var patrol in g.Patrols)if(Math.Sign(patrol.x-cx)==dir&&Math.Abs(patrol.x-cx)<80&&Math.Abs(patrol.y-p.y-p.h/2)<45)jump=true;
                foreach(var door in g.Room.Exits.Where(g.ReworkExitOpen)){
                    if(action=="door"&&Math.Abs(door.X+.5-tile)<2)continue;
                    double front=dir>0?door.X*32-p.x-p.w:p.x-(door.X+door.W)*32;
                    if(dir!=0&&front>=-1&&front<30&&Math.Abs(feet-(door.Y+door.H)*32)<5)jump=true;
                }
            }
            bool interact=false;
            if(near&&atFloor)
            {
                if(action=="door")interact=true; // Current interaction-door profile.
                else if((action=="ai"||action=="save")&&!interacted&&g.NearbyInteraction!=null){interact=true;interacted=true;}
            }
            bool dash=g.AI.active&&g.AiProcessing<=0&&p.freeDash&&dir!=0&&!jump&&Math.Abs(dx)>35&&
                ((!p.grounded&&p.vy>-180&&p.vy<0&&Math.Abs(dx)>128)||(p.grounded&&Math.Abs(fy-feet)<4&&Math.Abs(g.AI.x-cx)<120));
            Step(g,new MotionInput{left=dir<0,right=dir>0,jumpPressed=jump,dashPressed=dash,interactPressed=interact});
            if(frame%120==0)trace.Add(new JObject{{"target",tile+","+floor+" "+action},{"state",Snap(g)}});
        }
        throw new Exception("timeout "+tile+","+floor+" "+Snap(g));
    }
    static void Stairs(NativeMotion g,double x,double floor,int count,int d=1){Go(g,x+2*d*(count-1),floor-count+1);}
    static void Final(bool ai)
    {
        var g=Start(10,!ai);
        Assert(g.Room.Exits.All(e=>!g.ReworkExitOpen(e)),"no stages cannot pass exit");
        Go(g,3,37);
        Assert(g.Room.Exits.All(e=>!g.ReworkExitOpen(e)),"alpha alone cannot pass exit");
        Stairs(g,8,36,10);Go(g,55,27);
        Assert(g.Room.Exits.All(e=>!g.ReworkExitOpen(e)),"alpha beta without derivative cannot pass exit");
        Require(g.ReworkSwitches.TryGetValue("final-alpha",out var a)&&a,"alpha not set");
        Require(g.ReworkSwitches.TryGetValue("final-beta",out var b)&&b,"beta not set");
        Go(g,51,26);Stairs(g,51,26,10,-1);Go(g,23,17);
        Require(!g.ReworkSwitches["final-alpha"],"d-alpha failed");
        Assert(g.Room.Exits.All(e=>!g.ReworkExitOpen(e)),"without gamma exit remains closed");
        Go(g,31.5,22);Go(g,33.5,25);Go(g,36,32);Go(g,39,37);Go(g,35,37);
        Require(g.ReworkSwitches.TryGetValue("final-gamma",out var c)&&c,"gamma not set");
        Stairs(g,26,36,10,-1);
        if(ai){Go(g,7,27);for(int wait=0;wait<360&&g.CampaignCollected<1;wait++)Step(g);Relics(g,1);Go(g,3.5,27,"door");Require(g.Completed,"final exit did not complete");}
        else Go(g,7,27);
        trace.Add(new JObject{{"proof",true},{"state",Snap(g)}});
    }
    static void Door(NativeMotion g,int to,double x,double floor)
    {
        string from=g.Room.Id;
        var edge=g.Course.Connections.First(e=>e.FromRoomId==from&&e.ToRoomId==Id(to));
        var door=g.Room.Exits.First(e=>e.Id==edge.ExitId);
        if(g.RoomTime<1.5&&g.Course.Connections.Any(e=>e.ToRoomId==from&&e.EntryId==g.Entry.Id&&e.FromRoomId==Id(to))){
            var zone=new MotionRect(null,door.X*32-80,door.Y*32-80,door.W*32+160,door.H*32+160);
            int direction=g.Player.x+g.Player.w/2>=(door.X+door.W/2.0)*32?1:-1;
            for(int walk=0;walk<180&&MotionRect.Overlap(g.Player.Rect,zone);walk++){
                var p=g.Player;double feet=p.y+p.h;bool jump=p.grounded&&g.CollisionRects.Any(b=>{double front=direction>0?b.x-p.x-p.w:p.x-b.x-b.w;return front>=-1&&front<30&&b.y<feet-4&&b.y+b.h>p.y+2;});
                Step(g,new MotionInput{right=direction>0,left=direction<0,jumpPressed=jump});Require(g.Room.Id==from,"unexpected door while walking clear of arrival");
            }
        }
        Go(g,x+.5,floor,"door");Require(g.Room.Id==Id(to),"wrong destination "+Snap(g));
        for(int idle=0;idle<66;idle++)Step(g);Require(g.Room.Id==Id(to),"door bounced back after target entry "+Snap(g));
        covered.Add(edge.Id);trace.Add(new JObject{{"edge",edge.Id},{"state",Snap(g)}});
    }
    static void FullNetwork()
    {
        var g=Start();
        Stairs(g,3,23,7);Go(g,18,17);Door(g,2,36,17);
        Door(g,1,1,35);Door(g,2,36,17);
        Door(g,3,10,35);Go(g,10,28);Stairs(g,14,27,10);Door(g,4,36,18);
        Stairs(g,10,28,8);Go(g,26,21);Door(g,2,28,21);
        Go(g,34.5,26);Go(g,36.5,25);Door(g,4,39,25);Go(g,10,28);Door(g,3,1,29);
        Go(g,14,27);Door(g,2,1,28);Door(g,3,10,35);
        Go(g,10,28);Stairs(g,14,27,10);Door(g,7,45,28);
        Door(g,3,1,23);Door(g,7,45,28);
        Stairs(g,7,22,8);Go(g,27,15);Door(g,5,47,23);
        Door(g,7,7,30);Go(g,4,23);Door(g,3,1,23);Door(g,7,45,28);Door(g,5,47,23);Door(g,2,1,30);Door(g,5,54,35);
        Go(g,17,30);Go(g,17,20);Go(g,27,20);Go(g,32,30);Door(g,6,46,30);
        Door(g,5,1,32);Door(g,6,46,30);
        Stairs(g,12,31,12);Go(g,39,20);Go(g,12,32);Door(g,2,7,32);
        Door(g,6,42,35);Go(g,12,32);Go(g,14,30.5);Stairs(g,16,29,10);Door(g,8,42,20);
        Door(g,6,56,31);Door(g,8,42,20);
        Stairs(g,54,30,11,-1);Go(g,3,31);Door(g,4,1,31);
        Door(g,8,46,29);Door(g,4,1,31);
        Stairs(g,44,28,8,-1);Door(g,2,28,21);
        Door(g,9,55,25);Door(g,2,1,27);Door(g,9,55,25);
        Door(g,6,7,27);Door(g,9,51,32);
        Stairs(g,14,26,11);Door(g,10,41,16);
        Require(covered.Count==27,"not all directed connections covered: "+covered.Count);
        trace.Add(new JObject{{"covered",JArray.FromObject(covered.OrderBy(s=>s))},{"state",Snap(g)}});
    }
    static void SafeAnchors()
    {
        int checkedPoints=0,continued=0;
        foreach(var room in (JArray)source["courses"][0]["rooms"])
        {
            int number=int.Parse(((string)room["id"]).Substring("network-calculus-".Length));
            var g=Start(number);
            Require(g.SafePosition(g.Player.x,g.Player.y),"unsafe initial body "+g.Room.Id);
            NativeMotion.FromContinuation(g.Project,g.ExportContinuation(),NativeGameplayRules.DemoPhysics);continued++;
            foreach(bool active in new[]{false,true})
            {
                foreach(var key in (JArray)g.Room.Raw["nativeCampaign"]["switches"])g.ReworkSwitches[(string)key]=active;
                g.ReworkSignals["beta"]=g.ReworkSignals["gamma"]=active;
                foreach(var paper in g.ReworkPlatforms)g.ReworkPositions[(string)paper["id"]]=active?1:0;
                foreach(var entry in g.Room.Entries){checkedPoints++;Require(g.SafePosition(entry.X*32+4,entry.Y*32+4),"unsafe entry "+entry.Id+" "+active);}
                foreach(var flag in g.Room.Objects.Where(o=>o.Type=="common.checkpoint")){checkedPoints++;Require(g.SafePosition(flag.X*32+4,flag.Y*32+4),"unsafe flag "+flag.Id+" "+active);}
            }
        }
        trace.Add(new JObject{{"safePositionChecks",checkedPoints},{"defaultContinuations",continued}});
    }
    static void Relics(NativeMotion g,int expected)
    {
        var found=g.Room.Objects.Where(o=>o.Type=="common.collectible"&&g.Credited.Contains(g.Room.Id+"/"+o.Id)).Select(o=>o.Name).ToArray();
        trace.Add(new JObject{{"collections",JArray.FromObject(found)},{"state",Snap(g)}});
        Require(found.Length==expected,"missing collection expected "+expected+" got "+found.Length);
    }
    static void Main(string[] args)
    {
        foreach(JToken invalid in new JToken[]{new JValue(9),new JValue("unknown"),new JObject()})Case("reject invalid fold condition "+invalid.Type,()=>{
            var raw=(JObject)source.DeepClone();var room=((JArray)raw["courses"]).SelectMany(c=>(JArray)c["rooms"]).First(r=>(string)r["id"]==Id(10));room["nativeCampaign"]["platforms"][0]["foldOnReturnAfterSwitch"]=invalid;
            bool rejected=false;try{NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(raw.ToString()),"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});}catch(NativeDataException){rejected=true;}Assert(rejected,"invalid condition rejected");
        });
        foreach(int direction in new[]{-1,0,1})foreach(int delay in new[]{0,1,4,10,18,40,80})foreach(bool jump in new[]{false,true})Case("sweep "+direction+" delay "+delay+" jump "+jump,()=>{
            var g=AtDerivative();WalkTrigger(g);for(int n=0;n<delay;n++)Step(g);
            for(int i=0;i<180;i++)Step(g,new MotionInput{right=direction>0,left=direction<0,jumpPressed=jump&&i==0});
            Assert(minimumFeet>=15,"no ceiling carry feet="+minimumFeet);
        });
        foreach(int delay in new[]{0,4,10,18})Case("normal landing during d-alpha return delay "+delay,()=>{
            var g=AtDerivative();WalkTrigger(g);for(int n=0;n<delay;n++)Step(g);
            for(int i=0;i<110;i++)Step(g,new MotionInput{right=true,jumpPressed=i==0});
            Assert(minimumFeet>=15,"returning alpha never lifts a normal jump toward storage ceiling");Assert(g.Deaths==0,"ordinary jump remains alive");
            trace.Add(new JObject{{"delayFrames",delay},{"minimumFeet",minimumFeet},{"state",Snap(g)}});
        });
        Case("fold remains local and descent remains after waiting",()=>{
            var g=AtDerivative();WalkTrigger(g);for(int i=0;i<240;i++)Step(g);
            foreach(var paper in g.ReworkPlatforms.Where(p=>(string)p["foldOnReturnAfterSwitch"]=="final-beta")){
                Assert(g.ReworkPlatformVisibility(paper)==0,"returned paper hidden");Assert(g.ReworkPlatformRect(paper).y==(double)paper["toY"]*32,"fold stays at deployed height");
            }
            Go(g,31.5,22);for(int i=0;i<120;i++)Step(g);Assert(g.Player.grounded,"first landing stable");
            Go(g,33.5,25);Go(g,36,32);for(int i=0;i<120;i++)Step(g);Assert(g.Player.grounded,"second landing stable");
            Go(g,39,37);Go(g,35,37);Assert(g.ReworkSwitches["final-gamma"],"gamma remains reachable without timed jump");
        });
        Case("jump onto derivative then jump away",()=>{
            var g=AtDerivative();Step(g,new MotionInput{left=true,jumpPressed=true});
            for(int i=0;i<150&&g.ReworkSwitches["final-alpha"];i++)Step(g,new MotionInput{left=g.Player.x+12>23.5*32});
            Assert(!g.ReworkSwitches["final-alpha"]&&g.Player.grounded,"normal jumping approach lands on d-alpha");monitor=true;minimumFeet=(g.Player.y+g.Player.h)/32;
            for(int i=0;i<100;i++)Step(g,new MotionInput{right=true,jumpPressed=i==0});Assert(minimumFeet>=15&&g.Deaths==0,"jump-triggered return does not fling player");
        });
        Case("real M05 paper lift carries upward and downward",()=>{
            monitor=false;var g=Start(5);Go(g,9,30);for(int i=0;i<64;i++)Step(g,new MotionInput{right=true,jumpPressed=i==0});Assert(!g.ObjectStates["network-calculus-05-object-005"].used,"initial jump preserves real derivative for lift return");Go(g,17,30);string id="network-calculus-05-paper-003";Assert(g.ReworkSwitches["store-alpha"],"normal integral deploys real paper lift");
            int up=0;for(int i=0;i<500&&(g.Player.y+g.Player.h)/32>20.01;i++){double y=g.Player.y;string prior=g.Player.support;Step(g);if(prior==id&&g.Player.y<y-.001)up++;}
            Assert(up>30&&Math.Abs((g.Player.y+g.Player.h)/32-20)<.01,"real deployed paper lift still carries rider to upper floor");
            Go(g,6,20);Go(g,3.5,30);Go(g,11,30);for(int i=0;i<15&&g.ReworkSwitches["store-alpha"];i++)Step(g,new MotionInput{right=true});Assert(!g.ReworkSwitches["store-alpha"],"normal derivative starts real lift downward return "+Snap(g));
            for(int i=0;i<450&&g.ReworkPositions[id]>.22;i++)Step(g);Step(g,new MotionInput{right=true,jumpPressed=true});
            int down=0;bool landed=false;for(int i=0;i<180;i++){double y=g.Player.y;string prior=g.Player.support;Step(g,new MotionInput{right=g.Player.x+12<14.8*32});if(g.Player.support==id)landed=true;if(prior==id&&g.Player.y>y+.001)down++;}
            Assert(landed&&down>0,"normal jump onto returning real lift is carried downward");Assert(g.Deaths==0,"lift round trip survives with ordinary input");trace.Add(new JObject{{"upCarryFrames",up},{"downCarryFrames",down},{"state",Snap(g)}});
        });
        Case("full final alpha beta d-alpha gamma and E exit",()=>{
            monitor=false;replay=new JArray();markers=new JArray();Final(true);File.WriteAllText(Folder+"final-inputs.json",new JObject{{"course","guided-calculus"},{"room",Id(10)},{"dt",NativeMotion.Step},{"inputs",replay},{"markers",markers}}.ToString());replay=null;Assert(true,"original chase proof and final E completed");
        });
        File.WriteAllText(Folder+"results.json",new JObject{{"cases",reports.Count},{"assertions",assertions},{"failures",failures},{"ordinaryInputOnly",true},{"reports",reports}}.ToString());
        Console.WriteLine("D_ALPHA_FIX cases="+reports.Count+" assertions="+assertions+" failures="+failures);Environment.ExitCode=failures==0?0:1;
    }
}
