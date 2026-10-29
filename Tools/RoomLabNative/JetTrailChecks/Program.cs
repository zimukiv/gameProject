using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using RoomLab.Native;

class Program
{
    static NativeProject source;
    static int cases, assertions, failures;
    static void Check(bool value,string message){assertions++;if(!value)throw new Exception(message);}
    static void Case(string name,Action run){cases++;try{run();Console.WriteLine("PASS "+name);}catch(Exception e){failures++;Console.WriteLine("FAIL "+name+": "+e.Message);}}
    static bool Event(NativeMotion g,string kind)=>g.Events.Any(e=>(string)e["type"]==kind);
    static NativePoint Center(NativeMotion g)=>new NativePoint(g.Player.x+g.Player.w/2,g.Player.y+g.Player.h/2);
    static JObject Obj(string id,string type,int x,int y,JObject parameters=null)=>new JObject{{"id",id},{"type",type},{"x",x},{"y",y},{"w",1},{"h",1},{"collision",type=="physics.jet"},{"params",parameters??new JObject()},{"trigger",new JObject{{"mode",type=="physics.jet"?"foot":"none"},{"requiresAI",false},{"distance",5},{"once",false},{"cooldown",1}}}};
    static NativeMotion Fixture(NativeGameplayRules rules,bool affect=true,double range=3)
    {
        var raw=(JObject)source.NormalizedJson.DeepClone();var c=(JObject)raw["courses"][0].DeepClone();var r=(JObject)c["rooms"][0].DeepClone();raw["courses"]=new JArray(c);c["rooms"]=new JArray(r);c["connections"]=new JArray();r["cols"]=30;r["rows"]=17;r["entries"]=new JArray(new JObject{{"id","entry"},{"x",2},{"y",10},{"face",1}});r["exits"]=new JArray();r["zones"]=new JArray();r["movables"]=new JArray();r["environment"]="cold";r["aiPolicy"]="inherit";
        var tiles=new JArray();for(int x=0;x<30;x++)tiles.Add(new JObject{{"x",x},{"y",12},{"collision",true}});r["tiles"]=tiles;
        var coin=Obj("locked","common.small",20,10,new JObject{{"unlockPadId","jet"}});coin["collision"]=false;
        r["objects"]=new JArray(Obj("jet","physics.jet",5,11,new JObject{{"direction","up"},{"force",900},{"affectAI",affect},{"range",range}}),coin);
        var p=NativeProjectLoader.LoadBytes(System.Text.Encoding.UTF8.GetBytes(raw.ToString()),"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});
        var g=new NativeMotion(p,rules:rules);g.Player.invulnerable=100;g.AI.active=true;g.AI.x=81;g.AI.y=352;g.AiProcessing=1;g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(81,352));g.AI.trail.Add(new NativePoint(176,338));return g;
    }
    static void LandJet(NativeMotion g){g.Player.x=164;g.Player.y=323.9;g.Player.vx=0;g.Player.vy=60;g.Player.launched=false;g.Tick(NativeMotion.Step);Check(Event(g,"jet")&&g.Player.launched&&g.Player.vy<0,"real player landing must retain normal jet launch");}
    static void ActualRoom()
    {
        Case("authored room10 right jet follows recorded ascent and left platform route",()=>{
            var room=source.FindRoom("room-mvnf7nel-q8wikm");Check(room!=null,"actual room10 missing");var jet=room.Objects.Single(o=>o.Id=="block-mvon8h4k-p7uyal");
            Check(jet.X==19&&jet.Y==12&&jet.Flag("affectAI")&&jet.Number("range")==3,"authored right jet changed");
            var g=new NativeMotion(source,roomId:room.Id,rules:NativeGameplayRules.DemoPhysics);g.Player.x=jet.X*32+4;g.Player.y=jet.Y*32-28-.1;g.Player.vy=60;g.Player.invulnerable=100;
            g.AI.active=true;g.AI.x=530;g.AI.y=370;g.AiProcessing=0;g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(580,370));g.AI.trail.Add(new NativePoint(624,370));
            double x=g.AI.x,y=g.AI.y;g.Tick(NativeMotion.Step);
            Check(Event(g,"jet")&&g.Player.launched&&g.Player.vy==-900,"actual authored jet did not launch player normally");
            Check(!g.AI.flight,"AI was launched remotely before reaching right jet");Check(g.AI.x>x&&Math.Abs(g.AI.y-y)<1e-8,"jet interrupted chronological approach along floor");
            Check(g.ObjectStates[jet.Id].hitAI,"legal AI influence no longer marks authored jet");
            bool reachedJet=false,followedLeft=false,landedPlatform=false;double minPlayerY=Center(g).y;
            for(int i=0;i<300;i++){
                x=g.AI.x;y=g.AI.y;bool cornerPending=g.AI.trail.Any(p=>p.x==624&&p.y==370);g.Tick(NativeMotion.Step,new MotionInput{left=!landedPlatform});var pc=Center(g);minPlayerY=Math.Min(minPlayerY,pc.y);
                Check(!g.AI.flight,"jet reintroduced independent AI ballistics");Check(NativeMotion.Hypot(g.AI.x-x,g.AI.y-y)<=g.AI.speed*NativeMotion.Step+1e-7,"AI skipped history by moving faster than chase speed");
                if(!reachedJet){if(cornerPending&&!g.AI.trail.Any(p=>p.x==624&&p.y==370)){Check(NativeMotion.Hypot(624-x,370-y)+NativeMotion.Hypot(g.AI.x-624,g.AI.y-370)<=g.AI.speed*NativeMotion.Step+1e-7,"AI shortcut omitted the recorded jet corner");reachedJet=true;}else Check(Math.Abs(g.AI.y-370)<1e-7,"AI cut the corner before reaching recorded jet position");}
                if(g.AI.y<365){Check(reachedJet,"AI ascended before the recorded jet corner");if(g.AI.x<610)followedLeft=true;}
                Check(g.AI.y>=minPlayerY-1,"AI rose beyond actual recorded player trajectory");
                if(g.Player.grounded&&g.Player.support=="tile-13-7")landedPlatform=true;
                if(landedPlatform&&followedLeft&&g.AI.x<450&&g.AI.y<240)break;
            }
            Console.WriteLine("ROOM10_EVIDENCE reachedJet="+reachedJet+" followedLeft="+followedLeft+" landedPlatform="+landedPlatform+" player="+g.Player.x+","+g.Player.y+" ai="+g.AI.x+","+g.AI.y);
            Check(reachedJet&&followedLeft,"AI did not follow both recorded jet corner and left ascent");Check(landedPlatform,"normal player left input never landed on authored upper platform");Check(g.AI.x<450&&g.AI.y<240,"AI did not continue onto player's upper-platform history");
        });
    }
    static int Main()
    {
        const string file="Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json";source=NativeProjectLoader.LoadFile(file,new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=true});string sha=source.SourceSha256;
        ActualRoom();
        foreach(var profile in new[]{NativeGameplayRules.Editor255Compat,NativeGameplayRules.LatestPhysics,NativeGameplayRules.DemoPhysics})foreach(bool affect in new[]{false,true})foreach(double distance in new[]{95.0,97.0}){
            var rules=profile;bool enabled=affect;double d=distance;
            Case("range and influence "+rules+" affectAI="+enabled+" distance="+d,()=>{
                var g=Fixture(rules,enabled);g.AI.x=176-d;double x=g.AI.x,y=g.AI.y;var before=g.AI.trail.ToArray();LandJet(g);bool hit=enabled&&d<=96;
                Check(g.ObjectStates["jet"].hitAI==hit&&g.ObjectStates["jet"].hasHitAI==hit,"range/affectAI influence markers changed");
                Check(g.AI.flight==(hit&&rules!=NativeGameplayRules.DemoPhysics),"profile-specific jet chase/ballistic contract changed");
                if(rules==NativeGameplayRules.DemoPhysics){Check(g.AI.x==x&&g.AI.y==y,"jet moved processing AI remotely");Check(Math.Abs(g.AiProcessing-(1-NativeMotion.Step))<1e-8,"jet reset chase processing timer");Check(g.AI.trail.Take(before.Length).SequenceEqual(before),"jet erased or reordered pending historical corners");}
                else if(hit)Check(g.AI.vy<0,"legacy configured ballistic launch removed");
            });
        }
        Case("Demo repeat jet leaves route warning and motion untouched",()=>{
            var g=Fixture(NativeGameplayRules.DemoPhysics);g.AI.warning=new NativeAIWarning{remaining=2,id="pending",to=new NativePoint(700,100)};g.AI.teleported.Add("pending");g.AI.vx=7;g.AI.vy=11;var warning=g.AI.warning;
            LandJet(g);g.Player.x=400;g.Player.y=100;g.Tick(0);g.ObjectStates["jet"].cooldown=0;g.AiProcessing=1;LandJet(g);
            Check(!g.AI.flight&&g.AI.vx==7&&g.AI.vy==11,"repeat jet changed independent AI motion");Check(ReferenceEquals(warning,g.AI.warning)&&g.AI.teleported.Contains("pending"),"repeat jet cancelled pending portal route");Check(g.AI.trail.Count>=2,"repeat jet discarded pending route");
        });
        foreach(bool affect in new[]{false,true}){bool enabled=affect;Case("Demo jet influence retains unlockPadId gate affectAI="+enabled,()=>{
            var g=Fixture(NativeGameplayRules.DemoPhysics,enabled);LandJet(g);g.Player.x=20*32+4;g.Player.y=10*32+4;g.Player.vx=g.Player.vy=0;g.Player.launched=false;g.Tick(0);Check(g.Tokens==(enabled?1:0),"jet hitAI no longer controls linked pickup gate");
        });}
        Check(NativeProjectLoader.Sha(File.ReadAllBytes(file))==sha,"authored JSON changed");Console.WriteLine("JET_TRAIL_CHECKS cases="+cases+" assertions="+assertions+" failures="+failures+" sourceUnchanged=true");return failures==0?0:1;
    }
}
