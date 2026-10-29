using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json.Linq;
using RoomLab.Native;

class Program
{
 static NativeProject source;static int assertions,cases,failures;
 static void Check(bool value,string message){assertions++;if(!value)throw new Exception(message);}
 static void Case(string name,Action test){cases++;try{test();Console.WriteLine("PASS "+name);}catch(Exception e){failures++;Console.WriteLine("FAIL "+name+": "+e.Message);}}
 static JObject Object(string id,string type,int x,int y,JObject parameters=null){return new JObject{{"id",id},{"type",type},{"x",x},{"y",y},{"w",1},{"h",1},{"collision",type=="physics.jet"},{"params",parameters??new JObject()},{"trigger",new JObject{{"mode",type=="physics.jet"?"foot":"none"},{"requiresAI",false},{"distance",5},{"once",false},{"cooldown",1}}}};}
 static NativeMotion Game(NativeGameplayRules rules=NativeGameplayRules.DemoPhysics,params JObject[] objects)=>Fixture(rules,30,objects);
 static NativeMotion Fixture(NativeGameplayRules rules,int floorColumns,params JObject[] objects){var raw=(JObject)source.NormalizedJson.DeepClone();var c=(JObject)raw["courses"][0].DeepClone();var r=(JObject)c["rooms"][0].DeepClone();raw["courses"]=new JArray(c);c["rooms"]=new JArray(r);c["connections"]=new JArray();r["cols"]=30;r["rows"]=17;r["aiPolicy"]="inherit";r["entries"]=new JArray(new JObject{{"id","entry"},{"x",2},{"y",10},{"face",1}});r["exits"]=new JArray();r["zones"]=new JArray();r["movables"]=new JArray();r["environment"]="cold";r["objects"]=new JArray(objects);var tiles=new JArray();for(int x=0;x<floorColumns;x++)tiles.Add(new JObject{{"x",x},{"y",12},{"collision",true}});r["tiles"]=tiles;var p=NativeProjectLoader.LoadBytes(System.Text.Encoding.UTF8.GetBytes(raw.ToString()),"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});var g=new NativeMotion(p,c.Value<string>("id"),r.Value<string>("id"),rules);Check(g.Room.Tiles.Count==floorColumns&&g.Room.Objects.Count==objects.Length&&g.Room.Tiles.All(t=>t.Y==12),"synthetic fixture attached to root");g.Player.x=500;g.Player.y=356;g.Player.invulnerable=100;g.AI.active=true;g.AI.x=100;g.AI.y=370;g.AiProcessing=0;return g;}
 static object Recovery(NativeMotion g)=>typeof(NativeAIState).GetField("recovery")?.GetValue(g.AI);
 static JObject RecoveryJson(NativeMotion g){var state=Recovery(g);return state==null?null:JObject.FromObject(state);}
 static void RecoverSetup(NativeMotion g){g.Player.x=304;g.Player.y=162;g.Player.vx=g.Player.vy=0;g.AI.x=1160;g.AI.y=623;g.AI.vx=0;g.AI.vy=900;g.AI.flight=true;g.AiProcessing=1;g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(80,370));g.AI.trail.Add(new NativePoint(160,370));g.ClearEvents();}
 static void WaitArrived(NativeMotion g){for(int i=0;i<180;i++){var state=RecoveryJson(g);if(state!=null&&(bool?)state["arrived"]==true)return;g.Tick(NativeMotion.Step);}throw new Exception("recovery never arrived within 1.5 seconds");}
 static void SetRecovery(NativeMotion g){var field=typeof(NativeAIState).GetField("recovery");Check(field!=null,"recovery state missing");var state=Activator.CreateInstance(field.FieldType);field.FieldType.GetField("remaining").SetValue(state,.65);field.FieldType.GetField("to").SetValue(state,new NativePoint(80,370));field.SetValue(g.AI,state);}
 static JObject Treasure()=>Object("treasure","common.collectible",5,5);
 static bool Has(NativeMotion g,string type)=>g.Events.Any(e=>(string)e["type"]==type);
 static void PendingPortalResetCase()
 {
  Case("developer return cancels only pending portal route and permits retrigger",()=>{
   var pad=Object("start","common.aiStart",2,11);pad["trigger"]["mode"]="region";
   var portal=Object("portal-in","common.portalIn",10,4,new JObject{{"routeId","pending-route"}});
   var exit=Object("portal-out","common.portalOut",20,4,new JObject{{"routeId","pending-route"}});
   var g=Fixture(NativeGameplayRules.DemoPhysics,5,pad,portal,exit);g.Player.x=68;g.Player.y=324;g.AI.active=false;g.CourseAIActive=false;g.SetDeveloperOptions(true,true,false);
   g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(g.AI.active,"real E did not start AI");for(int i=0;i<60;i++)g.Tick(NativeMotion.Step);g.AI.teleported.Add("completed-route");bool staged=false,warningCreated=false,returned=false;
   for(int i=0;i<720;i++){
    // Stage only the AI at a real portal, late in the player's ordinary walk-off.
    // The production Tick creates warning and its eager teleported marker together.
    if(!staged&&g.Player.y>580){staged=true;g.AI.x=336;g.AI.y=144;g.AI.flight=false;g.AiProcessing=0;}
    double y=g.Player.y;g.Tick(NativeMotion.Step,new MotionInput{right=true});
    if(g.AI.warning!=null&&g.AI.warning.id=="pending-route"){warningCreated=true;Check(g.AI.teleported.Contains("pending-route"),"production warning lacks its pending route marker");}
    if(y>580&&g.Player.y==324){returned=true;break;}
   }
   Check(warningCreated&&returned,"did not cancel an actual pending portal warning via walk-off");Check(g.AI.warning==null,"pending warning survived safety return");Check(g.AI.teleported.Contains("completed-route"),"completed route was removed");
   Check(!g.AI.teleported.Contains("pending-route"),"cancelled warning left an uncompleted route permanently marked");
   g.AI.x=336;g.AI.y=144;g.AiProcessing=0;g.Tick(0);Check(g.AI.warning?.id=="pending-route","cancelled route cannot retrigger");Check(g.AI.teleported.Contains("completed-route"),"retrigger lost completed route");
   for(int i=0;i<80;i++)g.Tick(NativeMotion.Step);Check(Has(g,"ai-teleport")&&g.AI.warning==null&&g.AI.teleported.Contains("pending-route"),"retriggered route never completed");
   returned=false;for(int i=0;i<720;i++){double y=g.Player.y;g.Tick(NativeMotion.Step,new MotionInput{right=true});if(y>580&&g.Player.y==324){returned=true;break;}}
   Check(returned&&g.AI.teleported.Contains("pending-route")&&g.AI.teleported.Contains("completed-route"),"a later reset erased genuinely completed routes");
  });
 }
 static void LandingCornerCases()
 {
  Case("L-shaped route keeps vertical leg then turns at recorded corner",()=>{
   var g=Game();g.Player.y=86;g.AI.flight=true;g.AI.x=160;g.AI.y=369.5;g.AI.vy=60;g.AI.trail.Clear();
   g.AI.trail.Add(new NativePoint(80,370));g.AI.trail.Add(new NativePoint(160,370));g.AI.trail.Add(new NativePoint(160,220));g.AI.trail.Add(new NativePoint(320,220));g.AI.trail.Add(new NativePoint(320,100));
   g.Tick(NativeMotion.Step);Check(!g.AI.flight,"fixture did not land");bool turned=false;
   for(int i=0;i<150;i++){g.Tick(NativeMotion.Step);if(g.AI.y>220+1e-7)Check(Math.Abs(g.AI.x-160)<1e-7,"AI cut diagonal toward current player before L corner");
    if(g.AI.x>160+1e-7){Check(Math.Abs(g.AI.y-220)<1e-7,"AI skipped the recorded horizontal leg");turned=true;}if(g.AI.x>260)break;}
   Check(turned&&g.AI.x>260,"AI never completed the first L turn");
  });
  Case("Demo repeated legal jet preserves pending chase route",()=>{
   var g=Game(NativeGameplayRules.DemoPhysics,Object("jet","physics.jet",5,11,new JObject{{"direction","up"},{"force",900},{"affectAI",true},{"range",3}}));
   g.Player.x=164;g.Player.y=323.9;g.Player.vy=60;g.AI.x=106;g.AI.y=352;g.AiProcessing=1;g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(80,370));g.AI.trail.Add(new NativePoint(100,352));g.Tick(NativeMotion.Step);Check(!g.AI.flight&&g.Player.launched,"first jet must launch player while AI follows history");
   g.Player.x=400;g.Player.y=100;g.Tick(0);int count=g.AI.trail.Count;g.ObjectStates["jet"].cooldown=0;g.Player.x=164;g.Player.y=323.9;g.Player.vx=0;g.Player.vy=60;g.Player.launched=false;g.Tick(NativeMotion.Step);
   Check(!g.AI.flight&&g.Player.vy<0,"second jet must preserve AI chase instead of relaunching it");Check(g.AI.trail.Count>=count&&count>=2,"relaunch erased retained route");
  });
  Case("legitimate airborne collectible during processing still counts",()=>{var g=Game(NativeGameplayRules.DemoPhysics,Treasure());g.AI.x=176;g.AI.y=176;g.AI.flight=true;g.AI.vy=0;g.AiProcessing=.3;g.Tick(0);Check(g.Score==10000,"valid flight pickup during processing disabled");});
  Case("Demo flight route remains bounded at 1400 samples",()=>{var g=Game();g.AI.flight=true;g.AI.x=100;g.AI.y=100;g.AI.vy=0;for(int i=0;i<1500;i++){g.Player.x=400+i%80*5;g.Tick(0);}Check(g.AI.trail.Count==1400,"flight history grew without the normal bound");});
  Case("developer safety return avoids immediate collectible spawn award",()=>{
   var pad=Object("start","common.aiStart",2,11);pad["trigger"]["mode"]="region";var treasure=Object("treasure","common.collectible",5,10);
   var g=Fixture(NativeGameplayRules.DemoPhysics,5,pad,treasure);g.Player.x=68;g.Player.y=324;g.AI.active=false;g.CourseAIActive=false;g.SetDeveloperOptions(true,true,false);g.Tick(0,new MotionInput{interactPressed=true});for(int i=0;i<60;i++)g.Tick(NativeMotion.Step);
   // A valid hollow checkpoint's saved spawn is higher than the normal floor.
   g.Checkpoint.x=324;g.Checkpoint.y=324;bool returned=false;
   for(int i=0;i<720;i++){double y=g.Player.y;g.Tick(NativeMotion.Step,new MotionInput{right=true});if(y>580&&g.Player.y==324){returned=true;break;}}
   Check(returned,"fixture did not enter lock-health return");g.Tick(NativeMotion.Step);Check(g.Score==0&&!g.Credited.Contains(g.Room.Id+"/treasure"),"developer AI reset position granted an unearned collectible");
  });
 }
 static void DeveloperResetCases()
 {
  foreach(var rules in new[]{NativeGameplayRules.Editor255Compat,NativeGameplayRules.LatestPhysics,NativeGameplayRules.DemoPhysics})foreach(string state in new[]{"recorded-trail","flight","warning"}) {string scenario=state;var mode=rules;Case("developer lock-health walk-off "+mode+" clears "+scenario,()=>{
   var pad=Object("start","common.aiStart",2,11);pad["trigger"]["mode"]="region";
   var g=Fixture(mode,5,pad);g.Player.x=68;g.Player.y=324;g.AI.active=false;g.CourseAIActive=false;g.SetDeveloperOptions(true,true,false);
   g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(g.AI.active&&g.CourseAIActive,"real E did not activate AI");
   for(int i=0;i<60;i++)g.Tick(NativeMotion.Step);g.Tokens=17;g.Charges=1;g.Score=123;g.AI.teleported.Add("completed-route");g.AI.id="preserved-ai";g.AI.tier=2;g.AI.speed=333;g.AI.steal=7;g.CourseAITier=2;g.CourseAIId="preserved-course-ai";var checkpoint=g.Checkpoint;int deaths=g.Deaths;bool staged=false,returned=false;double beforeY=0;int staleCount=0;
   // Player only receives normal right movement. Its position is never patched past the edge.
   for(int i=0;i<720;i++){
    if(!staged&&g.Player.y>580){staged=true;if(scenario=="flight"){g.AI.flight=true;g.AI.x=100;g.AI.y=100;g.AI.vx=0;g.AI.vy=-100;g.AiProcessing=3;}
     else if(scenario=="warning"){g.AI.warning=new NativeAIWarning{remaining=10,to=new NativePoint(700,200),id="old-route"};g.AiProcessing=3;}}
    beforeY=g.Player.y;staleCount=g.AI.trail.Count;g.Tick(NativeMotion.Step,new MotionInput{right=true});
    if(beforeY>580&&g.Player.y==g.Entry.Y*32+4){returned=true;break;}
   }
   Check(returned,"normal input never reached the developer return branch");
   Console.WriteLine("DEV_RETURN_EVIDENCE "+new JObject{{"scenario",scenario},{"beforePlayerY",beforeY},{"afterPlayerY",g.Player.y},{"trailBefore",staleCount},{"trailAfter",g.AI.trail.Count},{"flightAfter",g.AI.flight},{"warningAfter",g.AI.warning!=null},{"deaths",g.Deaths},{"tokens",g.Tokens},{"score",g.Score}}.ToString(Newtonsoft.Json.Formatting.None));
   Check(g.Deaths==deaths&&g.Tokens==17&&g.Charges==1&&g.Score==123,"developer safety return changed ordinary resources/deaths");
   if(scenario=="recorded-trail")Check(g.AI.trail.Count==1&&Math.Abs(g.AI.trail[0].x-(g.Player.x+12))<1e-8&&Math.Abs(g.AI.trail[0].y-(g.Player.y+14))<1e-8,"AI retains pre-return route after developer respawn");
   if(scenario=="flight")Check(!g.AI.flight&&g.AI.vx==0&&g.AI.vy==0,"AI retains pre-return ballistic state");
   if(scenario=="warning")Check(g.AI.warning==null,"AI retains pre-return portal warning");
   Check(g.AI.active&&g.CourseAIActive&&g.AI.id=="preserved-ai"&&g.AI.tier==2&&g.AI.speed==333&&g.AI.steal==7&&g.CourseAITier==2&&g.CourseAIId=="preserved-course-ai","developer return changed active identity/tier/speed/steal/course state");Check(g.AI.teleported.SequenceEqual(new[]{"completed-route"})&&ReferenceEquals(checkpoint,g.Checkpoint),"developer return reset completed route/checkpoint state");
  });}
 }
 static int Main(string[] args){source=NativeProjectLoader.LoadFile("Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json",new ImportOptions{Profile=ImportProfile.EditorAuto});string original=source.SourceSha256;bool recoveryDiagnostics=args.Contains("--recovery-diagnostics");if(args.Contains("--developer-only")){DeveloperResetCases();PendingPortalResetCase();Console.WriteLine("AI_DEVELOPER_RESET_CHECKS cases="+cases+" assertions="+assertions+" failures="+failures);return failures==0?0:1;}
  Case("flat no jet has no unexplained vertical motion",()=>{var g=Game();g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(200,370));for(int i=0;i<120;i++){double y=g.AI.y;g.Tick(NativeMotion.Step);Check(Math.Abs(g.AI.y-y)<1e-8,"flat AI rose without flight");}Check(!Has(g,"jet")&&!Has(g,"ai-recover"),"unexpected launch/recovery event");});
  foreach(var rules in new[]{NativeGameplayRules.Editor255Compat,NativeGameplayRules.LatestPhysics,NativeGameplayRules.DemoPhysics})foreach(bool affect in new[]{false,true}){var mode=rules;bool enabled=affect;Case("range jet "+mode+" affectAI="+enabled,()=>{var g=Game(mode,Object("jet","physics.jet",5,11,new JObject{{"direction","up"},{"force",900},{"affectAI",enabled},{"range",3}}));g.Player.x=164;g.Player.y=323.9;g.Player.vy=60;g.AI.x=106;g.AI.y=352;g.AiProcessing=1;Check(!MotionRect.Overlap(new MotionRect(null,g.AI.x-12,g.AI.y-14,24,28),g.ObjectRect(g.Room.Objects[0])),"setup AI touches jet");g.Tick(NativeMotion.Step);Check(Has(g,"jet"),"real player landing did not fire");Check(g.AI.flight==(enabled&&mode!=NativeGameplayRules.DemoPhysics),"profile jet chase/ballistics changed");Check(g.ObjectStates["jet"].hitAI==enabled,"configured range/affectAI influence changed");if(enabled&&mode!=NativeGameplayRules.DemoPhysics)Check(g.AI.vy<0,"legacy configured AI launch removed");});}
  Case("Demo records player trail during ballistic flight",()=>{var g=Game();g.AI.flight=true;g.AI.x=100;g.AI.y=100;g.AI.vy=-100;g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(100,100));g.Tick(NativeMotion.Step);Check(g.AI.trail.Count>=2,"flight discarded current player route");});
  Case("Demo landing resumes nearest historical trail suffix",()=>{var g=Game();g.AI.flight=true;g.AI.x=160;g.AI.y=369.5;g.AI.vy=60;g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(80,370));g.AI.trail.Add(new NativePoint(160,370));g.AI.trail.Add(new NativePoint(240,250));g.AI.trail.Add(new NativePoint(320,150));g.Tick(NativeMotion.Step);Check(!g.AI.flight,"setup did not land");Check(g.AI.trail.Count>1,"landing erased history into a single fresh pc");Check(Math.Abs(g.AI.trail[0].x-160)<1e-8,"landing did not choose closest historical point");double y=g.AI.y;g.Tick(NativeMotion.Step);Check(Math.Abs(g.AI.y-y)<=g.AI.speed*NativeMotion.Step+1e-8,"trail reentry teleported vertically");});
  if(recoveryDiagnostics){
  Case("Demo out of bounds warns instead of instantaneous same-height warp",()=>{var g=Game();RecoverSetup(g);double before=g.AI.y;g.Tick(NativeMotion.Step);Check(Math.Abs(g.AI.y-before)<20,"AI jumped from pit to player height in one tick");Check(Recovery(g)!=null,"no explicit recovery phase");Check(Has(g,"ai-recover-warning"),"recovery has no semantic warning");});
  Case("Demo pit recovery cannot claim treasure in same frame",()=>{var g=Game(NativeGameplayRules.DemoPhysics,Treasure());RecoverSetup(g);g.Tick(NativeMotion.Step);Check(g.Score==0&&!g.Credited.Contains(g.Room.Id+"/treasure"),"recovery warp incorrectly awarded 10000");});
  Case("Demo recovery destination is safe and excludes unclaimed treasure",()=>{var g=Game(NativeGameplayRules.DemoPhysics,Treasure());RecoverSetup(g);g.Tick(NativeMotion.Step);var state=RecoveryJson(g);Check(state!=null,"recovery state missing");var target=state["to"];double x=(double)target["x"],y=(double)target["y"];Check(g.SafePosition(x-12,y-14),"target overlaps solid or hazard");Check(!MotionRect.Overlap(new MotionRect(null,x-12,y-14,24,28),g.ObjectRect(g.Room.Objects[0])),"target overlaps unclaimed treasure");WaitArrived(g);Check(Has(g,"ai-recover"),"arrival has no explicit recovery event");Check(g.Score==0,"arrival awarded treasure");});
  Case("Demo recovery protection blocks pickup and catch only during recovery",()=>{var g=Game(NativeGameplayRules.DemoPhysics,Treasure());RecoverSetup(g);g.Tick(NativeMotion.Step);WaitArrived(g);g.AI.x=176;g.AI.y=176;g.Player.x=164;g.Player.y=162;g.Player.invulnerable=0;g.AiProcessing=0;g.AiCooldown=0;g.Tokens=10;g.Tick(0);g.CatchPlayer();Check(g.Score==0&&g.AiHits==0&&g.Tokens==10,"protection collected or caught");g.Player.x=500;g.Player.y=356;g.Player.invulnerable=100;for(int i=0;i<90;i++)g.Tick(NativeMotion.Step);Check(Recovery(g)==null,"recovery protection never ended");g.AI.x=176;g.AI.y=176;g.AI.flight=true;g.AI.vy=0;g.AiProcessing=.3;g.Tick(0);Check(g.Score==10000,"ordinary valid AI pickup during processing was disabled");});
  }
  foreach(var rules in new[]{NativeGameplayRules.Editor255Compat,NativeGameplayRules.LatestPhysics}){var mode=rules;Case("legacy landing and recovery schema preserved "+mode,()=>{var g=Game(mode);g.AI.flight=true;g.AI.x=160;g.AI.y=369.5;g.AI.vy=60;g.AI.trail.Clear();g.AI.trail.Add(new NativePoint(80,370));g.Tick(NativeMotion.Step);Check(g.AI.trail.Count==1,"old landing behavior changed");RecoverSetup(g);g.Tick(NativeMotion.Step);Check(Math.Abs(g.AI.y-(g.Player.y+14))<1e-8,"old fallback behavior changed");Check(Recovery(g)==null&&!Has(g,"ai-recover-warning"),"Demo recovery leaked into legacy");Check(g.Snapshot()["ai"]["recovery"]==null,"legacy diagnostic schema gained recovery");});}
  if(recoveryDiagnostics)Case("Retry room load and Continue clear recovery",()=>{var g=Game();SetRecovery(g);g.Retry();Check(Recovery(g)==null,"Retry retained recovery");SetRecovery(g);g.LoadRoom(g.Room.Id);Check(Recovery(g)==null,"room load retained recovery");SetRecovery(g);var saved=g.ExportContinuation();var resumed=NativeMotion.FromContinuation(g.Project,saved,g.Rules);Check(Recovery(resumed)==null,"Continue retained live recovery");});
  LandingCornerCases();DeveloperResetCases();PendingPortalResetCase();
  Check(NativeProjectLoader.Sha(File.ReadAllBytes("Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json"))==original,"source JSON changed");
  Console.WriteLine("AI_JUMP_CHECKS cases="+cases+" assertions="+assertions+" failures="+failures+" sourceUnchanged=true");return failures==0?0:1;
 }
}







