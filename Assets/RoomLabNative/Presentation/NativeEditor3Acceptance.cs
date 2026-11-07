using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace RoomLab.Native {
// Explicit verification only; never executes during a normal game.
public static class NativeEditor3Acceptance {
 static readonly BindingFlags Flags=BindingFlags.Instance|BindingFlags.NonPublic;
 static object Call(object app,string name,params object[] args){return app.GetType().GetMethod(name,Flags).Invoke(app,args);}
 static object Field(object app,string name){return app.GetType().GetField(name,Flags).GetValue(app);}
 static void Check(bool value,string message){if(!value)throw new Exception("Editor3 acceptance: "+message);}
 static void Click(NativePhysicsDemoPlayer app,string label){var button=((RectTransform)Field(app,"panels")).GetComponentsInChildren<Button>().First(b=>b.GetComponentInChildren<Text>()?.text==label);button.onClick.Invoke();}
 public static int Run(NativePhysicsDemoPlayer app,NativeProject source,string directory){
  var custom=NativeProjectLoader.LoadFile(Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Editor3/Verification/custom-seed-id.zip"),new ImportOptions{RequireAssets=true});
  var customCourse=custom.Courses.First(c=>c.Kind=="calculus");var customRoom=customCourse.Rooms.First(r=>r.Objects.Any(o=>o.Type=="calculus.integral"));var customObject=customRoom.Objects.First(o=>o.Type=="calculus.integral");
  using(var customAssets=NativeDemoAssets.Decode(custom)){string binding=NativeDemoAssets.Binding(custom,customCourse,customRoom,"calculus.integral","idle",customObject);Check(binding=="seed-calculus-integral"&&customAssets.Has(binding),"build6 custom seed binding decode");Check(NativeProjectLoader.Sha(custom.Assets.First(a=>a.Id==binding).Bytes)=="4f7197592a0cfd1a9c92fc2c3c499db0a2be7eea653c86dca9c2169a4e8efbf4","build6 custom bytes preserved");using(var world=new NativePixelWorld(new NativeMotion(custom,customCourse.Id,customRoom.Id,NativeGameplayRules.DemoPhysics),customAssets,false)){world.Refresh(0,(Camera)Field(app,"view"),false);var renderer=world.Root.GetComponentsInChildren<SpriteRenderer>(true).First(r=>r.name==customObject.Id);Check(renderer.sprite==customAssets.Get(binding,0,custom.Assets.First(a=>a.Id==binding).Fps),"same seed ID custom art replaced by fallback");}}
  var defaultTheme=NativeProjectLoader.LoadFile(Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Editor3/editor3-three-themes.zip"),new ImportOptions{RequireAssets=true});var mathCourse=defaultTheme.Courses.First(c=>c.Kind=="calculus");var mathRoom=mathCourse.Rooms.First(r=>r.Objects.Any(o=>o.Type=="calculus.integral"));var integral=mathRoom.Objects.First(o=>o.Type=="calculus.integral");
  using(var decoded=NativeDemoAssets.Decode(defaultTheme))using(var world=new NativePixelWorld(new NativeMotion(defaultTheme,mathCourse.Id,mathRoom.Id,NativeGameplayRules.DemoPhysics),decoded,false)){world.Refresh(0,(Camera)Field(app,"view"),false);var renderer=world.Root.GetComponentsInChildren<SpriteRenderer>(true).First(r=>r.name==integral.Id);Check(renderer.sprite.texture==Resources.Load<Texture2D>("PhysicsPixel/calculus-world"),"external default integral did not use calculus world art");}
  Debug.Log("NATIVE_EDITOR3_BUILD6_ASSETS_PASS customSameId=true preservedBytes=true decodedBinding=true customRendered=true externalDefaultNewArt=true");
  Directory.CreateDirectory(directory);var document=(JObject)source.OriginalJson.DeepClone();var courses=(JArray)document["courses"];var second=(JObject)courses[0].DeepClone();var ids=second.Descendants().OfType<JProperty>().Where(p=>p.Name=="id").Select(p=>(string)p.Value).ToHashSet();foreach(var value in second.Descendants().OfType<JValue>().ToList())if(value.Type==JTokenType.String&&value.Parent is JProperty reference&&new[]{"id","parentId","padId","roomId","exitId","entryId","zoneId","unlockPadId","aiId"}.Contains(reference.Name)&&ids.Contains((string)value))value.Value="accept-"+(string)value;second["name"]="Acceptance second physics";courses.Add(second);Check((string)second["kind"]=="physics"&&courses.Count==2,"fixture must retain two physics courses");
  var file=Path.Combine(directory,"multi-physics.json");File.WriteAllText(file,document.ToString());
  var before=app.Game;int score=before.Score;Check(!app.ImportFile(file),"multiple courses must prompt");Check(ReferenceEquals(before,app.Game),"prompt replaced game");Click(app,"取消");Check(ReferenceEquals(before,app.Game)&&app.Game.Score==score,"cancel lost state");
  app.ImportFile(file);Click(app,"2. Acceptance second …");Check(app.Game.Course.Id==(string)second["id"],"selection ignored id");var identity=(string)Field(app,"identity");Call(app,"NewGame");Check(app.Game.Course.Id==(string)second["id"],"new game lost selection");Call(app,"SaveProgress");Check((bool)Call(app,"CanContinue"),"continuation absent");Call(app,"Continue");Check(app.Game.Course.Id==(string)second["id"],"continue changed course");Check(app.TryRestoreImport()&&app.Game.Course.Id==(string)second["id"],"persisted selection restore failed");Check((string)Field(app,"identity")==identity,"restore identity changed");
  foreach(string kind in new[]{"calculus","slacker"}){
   // The user moved legacy examples behind the arrow sequence. Exercise that production
   // entry and the real example button; do not restore removed normal-menu controls for tests.
   Call(app,"Show","menu");float keyTime=Time.unscaledTime;foreach(var key in new[]{KeyCode.UpArrow,KeyCode.UpArrow,KeyCode.DownArrow,KeyCode.DownArrow,KeyCode.LeftArrow,KeyCode.RightArrow,KeyCode.LeftArrow,KeyCode.RightArrow}){Call(app,"FeedHiddenDeveloperKey",key,keyTime);keyTime+=.1f;}
   Check((string)Field(app,"page")=="developer","arrow code legacy examples entry");Click(app,"关卡与导入");var button=((RectTransform)Field(app,"panels")).GetComponentsInChildren<Button>().First(b=>b.GetComponentInChildren<Text>()?.text.Contains(kind=="calculus"?"高数":"水课")==true);button.onClick.Invoke();Check(app.Game.Course.Kind==kind,"builtin theme button");Call(app,"NewGame");Call(app,"SaveProgress");Check((bool)Call(app,"CanContinue"),"theme continue missing");Call(app,"Continue");Check(app.Game.Course.Kind==kind,"theme continue selection");
   if(kind=="slacker"){var checkin=app.Game.Room.Objects.First(o=>o.Type=="slacker.checkin");typeof(NativeMotion).GetMethod("Fire",Flags).Invoke(app.Game,new object[]{checkin});Call(app,"PumpSounds");Check(((string)Field(app,"notice")).Contains("第 1 次记录"),"checkin feedback is visible");}

  }
  using(var assets=NativeDemoAssets.Decode(source)){
   var iceRoom=source.Courses[0].Rooms.First(r=>r.Objects.Any(o=>o.Type=="physics.ice"));var iceMotor=new NativeMotion(source,source.Courses[0].Id,iceRoom.Id,NativeGameplayRules.DemoPhysics);
   using(var iceWorld=new NativePixelWorld(iceMotor,assets,true)){var ice=iceRoom.Objects.First(o=>o.Type=="physics.ice");iceMotor.ObjectStates[ice.Id].solid=false;iceWorld.Refresh(0,(Camera)Field(app,"view"),false);var melt=iceWorld.Root.GetComponentsInChildren<SpriteRenderer>(true).First(r=>r.name==ice.Id);Check(melt.enabled&&melt.color.a<.4f,"melt residue visibility");Check(Math.Abs(melt.sprite.rect.height*melt.transform.localScale.y-3)<.01,"melt residue height");Check(!iceMotor.ObjectStates[ice.Id].solid,"melt collision state");}
   var motor=new NativeMotion(source,rules:NativeGameplayRules.DemoPhysics);using(var world=new NativePixelWorld(motor,assets,true)){
    var exit=motor.Room.Exits[0];var renderer=world.Root.GetComponentsInChildren<SpriteRenderer>(true).First(s=>s.name.StartsWith("Lab exit"));Check(Math.Abs(renderer.transform.position.x-(exit.X+exit.W/2.0))<.001,"exit center");Check(Math.Abs(renderer.sprite.rect.width*renderer.transform.localScale.x-64)<.01,"exit width");Check(Math.Abs(renderer.sprite.rect.height*renderer.transform.localScale.y-96)<.01,"exit height");
   }
  }
  DreamState(app);
  CustomThermal(app,source,directory);
  Debug.Log("NATIVE_EDITOR3_UI_PASS selection=true cancel=true newGame=true continue=true persistedRestore=true exitGeometry=true");return 12;
 }
 static void CustomThermal(NativePhysicsDemoPlayer app,NativeProject source,string directory){
  var texture=new Texture2D(2,2,TextureFormat.RGBA32,false);texture.SetPixels(new[]{Color.magenta,Color.magenta,Color.magenta,Color.magenta});texture.Apply();byte[] png=texture.EncodeToPNG();UnityEngine.Object.Destroy(texture);
  foreach(string boundState in new[]{"cold","hot"}){
   var doc=(JObject)source.OriginalJson.DeepClone();const string assetId="accept-custom-thermal";((JArray)doc["assets"]).Add(new JObject{{"id",assetId},{"path","assets/accept-thermal.png"},{"mime","image/png"},{"width",2},{"height",2}});
   foreach(JObject c in (JArray)doc["courses"])foreach(JObject room in (JArray)c["rooms"]){room["artBindings"]=new JObject{{"background",assetId},{"physics.thermal",new JObject()}};foreach(JObject o in (JArray)room["objects"])if((string)o["type"]=="physics.thermal")o["assetOverrides"]=new JObject{{boundState,assetId}};}
   if(doc["blockDefaults"]?["physics.thermal"] is JObject defaults)defaults["assets"]=new JObject();
   string file=Path.Combine(directory,"thermal-"+boundState+".zip");using(var output=File.Create(file))using(var zip=new System.IO.Compression.ZipArchive(output,System.IO.Compression.ZipArchiveMode.Create)){void Add(string path,byte[] bytes){using(var stream=zip.CreateEntry(path).Open())stream.Write(bytes,0,bytes.Length);}Add("project.json",System.Text.Encoding.UTF8.GetBytes(doc.ToString()));foreach(var a in source.Assets)Add(a.Path,a.Bytes);Add("assets/accept-thermal.png",png);}
   var data=NativeProjectLoader.LoadFile(file,new ImportOptions{RequireAssets=true});var roomData=data.Courses[0].Rooms.First(r=>r.Objects.Any(o=>o.Type=="physics.thermal"));var game=new NativeMotion(data,data.Courses[0].Id,roomData.Id,NativeGameplayRules.DemoPhysics);var thermal=roomData.Objects.First(o=>o.Type=="physics.thermal");
   using(var decoded=NativeDemoAssets.Decode(data))using(var world=new NativePixelWorld(game,decoded,false)){
    var renderers=world.Root.GetComponentsInChildren<SpriteRenderer>(true);var device=renderers.First(r=>r.name==thermal.Id);var consoles=(Dictionary<string,SpriteRenderer>)Field(world,"consoles");var console=consoles[thermal.Id];var background=renderers.First(r=>r.name=="Laboratory background");
    foreach(string temperature in new[]{"cold","hot","cold"}){game.RoomEnvironment=temperature;foreach(var key in game.Zones.Keys.ToArray())game.Zones[key]=temperature;world.Refresh(0,(Camera)Field(app,"view"),false);bool custom=temperature==boundState;Check(console.enabled==!custom,"custom thermal overlay state "+boundState+"/"+temperature);if(custom){Check(device.color==Color.white,"custom thermal tinted");Check(device.sprite==decoded.Get(assetId,game.RoomTime),"custom thermal sprite ignored");}Check(background.color==Color.white,"custom background tinted");}
   }
  }
  Debug.Log("NATIVE_EDITOR3_CUSTOM_ART_PASS coldOnly=true hotOnly=true transitions=6 backgroundUntinted=true");
 }

 static void DreamState(NativePhysicsDemoPlayer app){
  var file=Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Editor3/editor3-three-themes.zip");var project=NativeProjectLoader.LoadFile(file);var course=project.Courses.First(c=>c.Kind=="slacker");var room=course.Rooms.First(r=>r.Objects.Any(o=>o.Type=="slacker.awake"));var game=new NativeMotion(project,course.Id,room.Id,NativeGameplayRules.DemoPhysics);var awake=room.Objects.First(o=>o.Type=="slacker.awake");var parent=new GameObject("Dream acceptance parent");
  try{using(var dream=new NativeDreamPresentation(game,parent.transform)){
   Check(dream.Clarity==0,"dream starts sleepy");Call(game,"Fire",awake);dream.Refresh(.01);Check(dream.Clarity>0,"real awake did not clear dream mist");float clarity=dream.Clarity;game.Mode="paused";dream.Refresh(.5);Check(dream.Clarity==clarity,"pause consumed dream effect");game.Mode="playing";game.RespawnRemaining=0;game.Retry();dream.Refresh(.01);Check(dream.Clarity==0,"retry retained stale wake effect");
  }
  var restored=NativeMotion.FromContinuation(project,game.ExportContinuation(),NativeGameplayRules.DemoPhysics);using(var dream=new NativeDreamPresentation(restored,parent.transform)){dream.Refresh(.01);Check(dream.Clarity==0,"continuation falsely triggered wake effect");}
  }finally{UnityEngine.Object.Destroy(parent);}
  Debug.Log("NATIVE_DREAM_STATE_PASS realFire=true pause=true retry=true continuation=true");
 }

}}
