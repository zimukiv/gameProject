using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RoomLab.Native;
class Program
{
 static int checks,frames;static readonly string Root=Directory.GetCurrentDirectory();
 static void Check(bool ok,string message){checks++;if(!ok)throw new Exception(message);}
 static NativeProject Load(string relative)=>NativeProjectLoader.LoadFile(Path.Combine(Root,relative),new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});
 static void Patch(object target,JObject values,bool game=false){if(values==null)return;foreach(var pair in values){string name=game?char.ToUpperInvariant(pair.Key[0])+pair.Key.Substring(1):pair.Key;var f=target.GetType().GetField(name);if(f==null)throw new Exception("No patch field "+name);f.SetValue(target,pair.Value.Type==JTokenType.Null?null:pair.Value.ToObject(f.FieldType));}}
 static JObject Player(MotionPlayer p)=>JObject.FromObject(p);
 static bool SemanticEqual(JToken a,JToken b){if(a==null||b==null)return a==b;bool an=a.Type==JTokenType.Integer||a.Type==JTokenType.Float,bn=b.Type==JTokenType.Integer||b.Type==JTokenType.Float;if(an&&bn)return Math.Abs(a.Value<double>()-b.Value<double>())<=.001;if(a is JObject ao&&b is JObject bo)return ao.Properties().Count()==bo.Properties().Count()&&ao.Properties().All(p=>SemanticEqual(p.Value,bo[p.Name]));if(a is JArray aa&&b is JArray ba)return aa.Count==ba.Count&&aa.Select((v,i)=>SemanticEqual(v,ba[i])).All(v=>v);return JToken.DeepEquals(a,b);}
 static void Compare(NativeMotion g,JObject expected,string name)
 {
  foreach(var k in new[]{"tokens","charges","recharge","score","deaths","steals"}){var actual=g.GetType().GetField(char.ToUpperInvariant(k[0])+k.Substring(1)).GetValue(g);Check(Convert.ToInt32(actual)==expected[k].Value<int>(),name+"/"+k);}
  Check(g.Mode==expected["mode"].Value<string>(),name+" mode");
  foreach(var k in new[]{"elapsed","roomTime","respawnRemaining"}){double a=(double)g.GetType().GetField(char.ToUpperInvariant(k[0])+k.Substring(1)).GetValue(g);Check(Math.Abs(a-expected[k].Value<double>())<=1e-5,name+"/"+k);}
  var got=Player(g.Player);foreach(var pair in (JObject)expected["player"]){if(pair.Key=="rail")continue;var a=got[pair.Key];if(pair.Value.Type==JTokenType.Float||pair.Value.Type==JTokenType.Integer)Check(Math.Abs(a.Value<double>()-pair.Value.Value<double>())<=.001,name+"/player."+pair.Key+" got="+a+" expected="+pair.Value);else Check(JToken.DeepEquals(a,pair.Value),name+"/player."+pair.Key+" got="+a+" expected="+pair.Value);}
 }
 static void Replay(string name)
 {
  var trace=JObject.Parse(File.ReadAllText(Path.Combine(Root,"Validation/Native/Traces",name+".json")));var project=Load("Validation/Native/"+(string)trace["project"]);
  var g=new NativeMotion(project,(string)trace["courseId"],(string)trace["roomId"]);var setup=trace["setup"] as JObject;Patch(g,setup?["game"] as JObject,true);Patch(g.Player,setup?["player"] as JObject);Compare(g,(JObject)trace["initial"],name+" initial");
  foreach(JObject frame in (JArray)trace["frames"]){g.ClearEvents();string op=(string)frame["op"];switch(op){case "tick":g.Tick(frame["dt"]==null?NativeMotion.Step:frame["dt"].Value<double>(),frame["input"]==null?default(MotionInput):frame["input"].ToObject<MotionInput>());break;case "patch":Patch(g,frame["game"] as JObject,true);Patch(g.Player,frame["player"] as JObject);break;case "launch":g.Launch(frame["x"].Value<double>(),frame["y"].Value<double>());break;case "pause":g.TogglePause();break;case "retry":g.Retry((string)frame["reason"]??"重试当前房间");break;default:throw new Exception("Unsupported P2 op "+op);}
   Compare(g,(JObject)frame["expected"],name+"/"+frame["index"]);Check(SemanticEqual(JArray.FromObject(g.Events),frame["events"]),name+" events "+frame["index"]+" got="+JArray.FromObject(g.Events).ToString(Formatting.None)+" expected="+frame["events"]);frames++;
  }
  Console.WriteLine("MOTION_ORACLE_PASS "+name+" frames="+((JArray)trace["frames"]).Count);
 }
 static NativeMotion Scenario()=>new NativeMotion(Load("Validation/Native/Scenarios/movement.project.json"));
 static void Additional()
 {
  foreach(int fps in new[]{30,60,120,144}){var a=Scenario();var clock=new NativeInputTimeline();for(int i=0;i<fps;i++)clock.Advance(a,1.0/fps,new MotionInput{right=true});var b=Scenario();for(int i=0;i<120;i++)b.Tick(NativeMotion.Step,new MotionInput{right=true});Check(Math.Abs(a.Player.x-b.Player.x)<.001,"FPS position "+fps);Check(Math.Abs(a.Elapsed-b.Elapsed)<1e-6,"FPS elapsed "+fps);Check(!clock.ProtectionPaused&&clock.PendingEdges==0,"FPS queue "+fps);}
  var g=Scenario();g.Player.y=100;g.Player.grounded=false;var c=new NativeInputTimeline();c.Advance(g,.001,new MotionInput{right=true,dashPressed=true});c.Advance(g,.001,new MotionInput{left=true,dashPressed=true});c.Advance(g,.02,default(MotionInput));Check(g.Player.dashCount==2&&g.Charges==2&&g.Player.dashX==-1,"Ordered substep double presses");
  var paused=Scenario();var q=new NativeInputTimeline();q.Advance(paused,.001,new MotionInput{jumpPressed=true});q.LoseFocus(paused);Check(paused.Mode=="paused"&&q.PendingEdges==0&&q.PendingSeconds==0,"Focus clears input");paused.TogglePause();q.Advance(paused,.02,default(MotionInput));Check(paused.Player.buffer==0,"No stale focus input");
  q.Advance(paused,1,new MotionInput{dashPressed=true});Check(q.ProtectionPaused&&paused.Mode=="paused"&&q.PendingEdges==0,"Observable overload protection");q.Reset();paused.TogglePause();q.Advance(paused,.02,default(MotionInput));Check(paused.Player.dashCount==0,"No overload replay");
  g=Scenario();g.Player.y=100;g.Player.grounded=false;g.Tick(NativeMotion.Step,new MotionInput{right=true,up=true,dashPressed=true});Check(g.Player.vy==0&&g.Player.dashY==0,"No diagonal dash");
  var physical=new NativeKeyboardEvents();physical.Bind(1,MotionBinding.Right);physical.Bind(2,MotionBinding.Left);physical.Bind(3,MotionBinding.Dash);physical.Bind(4,MotionBinding.Up|MotionBinding.Jump);physical.Apply(1,true);physical.Apply(3,true);physical.Apply(3,true);physical.Apply(3,false);physical.Apply(1,false);physical.Apply(2,true);physical.Apply(3,true);Check(physical.PendingEdges==2,"Raw physical down/up/down is not collapsed; OS repeat ignored");Check(physical.TryRead(out var edge1)&&edge1.right&&edge1.dashPressed&&!edge1.left,"First raw edge direction");Check(physical.TryRead(out var edge2)&&edge2.left&&edge2.dashPressed&&!edge2.right,"Second raw edge direction");physical.DiscardEdges();Check(physical.Held.left&&physical.PendingEdges==0,"Pause discards edges but tracks held keys");physical.Clear();Check(!physical.Held.left&&!physical.Held.right,"Focus clears physical held state");
  for(int i=0;i<4;i++){string d=new[]{"up","down","left","right"}[i];var r=new MotionRect(null,100,100,32,32);Check(!NativeMotion.SpikeTouches(new MotionRect(null,0,0,24,28),r,d),"Distant spike "+d);}
  var demo=Load("Assets/RoomLabNative/Resources/NativePrototype.json");int smoke=NativeMotionSmokeChecks.Run(demo);checks+=smoke;Console.WriteLine("MOTION_CONTACT_PASS checks="+smoke);RailOracle(demo);
  var locked=(JObject)demo.NormalizedJson.DeepClone();var lockedRail=(JObject)locked["courses"][0]["rooms"][0]["objects"].First(o=>(string)o["type"]=="physics.rail");lockedRail["params"]["allowExit"]=false;var lockedData=NativeProjectLoader.LoadBytes(System.Text.Encoding.UTF8.GetBytes(locked.ToString()),"json");var lockedGame=new NativeMotion(lockedData);var lockedObject=lockedGame.Room.Objects.Find(o=>o.Type=="physics.rail");lockedGame.Player.x=lockedObject.X*32+4;lockedGame.Player.y=lockedObject.Y*32-28;lockedGame.Player.grounded=true;lockedGame.Tick(NativeMotion.Step);lockedGame.Tick(NativeMotion.Step,new MotionInput{jumpPressed=true,dashPressed=true});Check(lockedGame.Player.rail!=null&&lockedGame.Player.freeDash&&lockedGame.Charges==3,"Locked rail ignores jump/dash detach without spending resources");
 }
 static void RailOracle(NativeProject project)
 {
  var g=new NativeMotion(project);var o=g.Room.Objects.Find(v=>v.Id=="prototype-rail");g.Player.x=o.X*32+4;g.Player.y=o.Y*32-28;g.Player.grounded=true;
  var trace=JObject.Parse(File.ReadAllText(Path.Combine(Root,"Validation/Native/P2/rail-oracle.json")));int i=0;
  foreach(JObject frame in (JArray)trace["frames"]){g.ClearEvents();g.Tick(NativeMotion.Step);foreach(string key in new[]{"x","y","vx","vy"})Check(Math.Abs((double)typeof(MotionPlayer).GetField(key).GetValue(g.Player)-frame[key].Value<double>())<=.001,"Rail frame "+i+" "+key);
   Check(g.Tokens==frame["tokens"].Value<int>()&&g.Charges==frame["charges"].Value<int>()&&g.Recharge==frame["recharge"].Value<int>()&&g.Score==frame["score"].Value<int>(),"Rail resources "+i);Check(SemanticEqual(JArray.FromObject(g.Events),frame["events"]),"Rail events "+i);
   Check((g.Player.rail==null)==(frame["rail"].Type==JTokenType.Null),"Rail state "+i);if(g.Player.rail!=null)foreach(string key in new[]{"speed","distance","total"})Check(Math.Abs((double)typeof(MotionRail).GetField(key).GetValue(g.Player.rail)-frame["rail"][key].Value<double>())<=.001,"Rail "+key);i++;
  }Console.WriteLine("MOTION_RAIL_ORACLE_PASS frames="+i);
 }
 static int Main(){try{foreach(var name in new[]{"actual-room-enter","movement","jump-coyote","jump-buffer","dash-and-land","jet-launch","actual-jet-trigger","respawn-buffer"})Replay(name);Additional();Console.WriteLine("NATIVE_MOTION_PASS checks="+checks+" oracleCases=8 oracleFrames="+frames+" fixedHz=120 renderRates=30/60/120/144");return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
